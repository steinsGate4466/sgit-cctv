import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolverContextoDePlanta } from '../../common/plant-context';
import {
  riesgoDeRepuesto, riesgoDeEquipo, ordenarPorRiesgo, titularDeRiesgo,
  ORDEN_RIESGO, RepuestoParaRiesgo,
} from '../../common/obsolescencia';

/**
 * DÓNDE ESTAMOS EXPUESTOS A QUEDARNOS SIN ARREGLO — bloque 32.
 *
 * =============================================================================
 *  DOS PREGUNTAS QUE SON LA MISMA
 * =============================================================================
 *   · «¿Qué repuesto NO puede faltar, porque sostiene una zona vital?»
 *   · «¿Qué cámaras ya no se consiguen en el mercado?»
 *
 *  Las dos contestan a lo mismo: si esto falla mañana, ¿lo puedo arreglar?
 *  Una lo responde el almacén, la otra el fabricante.
 *
 *  Y NINGUNA NECESITA PRECIOS. Ése es el punto: este análisis se puede hacer
 *  hoy, sin esperar a que Almacén cargue las tarifas.
 *
 * =============================================================================
 *  POR QUÉ NO ES UN «STOCK BAJO MÍNIMO» DE TODA LA VIDA
 * =============================================================================
 *  Un mínimo es un número que alguien puso una vez y nadie revisó. Aquí el
 *  stock se mira CONTRA LA REALIDAD: cuántos equipos dependen de ese repuesto
 *  y en qué zonas están. Una unidad para una cámara del estacionamiento
 *  alcanza; una unidad para cuatro cámaras de la salida del horno, no.
 */
@Injectable()
export class RiesgoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Repuestos ordenados por lo que duele que falten. */
  async repuestos() {
    const [partes, enlaces] = await Promise.all([
      this.prisma.sparePart.findMany({
        select: {
          id: true, sapCode: true, name: true,
          currentStock: true, minStock: true,
        },
      }),
      this.prisma.sparePartAsset.findMany({
        select: {
          sparePartId: true,
          asset: { select: { id: true, criticality: true, locationId: true, deletedAt: true } },
        },
      }),
    ]);

    // La zona vital sale del árbol, igual que en todo el resto del sistema.
    const activos = enlaces
      .filter((e) => e.asset && !e.asset.deletedAt)
      .map((e) => ({ id: e.asset.id, criticality: e.asset.criticality, locationId: e.asset.locationId }));
    const ctx = await resolverContextoDePlanta(this.prisma, activos);

    const porRepuesto = new Map<string, { usan: number; vitales: number; zonas: Set<string> }>();
    for (const e of enlaces) {
      if (!e.asset || e.asset.deletedAt) continue;
      const acc = porRepuesto.get(e.sparePartId) ?? { usan: 0, vitales: 0, zonas: new Set<string>() };
      acc.usan++;
      const c = ctx[e.asset.id];
      if (c?.zonaVital) {
        acc.vitales++;
        if (c.zonaCriticaNombre) acc.zonas.add(c.zonaCriticaNombre);
      }
      porRepuesto.set(e.sparePartId, acc);
    }

    const lista = partes.map((p) => {
      const acc = porRepuesto.get(p.id) ?? { usan: 0, vitales: 0, zonas: new Set<string>() };
      const entrada: RepuestoParaRiesgo = {
        id: p.id, codigo: p.sapCode ?? '(sin código)', nombre: p.name,
        stock: p.currentStock ?? 0, minimo: p.minStock ?? null,
        equiposQueLoUsan: acc.usan,
        equiposEnZonaVital: acc.vitales,
        zonasVitales: [...acc.zonas].sort(),
      };
      return riesgoDeRepuesto(entrada);
    });

    const ordenada = ordenarPorRiesgo(lista);
    return {
      titular: titularDeRiesgo(
        ordenada.filter((x) => x.nivel === 'CRITICO').length,
        ordenada.filter((x) => x.nivel === 'ALTO').length,
        ordenada.filter((x) => x.nivel === 'SIN_DATOS').length,
        ordenada.length,
      ),
      repuestos: ordenada,
      resumen: this.contar(ordenada),
    };
  }

  /**
   * Equipos por riesgo de obsolescencia.
   *
   * @param umbralAnos a partir de cuántos años se considera viejo. Lo decide
   *   la planta, no el código: una cámara en el horno envejece distinto que
   *   una en el púlpito.
   */
  async equipos(umbralAnos = 8) {
    const [activos, modelos] = await Promise.all([
      this.prisma.asset.findMany({
        where: { deletedAt: null },
        select: {
          id: true, assetCode: true, type: true, brand: true, model: true,
          installDate: true, criticality: true, locationId: true,
        },
      }),
      this.prisma.modeloEquipo.findMany({
        select: {
          tipoActivo: true, marca: true, modelo: true,
          finDeSoporte: true, sinRecambio: true, reemplazadoPor: true,
        },
      }),
    ]);

    const clave = (t: string, ma?: string | null, mo?: string | null) =>
      `${t}|${(ma ?? '').trim().toLowerCase()}|${(mo ?? '').trim().toLowerCase()}`;
    const porModelo = new Map(modelos.map((m) => [clave(m.tipoActivo, m.marca, m.modelo), m] as const));

    const ctx = await resolverContextoDePlanta(this.prisma, activos);
    const ahora = Date.now();

    const lista = activos.map((a) => {
      const m = porModelo.get(clave(a.type, a.brand, a.model));
      const c = ctx[a.id];
      return {
        ...riesgoDeEquipo({
          id: a.id, assetCode: a.assetCode, marca: a.brand, modelo: a.model,
          desde: a.installDate,
          finDeSoporte: m?.finDeSoporte ?? null,
          sinRecambio: m?.sinRecambio ?? false,
          zonaVital: c?.zonaVital ?? false,
          zonaNombre: c?.zonaCriticaNombre ?? null,
        }, ahora, umbralAnos),
        reemplazadoPor: m?.reemplazadoPor ?? null,
        /* Si el modelo no está en el catálogo se dice. No es lo mismo «este
           modelo tiene recambio» que «nadie ha averiguado si lo tiene». */
        modeloEnCatalogo: !!m,
      };
    }).sort(
      (x, y) => ORDEN_RIESGO[x.nivel] - ORDEN_RIESGO[y.nivel]
        || String(x.assetCode).localeCompare(String(y.assetCode)),
    );

    return {
      titular: titularDeRiesgo(
        lista.filter((x) => x.nivel === 'CRITICO').length,
        lista.filter((x) => x.nivel === 'ALTO').length,
        lista.filter((x) => x.nivel === 'SIN_DATOS').length,
        lista.length,
      ),
      umbralAnos,
      equipos: lista,
      resumen: this.contar(lista),
      /* Cuántos modelos distintos hay sin ficha. Es la tarea concreta: no
         «revisa el inventario», sino «averigua estos seis modelos». */
      modelosSinFicha: [...new Set(
        lista.filter((x) => !x.modeloEnCatalogo && x.modelo)
          .map((x) => `${x.marca ?? ''} ${x.modelo}`.trim()),
      )].sort(),
    };
  }

  private contar(lista: { nivel: string }[]) {
    const r: Record<string, number> = {
      CRITICO: 0, ALTO: 0, MEDIO: 0, BAJO: 0, SIN_DATOS: 0,
    };
    for (const x of lista) r[x.nivel] = (r[x.nivel] ?? 0) + 1;
    return r;
  }
}
