import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { computeEffectiveStatuses } from '../../common/asset-status';
import { arranqueDeDiagnostico, EntradaDeArranque } from './arranque-de-diagnostico';
import { papelDe } from './dependencias';

/**
 * EL ARRANQUE DE DIAGNÓSTICO, CON DATOS REALES — bloque 51.
 *
 * =============================================================================
 *  NO AÑADE NINGÚN DATO NUEVO
 * =============================================================================
 *  Todo lo que sirve aquí ya estaba en la base: los enlaces de red, el tablero
 *  de montaje, el historial de órdenes y el almacén. Lo único que hace este
 *  servicio es traerlo TODO JUNTO en una sola llamada, para que el técnico no
 *  tenga que abrir cuatro pantallas de madrugada, con el celular, de pie
 *  delante de un poste.
 *
 * =============================================================================
 *  POR QUÉ ES UNA LLAMADA APARTE Y NO PARTE DE `GET /assets/:id`
 * =============================================================================
 *  La ficha del activo se abre cientos de veces al día para mirar la marca o
 *  la IP. Este cálculo recorre los enlaces de red y consulta el almacén; meterlo
 *  en la carga principal haría más lenta la operación normal para servir un dato
 *  que sólo interesa cuando algo está roto.
 *
 *  La pantalla lo pide APARTE y si falla no dice nada: la ficha del activo
 *  tiene que seguir sirviendo aunque la red esté a medio cargar.
 */
@Injectable()
export class ArranqueService {
  constructor(private readonly prisma: PrismaService) {}

  async delActivo(assetId: string) {
    const activo = await this.prisma.asset.findFirst({
      where: { id: assetId, deletedAt: null },
      select: {
        id: true, assetCode: true, type: true, status: true, model: true,
        medioAcceso: true, alturaMetros: true, tableroId: true,
        tableroMontaje: { select: { codigo: true } },
      },
    });
    if (!activo) throw new NotFoundException('Ese equipo no está en el sistema.');

    /* ------------------------------------------------------------------
       DE QUÉ CUELGA. Se mira en las DOS fuentes, en orden de fiabilidad:
         1. El puerto de switch donde está enchufado — es el dato que se
            registra al cablear, así que es el más fiable.
         2. Un enlace declarado (fibra, radioenlace) — para lo que no pasa
            por un puerto, como una cámara colgada de una antena.
       ------------------------------------------------------------------ */
    const [puerto, enlaces] = await Promise.all([
      this.prisma.switchPort.findFirst({
        where: { connectedAssetId: assetId },
        select: { switchId: true },
      }),
      this.prisma.networkLink.findMany({
        where: { OR: [{ endpointAId: assetId }, { endpointBId: assetId }] },
        select: { endpointAId: true, endpointBId: true },
      }),
    ]);

    let soporteId: string | null = puerto?.switchId ?? null;
    if (!soporteId && enlaces.length) {
      const e = enlaces[0];
      soporteId = e.endpointAId === assetId ? e.endpointBId : e.endpointAId;
    }

    // ---------------------------------------------------- los vecinos
    let soporte: { id: string; assetCode: string; type: string; status: string } | null = null;
    let vecinosCrudos: { id: string; assetCode: string; status: string }[] = [];

    if (soporteId) {
      soporte = await this.prisma.asset.findFirst({
        where: { id: soporteId, deletedAt: null },
        select: { id: true, assetCode: true, type: true, status: true },
      });

      if (soporte) {
        /* Los que cuelgan del mismo soporte, por las dos vías y sin contar
           a éste. Se usa un Map para que un equipo enlazado por puerto Y por
           enlace declarado no salga dos veces e infle la comparación. */
        const [porPuerto, porEnlace] = await Promise.all([
          this.prisma.switchPort.findMany({
            where: { switchId: soporteId, connectedAssetId: { not: null } },
            select: { connectedAssetId: true },
          }),
          this.prisma.networkLink.findMany({
            where: { OR: [{ endpointAId: soporteId }, { endpointBId: soporteId }] },
            select: { endpointAId: true, endpointBId: true },
          }),
        ]);

        const ids = new Set<string>();
        for (const p of porPuerto) if (p.connectedAssetId) ids.add(p.connectedAssetId);
        for (const e of porEnlace) {
          ids.add(e.endpointAId === soporteId ? e.endpointBId : e.endpointAId);
        }
        ids.delete(assetId);
        ids.delete(soporteId);

        if (ids.size) {
          vecinosCrudos = await this.prisma.asset.findMany({
            where: { id: { in: [...ids] }, deletedAt: null },
            select: { id: true, assetCode: true, status: true },
          });
        }
      }
    }

    /* El estado que vale es el DERIVADO, no la columna: una cámara con una
       incidencia abierta sigue diciendo OPERATIVO en `status`, y compararla
       así daría un descarte al revés — diría que los vecinos están bien
       cuando están caídos. */
    const paraEstado = [
      { id: activo.id, status: activo.status as string },
      ...(soporte ? [{ id: soporte.id, status: soporte.status as string }] : []),
      ...vecinosCrudos.map((v) => ({ id: v.id, status: v.status as string })),
    ];
    const eff = await computeEffectiveStatuses(this.prisma, paraEstado as any);

    // -------------------------------------------------- el historial
    const hace90 = new Date(Date.now() - 90 * 86_400_000);
    const [ultima, fallas] = await Promise.all([
      this.prisma.workOrder.findFirst({
        where: { assetId, status: 'CERRADA' as any },
        orderBy: { endedAt: 'desc' },
        select: { endedAt: true, rootCause: true, diagnosis: true },
      }),
      this.prisma.incident.count({
        where: { assetId, reportedAt: { gte: hace90 } },
      }),
    ]);

    /* El diagnóstico escrito a mano vale más que el enum: dice «humedad en el
       prensaestopas» donde el enum dice «AMBIENTAL». Se prefiere el texto y se
       cae al código sólo si nadie escribió nada. */
    const causa = (ultima?.diagnosis || '').trim()
      || (ultima?.rootCause ? String(ultima.rootCause).replace(/_/g, ' ').toLowerCase() : null);

    // ---------------------------------------------------- el repuesto
    const compatibles = await this.prisma.sparePartAsset.findMany({
      where: { assetId },
      select: { sparePart: { select: { name: true, currentStock: true } } },
    });

    /* Si NADIE declaró un repuesto compatible, la respuesta es «no consta»,
       no «no hay». Confundirlos hace que el técnico desista de buscar algo
       que quizá está en el almacén. */
    let repuestoDisponible: number | null = null;
    let repuestoNombre: string | null = null;
    if (compatibles.length) {
      const conStock = compatibles.find((c) => (c.sparePart?.currentStock ?? 0) > 0);
      repuestoDisponible = compatibles.reduce(
        (s, c) => s + (c.sparePart?.currentStock ?? 0), 0,
      );
      repuestoNombre = (conStock ?? compatibles[0]).sparePart?.name ?? null;
    }

    const entrada: EntradaDeArranque = {
      codigo: activo.assetCode,
      tipo: activo.type as string,
      estado: eff[activo.id] ?? (activo.status as string),
      soporteCodigo: soporte?.assetCode ?? null,
      soportePapel: soporte ? papelDe(soporte.type as string) : null,
      soporteEstado: soporte ? (eff[soporte.id] ?? (soporte.status as string)) : null,
      vecinos: vecinosCrudos.map((v) => ({
        id: v.id,
        codigo: v.assetCode,
        estado: eff[v.id] ?? (v.status as string),
      })),
      enTablero: !!activo.tableroId,
      tableroCodigo: activo.tableroMontaje?.codigo ?? null,
      medioAcceso: activo.medioAcceso ?? null,
      alturaMetros: activo.alturaMetros ?? null,
      ultimaCausa: causa,
      ultimaFecha: ultima?.endedAt ?? null,
      fallasEn90Dias: fallas,
      repuestoDisponible,
      repuestoNombre,
    };

    return {
      ...arranqueDeDiagnostico(entrada),
      activo: { id: activo.id, codigo: activo.assetCode },
      generado: new Date().toISOString(),
    };
  }
}
