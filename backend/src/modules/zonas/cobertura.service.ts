import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { computeEffectiveStatuses } from '../../common/asset-status';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { ambitoDelUsuario } from '../../common/ambito-usuario';
import { ordenarZonas, titularDeCobertura, porcentajeCobertura } from './cobertura-orden';

/**
 * COBERTURA — lo que Producción MIRA.
 *
 * =============================================================================
 *  POR QUÉ ESTA PANTALLA ES DISTINTA DE «ESTADO POR TREN»
 * =============================================================================
 *  «Estado por Tren» está escrita para Mantenimiento: tramos de cable, canales
 *  libres, gabinetes con foto, trabajos pendientes. Todo eso es correcto y a un
 *  jefe de línea no le dice nada.
 *
 *  Él tiene UNA pregunta, y no aparece en ninguna pantalla del sistema:
 *
 *      «¿QUÉ ESTOY DEJANDO DE VER AHORA MISMO, Y CUÁNTO IMPORTA?»
 *
 *  No «cuántas cámaras hay»: qué ZONA se quedó ciega, desde cuándo, y si esa
 *  zona era de las que él mismo declaró vitales. Una cámara caída en el
 *  estacionamiento y una caída en la salida del horno son la misma fila en un
 *  listado de activos, y no son el mismo problema.
 *
 * =============================================================================
 *  LAS TRES DECISIONES DE ESTA VISTA
 * =============================================================================
 *  1. SE ORDENA POR LO QUE DUELE, no por código ni por nombre. Arriba las
 *     zonas vitales sin vista; abajo lo que está entero.
 *
 *  2. UNA ZONA CON UNA SOLA CÁMARA CAÍDA NO ES «93 % DE COBERTURA».
 *     Si esa cámara era la única que apuntaba al colado, la cobertura de ESE
 *     punto es cero. Por eso se informa de cámaras caídas y de la criticidad
 *     de la zona por separado, y NO se promedia todo en un porcentaje único
 *     que suena tranquilizador. Un 95 % general puede esconder que lo único
 *     apagado es lo único que importaba.
 *
 *  3. RESPETA EL ÁMBITO. El jefe del Tren 2 ve el Tren 2. No es un filtro de
 *     pantalla: se cruza contra lo que tiene permitido, así que escribir otro
 *     tren en la dirección no le enseña nada.
 */
@Injectable()
export class CoberturaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Estados en los que la cámara NO está dando imagen útil. */
  private readonly CIEGA = ['FUERA_SERVICIO', 'MANTENIMIENTO', 'BAJA'];
  /** Da imagen, pero con algo abierto encima. */
  private readonly DUDOSA = ['CON_INCIDENCIA'];

  async porZona(userId?: string, trenPedido?: string | null) {
    const { trenes, sinLimite } = await ambitoDelUsuario(this.prisma, userId);

    const activos = await this.prisma.asset.findMany({
      where: { deletedAt: null },
      select: {
        id: true, assetCode: true, type: true, status: true,
        criticality: true, locationId: true,
        location: { select: { id: true, name: true } },
      },
    });

    const [estados, ctx] = await Promise.all([
      computeEffectiveStatuses(this.prisma, activos),
      resolverContextoDePlanta(this.prisma, activos),
    ]);

    /* Desde cuándo está caída. Es el dato que convierte «hay una cámara mal»
       en «llevamos tres días sin ver el colado», que es lo que hace que
       alguien se mueva. Se toma la incidencia abierta más antigua. */
    const abiertas = await this.prisma.incident.findMany({
      where: {
        status: { in: ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO'] },
        assetId: { in: activos.map((a) => a.id) },
      },
      select: { assetId: true, reportedAt: true },
      orderBy: { reportedAt: 'asc' },
    });
    const desde = new Map<string, Date>();
    for (const i of abiertas) {
      if (i.assetId && !desde.has(i.assetId)) desde.set(i.assetId, i.reportedAt);
    }

    // --- Agrupación por zona -------------------------------------------------
    const zonas = new Map<string, any>();
    const ahora = Date.now();

    for (const a of activos) {
      const c = ctx[a.id];
      // El ámbito se aplica AQUÍ y no en el `where`: la criticidad y el tren se
      // derivan del árbol, no son columnas, así que no se pueden filtrar en SQL.
      if (!sinLimite && trenes.length) {
        const suyo = (c?.trenCode || '').toUpperCase();
        if (!trenes.some((t) => suyo.includes(t.toUpperCase()))) continue;
      }
      if (trenPedido) {
        const suyo = (c?.trenCode || '').toUpperCase();
        if (!suyo.includes(trenPedido.toUpperCase())) continue;
      }

      const clave = a.locationId || 'SIN_UBICACION';
      if (!zonas.has(clave)) {
        zonas.set(clave, {
          id: clave,
          nombre: a.location?.name || 'Sin ubicación asignada',
          tren: c?.trenNombre || null,
          etapa: c?.etapaNombre || null,
          queSeVigila: c?.queSeVigila || null,
          criticidadProduccion: c?.criticidadProduccion || null,
          porQueEsVital: c?.porQueEsVital || null,
          impactoSiSeCae: c?.impactoSiSeCae || null,
          zonaVital: c?.zonaVital || false,
          declaracionVencida: c?.declaracionVencida || false,
          camaras: 0, viendo: 0, ciegas: 0, dudosas: 0,
          sinVista: [] as any[],
        });
      }
      const z = zonas.get(clave);

      /* Sólo se cuentan CÁMARAS (el enum es `CAMERA`). Un switch caído es un
         problema de TI; lo que Producción pierde son ojos, y un switch no es
         un ojo — aunque tumbe diez. Ese impacto sale en Puntos críticos, que
         es la pantalla de TI. */
      if (a.type !== 'CAMERA') continue;

      z.camaras++;
      const est = estados[a.id] || a.status;
      if (this.CIEGA.includes(est)) {
        z.ciegas++;
        const d = desde.get(a.id);
        z.sinVista.push({
          codigo: a.assetCode,
          estado: est,
          desde: d ?? null,
          dias: d ? Math.floor((ahora - d.getTime()) / 86_400_000) : null,
        });
      } else if (this.DUDOSA.includes(est)) {
        z.dudosas++; z.viendo++;
      } else {
        z.viendo++;
      }
    }

    /* El orden y el titular viven en `cobertura-orden.ts`, sin base de datos:
       son reglas de negocio y se prueban con datos escritos a mano. */
    const lista = ordenarZonas([...zonas.values()].filter((z) => z.camaras > 0));

    // --- El titular ----------------------------------------------------------
    const vitalesCiegas = lista.filter((z) => z.zonaVital && z.ciegas > 0);
    const camaras = lista.reduce((n, z) => n + z.camaras, 0);
    const viendo = lista.reduce((n, z) => n + z.viendo, 0);

    return {
      /* `null`, no 0. Sin cámaras cargadas no hay cobertura del 0 %: no hay
         cobertura medida. Enseñar 0 % haría creer que la planta está a
         ciegas, y enseñar 100 % que está entera. Las dos son mentira. */
      coberturaPct: porcentajeCobertura(camaras, viendo),
      camaras,
      viendo,
      ciegas: camaras - viendo,
      zonasVitalesSinVista: vitalesCiegas.length,
      /* La frase que se lee primero. Se construye aquí y no en la pantalla
         para que diga lo mismo en la web, en el PDF y en el aviso de Telegram
         el día que se enganche. */
      titular: titularDeCobertura(camaras, viendo, vitalesCiegas.length),
      zonas: lista,
      /* Zonas con cámaras que NADIE ha valorado. Es la llamada a la acción
         para el propio jefe de línea: lo que él tiene que declarar. */
      sinDeclarar: lista.filter((z) => !z.criticidadProduccion).length,
    };
  }
}
