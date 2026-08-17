import { Injectable, NotFoundException } from '@nestjs/common';
import { alcanza, ambitoDelUsuario, noVeNada, veTodo } from '../../common/ambito-usuario';
import { PrismaService } from '../../prisma/prisma.service';
import { computeEffectiveStatuses } from '../../common/asset-status';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { evaluarFicha } from '../../common/asset-completeness';
import {
  contarPorTren, contarCables, contarCanales, pct, contadoresVacios,
  ActivoAgregable, TramoAgregable, GrabadorAgregable, LIMITE_TRAMO_M,
} from './infra-agregados';

/**
 * TABLERO DE INFRAESTRUCTURA POR TREN.
 *
 * QUÉ RESUELVE
 * El tablero anterior era de mantenimiento: cámaras, incidencias y OM. La
 * infraestructura —gabinetes, ubicaciones, cableado, canales de grabador,
 * avance del mapeo, accesos— no aparecía en ningún indicador, y lo que sí
 * aparecía se agrupaba con la columna `Asset.train` mientras el mapeo agrupaba
 * con el árbol de ubicaciones. Dos verdades para la misma pregunta.
 *
 * AQUÍ HAY UNA SOLA: el árbol. Los trenes no están escritos en el código; son
 * las ubicaciones de tipo TREN. Si mañana existe un Tren 4, aparece solo.
 *
 * UNA SOLA LLAMADA POR PANTALLA
 * Todo el tablero se sirve en un endpoint. Ocho peticiones desde una tablet con
 * la wifi de planta es medio minuto mirando una pantalla vacía.
 */
@Injectable()
export class InfraService {
  constructor(private prisma: PrismaService) {}

  /** Trenes reales del árbol, en orden de código. */
  private async trenesDelArbol() {
    return this.prisma.location.findMany({
      where: { type: 'TREN' },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    });
  }

  /**
   * Carga los activos con lo necesario para evaluar ficha, estado y contexto.
   * Es la consulta más pesada del tablero y se hace UNA vez para todos los
   * trenes: filtrar por tren aquí obligaría a repetirla tres veces.
   */
  private async activosConTodo() {
    return this.prisma.asset.findMany({
      where: { deletedAt: null },
      include: {
        location: { select: { id: true, name: true } },
        cabinet: { select: { id: true, code: true } },
        camera: true, nvr: true, switchDev: true, wireless: true,
        decoder: true, screen: true, pc: true,
        photos: { select: { id: true } },
      },
      orderBy: { assetCode: 'asc' },
    });
  }

  /**
   * Convierte los activos crudos en la forma que esperan las funciones puras.
   * Aquí es donde se aplica la única fuente de verdad del tren.
   */
  private async normalizar(activos: any[]) {
    const ctx = await resolverContextoDePlanta(this.prisma, activos as any);
    const eff = await computeEffectiveStatuses(this.prisma, activos as any);

    const agregables: ActivoAgregable[] = activos.map((a) => {
      const ficha = evaluarFicha(a);
      return {
        id: a.id,
        type: a.type,
        estado: eff[a.id] || a.status,
        // Criticidad EFECTIVA: la que impone la etapa del proceso, no la que
        // alguien marcó a mano en el formulario.
        criticidad: ctx[a.id]?.criticidad || a.criticality,
        trenCode: ctx[a.id]?.trenCode ?? null,
        fichaIncompleta: ficha.incompleta,
        sinFoto: !a.photos?.length,
        sinEtapa: !!ctx[a.id]?.requiereAsignarEtapa,
      };
    });

    return { ctx, eff, agregables };
  }

  /** Tren derivado de una ubicación cualquiera (gabinete, OM sin activo…). */
  private async trenDeUbicaciones(locationIds: (string | null | undefined)[]) {
    const ids = [...new Set(locationIds.filter(Boolean))] as string[];
    if (!ids.length) return {} as Record<string, string | null>;
    // Se reutiliza el resolvedor del árbol pasando las ubicaciones como si
    // fueran activos: solo necesita { id, locationId }. Así no hay una segunda
    // implementación de "sube el árbol hasta el TREN" que pueda desviarse.
    const falsos = ids.map((id) => ({ id, locationId: id }));
    const ctx = await resolverContextoDePlanta(this.prisma, falsos as any);
    const out: Record<string, string | null> = {};
    for (const id of ids) out[id] = ctx[id]?.trenCode ?? null;
    return out;
  }

  // ==========================================================================
  //  RESUMEN DE LOS TRENES  (GET /dashboard/infra/trenes)
  // ==========================================================================

  /**
   * @param userId  Si el usuario tiene ámbito (jefe de línea de Producción),
   *                sólo se le devuelven SUS trenes. Sin ámbito, los tres.
   */
  async resumenTrenes(userId?: string | null) {
    const [trenes, activos, cables, gabinetes] = await Promise.all([
      this.trenesDelArbol(),
      this.activosConTodo(),
      this.prisma.assetCable.findMany({
        where: { status: { not: 'RETIRADO' } },
        select: {
          id: true, meters: true, metersEstimated: true, shielded: true, status: true,
          fromAsset: { select: { id: true, locationId: true } },
          toAsset: { select: { id: true, locationId: true } },
        },
      }),
      this.prisma.cabinet.findMany({
        select: { id: true, code: true, locationId: true, photoFileId: true, _count: { select: { assets: true } } },
      }),
    ]);

    const { ctx, agregables } = await this.normalizar(activos);
    const porTren = contarPorTren(agregables);
    const trenDeActivo = new Map(agregables.map((a) => [a.id, a.trenCode] as const));

    // --- cableado por tren: el tramo pertenece al tren de su extremo de origen;
    //     si no lo tiene, al del destino. Un tramo entre dos trenes es raro pero
    //     existe (enlaces inalámbricos), y se cuenta en el de origen.
    const cablesPorTren = new Map<string | null, TramoAgregable[]>();
    for (const c of cables) {
      const tren = trenDeActivo.get(c.fromAsset?.id || '')
        ?? trenDeActivo.get(c.toAsset?.id || '')
        ?? null;
      const t: TramoAgregable = {
        id: c.id, metros: c.meters, estimado: c.metersEstimated,
        blindado: c.shielded, estado: c.status, trenCode: tren,
      };
      if (!cablesPorTren.has(tren)) cablesPorTren.set(tren, []);
      cablesPorTren.get(tren)!.push(t);
    }

    // --- gabinetes por tren (a través de su ubicación)
    const trenDeUbic = await this.trenDeUbicaciones(gabinetes.map((g) => g.locationId));
    const gabPorTren = new Map<string | null, { total: number; sinFoto: number; vacios: number }>();
    for (const g of gabinetes) {
      const tren = g.locationId ? trenDeUbic[g.locationId] ?? null : null;
      if (!gabPorTren.has(tren)) gabPorTren.set(tren, { total: 0, sinFoto: 0, vacios: 0 });
      const acc = gabPorTren.get(tren)!;
      acc.total++;
      if (!g.photoFileId) acc.sinFoto++;
      if (!g._count.assets) acc.vacios++;
    }

    // --- canales de grabador por tren
    const nvrs = activos.filter((a) => a.type === 'NVR');
    const camarasPorNvr = new Map<string, number>();
    for (const a of activos) {
      const id = a.camera?.nvrId;
      if (id) camarasPorNvr.set(id, (camarasPorNvr.get(id) || 0) + 1);
    }
    const canalesPorTren = new Map<string | null, GrabadorAgregable[]>();
    for (const n of nvrs) {
      const tren = ctx[n.id]?.trenCode ?? null;
      const g: GrabadorAgregable = {
        id: n.id, assetCode: n.assetCode, canales: n.nvr?.channels ?? null,
        camarasAsignadas: camarasPorNvr.get(n.id) || 0, trenCode: tren,
      };
      if (!canalesPorTren.has(tren)) canalesPorTren.set(tren, []);
      canalesPorTren.get(tren)!.push(g);
    }

    // --- OM e incidencias abiertas por tren
    const idsPorTren = new Map<string | null, string[]>();
    for (const a of agregables) {
      if (!idsPorTren.has(a.trenCode)) idsPorTren.set(a.trenCode, []);
      idsPorTren.get(a.trenCode)!.push(a.id);
    }
    const now = new Date();
    const [oms, incidencias, accesos] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] as any } },
        select: { id: true, assetId: true, locationId: true, scheduledDate: true },
      }),
      this.prisma.incident.findMany({
        where: { status: { in: ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'] as any } },
        select: { id: true, assetId: true, priority: true },
      }),
      this.prisma.accessRequest.findMany({
        where: { status: { in: ['SOLICITADO', 'EN_REVISION'] as any } },
        select: { id: true, assetId: true },
      }),
    ]);

    const trenDeUbicOm = await this.trenDeUbicaciones(oms.map((o) => o.locationId));
    const conteo = (clave: string | null) => ({
      omAbiertas: 0, omVencidas: 0, incidenciasAbiertas: 0, incidenciasCriticas: 0, accesosPendientes: 0, _clave: clave,
    });
    const trabajoPorTren = new Map<string | null, ReturnType<typeof conteo>>();
    const bolsa = (clave: string | null) => {
      if (!trabajoPorTren.has(clave)) trabajoPorTren.set(clave, conteo(clave));
      return trabajoPorTren.get(clave)!;
    };
    for (const o of oms) {
      // Una OM puede colgar de un activo o solo de una ubicación (ej. una
      // campaña de barrido). Se acepta cualquiera de las dos.
      const tren = (o.assetId ? trenDeActivo.get(o.assetId) : undefined)
        ?? (o.locationId ? trenDeUbicOm[o.locationId] : undefined)
        ?? null;
      const b = bolsa(tren);
      b.omAbiertas++;
      if (o.scheduledDate && new Date(o.scheduledDate) < now) b.omVencidas++;
    }
    for (const i of incidencias) {
      const b = bolsa(i.assetId ? trenDeActivo.get(i.assetId) ?? null : null);
      b.incidenciasAbiertas++;
      if (['ALTA', 'CRITICA'].includes(i.priority as any)) b.incidenciasCriticas++;
    }
    for (const a of accesos) {
      bolsa(a.assetId ? trenDeActivo.get(a.assetId) ?? null : null).accesosPendientes++;
    }

    const arma = (code: string | null, id: string | null, nombre: string) => {
      // Un tren recién creado en el árbol todavía no tiene activos: debe salir
      // con ceros y todas sus claves, no como objeto vacío.
      const base = porTren.get(code) || contadoresVacios(code);
      return {
        id, code, nombre,
        activos: base,
        cableado: contarCables(cablesPorTren.get(code) || []),
        gabinetes: gabPorTren.get(code) || { total: 0, sinFoto: 0, vacios: 0 },
        canales: contarCanales(canalesPorTren.get(code) || []),
        trabajo: trabajoPorTren.get(code) || conteo(code),
      };
    };

    // El recorte por ámbito se hace AL FINAL, sobre el resultado ya armado.
    // Se calcula todo y se entrega sólo lo suyo. Hacerlo antes obligaría a
    // duplicar el filtro dentro de cada contador, y ahí es donde se cuela el
    // que se olvida — el que enseña de más.
    const ambito = await ambitoDelUsuario(this.prisma, userId);
    /* Bloque 42: con el rol sectorizado y sin tren asignado la lista queda
       vacía. Antes este caso caía en «sin límite» y devolvía los tres trenes,
       que es lo que se vio en la captura de Producción. */
    const visibles = noVeNada(ambito)
      ? []
      : veTodo(ambito)
        ? trenes
        : trenes.filter((t) => alcanza(ambito, t.code));

    return {
      trenes: visibles.map((t) => arma(t.code, t.id, t.name)),
      // NO es un tren: es trabajo pendiente de asignar en el árbol. Va aparte
      // justamente para que nadie lo lea como si Laminación tuviera cuatro.
      // Con ámbito NO se entrega: lo sin ubicar puede estar en cualquier
      // sitio, y enseñárselo al jefe del Tren 2 sería enseñarle algo que
      // quizá no es suyo.
      sinUbicar: veTodo(ambito)
        ? {
            activos: porTren.get(null)?.total || 0,
            detalle: arma(null, null, 'Sin ubicación en el árbol'),
          }
        : null,
      ambitoLimitado: !veTodo(ambito),
      /* El porqué, ya redactado en `ambito-usuario.ts`. Sin esto la pantalla
         sale vacía y parece rota, cuando en realidad falta una asignación. */
      motivoAmbito: ambito.motivo,
      limiteTramoM: LIMITE_TRAMO_M,
    };
  }

  // ==========================================================================
  //  DETALLE DE UN TREN  (GET /dashboard/infra/tren/:idOrCode)
  // ==========================================================================

  async detalleTren(idOrCode: string, userId?: string | null) {
    const tren = await this.prisma.location.findFirst({
      where: { type: 'TREN', OR: [{ id: idOrCode }, { code: idOrCode }] },
      select: { id: true, code: true, name: true },
    });
    if (!tren) throw new NotFoundException('No existe un tren con ese identificador.');

    // Pedir un tren ajeno escribiendo su código en la dirección es lo PRIMERO
    // que alguien prueba. Se responde 404, no 403: un 403 confirmaría que ese
    // tren existe, y aquí no hay ninguna razón para confirmárselo.
    const ambito = await ambitoDelUsuario(this.prisma, userId);
    if (!alcanza(ambito, tren.code)) {
      throw new NotFoundException('No existe un tren con ese identificador.');
    }

    const activos = await this.activosConTodo();
    const { ctx, eff, agregables } = await this.normalizar(activos);

    const delTren = activos.filter((a) => ctx[a.id]?.trenCode === tren.code);
    const idsDelTren = new Set(delTren.map((a) => a.id));
    const agregablesTren = agregables.filter((a) => idsDelTren.has(a.id));
    const contadores = contarPorTren(agregablesTren).get(tren.code)
      || contadoresVacios(tren.code);

    const now = new Date();
    const ids = [...idsDelTren];

    const [oms, incidencias, accesos, cables] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { assetId: { in: ids }, status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] as any } },
        select: {
          id: true, code: true, type: true, status: true, scheduledDate: true,
          activity: true, progressPct: true, asset: { select: { assetCode: true } },
        },
        orderBy: { scheduledDate: 'asc' }, take: 100,
      }),
      this.prisma.incident.findMany({
        where: { assetId: { in: ids }, status: { in: ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'] as any } },
        select: {
          id: true, code: true, title: true, category: true, priority: true,
          status: true, reportedAt: true, asset: { select: { assetCode: true } },
        },
        orderBy: { reportedAt: 'desc' }, take: 100,
      }),
      this.prisma.accessRequest.findMany({
        where: { assetId: { in: ids }, status: { in: ['SOLICITADO', 'EN_REVISION'] as any } },
        select: { id: true, status: true, asset: { select: { assetCode: true } } },
      }),
      this.prisma.assetCable.findMany({
        where: {
          status: { not: 'RETIRADO' },
          OR: [{ fromAssetId: { in: ids } }, { toAssetId: { in: ids } }],
        },
        select: {
          id: true, code: true, category: true, meters: true, metersEstimated: true,
          shielded: true, status: true, route: true,
          fromAsset: { select: { id: true, assetCode: true } },
          toAsset: { select: { id: true, assetCode: true } },
        },
      }),
    ]);

    const tramos: TramoAgregable[] = cables.map((c) => ({
      id: c.id, metros: c.meters, estimado: c.metersEstimated,
      blindado: c.shielded, estado: c.status, trenCode: tren.code,
    }));

    // Grabadores del tren con sus canales ocupados y libres, uno por uno: es lo
    // que se necesita para decidir dónde entra una cámara nueva.
    const camarasPorNvr = new Map<string, any[]>();
    for (const a of activos) {
      const id = a.camera?.nvrId;
      if (!id) continue;
      if (!camarasPorNvr.has(id)) camarasPorNvr.set(id, []);
      camarasPorNvr.get(id)!.push(a);
    }
    const grabadores = delTren
      .filter((a) => a.type === 'NVR')
      .map((n) => {
        const asignadas = camarasPorNvr.get(n.id) || [];
        const capacidad = n.nvr?.channels ?? null;
        return {
          id: n.id, assetCode: n.assetCode,
          // Asset NO tiene campo `name`: el rótulo humano es el lugar de
          // referencia en planta ("armario del púlpito del Tren 2").
          referencia: n.referencePlace || null,
          ubicacion: n.location?.name || null,
          gabinete: n.cabinet?.code || null,
          estado: eff[n.id] || n.status,
          canales: capacidad,
          ocupados: asignadas.length,
          libres: capacidad == null ? null : Math.max(0, capacidad - asignadas.length),
          sobreasignado: capacidad != null && asignadas.length > capacidad,
        };
      });

    const gabinetes = await this.prisma.cabinet.findMany({
      where: { assets: { some: { id: { in: ids } } } },
      select: {
        id: true, code: true, name: true, photoFileId: true,
        location: { select: { name: true } },
        _count: { select: { assets: true } },
      },
      orderBy: { code: 'asc' },
    });

    const etapas = new Map<string, { code: string; nombre: string; secuencia: number | null; total: number; completos: number }>();
    for (const a of delTren) {
      const c = ctx[a.id];
      const code = c?.etapaCode || 'SIN_ETAPA';
      if (!etapas.has(code)) {
        etapas.set(code, {
          code,
          nombre: c?.etapaNombre || 'Sin etapa asignada',
          secuencia: c?.etapaSecuencia ?? null,
          total: 0, completos: 0,
        });
      }
      const e = etapas.get(code)!;
      e.total++;
      if (!evaluarFicha(a).incompleta) e.completos++;
    }

    return {
      tren,
      resumen: {
        ...contadores,
        cableado: contarCables(tramos),
        canales: contarCanales(grabadores.map((g) => ({
          id: g.id, assetCode: g.assetCode, canales: g.canales,
          camarasAsignadas: g.ocupados, trenCode: tren.code,
        }))),
        gabinetes: {
          total: gabinetes.length,
          sinFoto: gabinetes.filter((g) => !g.photoFileId).length,
        },
        omAbiertas: oms.length,
        omVencidas: oms.filter((o) => o.scheduledDate && new Date(o.scheduledDate) < now).length,
        incidenciasAbiertas: incidencias.length,
        incidenciasCriticas: incidencias.filter((i) => ['ALTA', 'CRITICA'].includes(i.priority as any)).length,
        accesosPendientes: accesos.length,
      },
      // Ordenadas por secuencia del proceso: así el tren se lee de la entrada
      // del horno a la salida del producto, no en orden alfabético.
      etapas: [...etapas.values()]
        .sort((a, b) => (a.secuencia ?? 999) - (b.secuencia ?? 999))
        .map((e) => ({ ...e, avancePct: pct(e.completos, e.total) })),
      grabadores,
      gabinetes,
      tramosFueraNorma: cables
        .filter((c) => c.meters != null && c.meters > LIMITE_TRAMO_M)
        .map((c) => ({
          id: c.id, code: c.code, metros: c.meters, estimado: c.metersEstimated,
          categoria: c.category, blindado: c.shielded, ruta: c.route, estado: c.status,
          desde: c.fromAsset?.assetCode || null, hasta: c.toAsset?.assetCode || null,
        })),
      requierenAtencion: delTren
        .filter((a) => ['FUERA_SERVICIO', 'CON_INCIDENCIA'].includes(eff[a.id] || a.status))
        .map((a) => ({
          id: a.id, assetCode: a.assetCode, type: a.type,
          estado: eff[a.id] || a.status,
          criticidad: ctx[a.id]?.criticidad || a.criticality,
          etapa: ctx[a.id]?.etapaNombre || null,
          ubicacion: a.location?.name || null,
        })),
      ordenes: oms.map((o) => ({
        ...o, vencida: !!(o.scheduledDate && new Date(o.scheduledDate) < now),
      })),
      incidencias,
      accesos,
      limiteTramoM: LIMITE_TRAMO_M,
    };
  }

  // ==========================================================================
  //  ACTIVOS FUERA DEL ÁRBOL  (GET /dashboard/infra/sin-ubicar)
  // ==========================================================================

  /**
   * Lo que antes se mostraba como un cuarto tren llamado SIN_ASIGNAR. No es un
   * tren: es una lista de trabajo. Se devuelve con el motivo para que quien la
   * abra sepa qué hacer con cada fila.
   */
  async sinUbicar(userId?: string | null) {
    const ambito = await ambitoDelUsuario(this.prisma, userId);
    /* Lo sin ubicar puede estar en cualquier sitio de la planta: sólo lo ve
       quien no tiene límite. A un jefe de tren se le estaría enseñando algo
       que quizá no es suyo. */
    if (!veTodo(ambito)) return { activos: [], total: 0, ambitoLimitado: true };
    const activos = await this.prisma.asset.findMany({
      where: { deletedAt: null },
      select: {
        id: true, assetCode: true, referencePlace: true, type: true, status: true,
        criticality: true, locationId: true,
        location: { select: { id: true, name: true, type: true } },
      },
      orderBy: { assetCode: 'asc' },
    });
    const ctx = await resolverContextoDePlanta(this.prisma, activos as any);

    const filas = activos
      .filter((a) => !ctx[a.id]?.trenCode)
      .map((a) => ({
        id: a.id, assetCode: a.assetCode, referencia: a.referencePlace, type: a.type,
        status: a.status, criticidad: a.criticality,
        ubicacion: a.location?.name || null,
        motivo: !a.locationId
          ? 'No tiene ubicación asignada.'
          : 'Su ubicación no cuelga de ningún tren en el árbol.',
      }));

    return {
      total: filas.length,
      sinUbicacion: filas.filter((f) => !f.ubicacion).length,
      fueraDelArbol: filas.filter((f) => !!f.ubicacion).length,
      filas,
    };
  }
}
