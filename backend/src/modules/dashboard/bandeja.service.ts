import { Injectable } from '@nestjs/common';
import { evaluarEspera, ordenarPorUrgencia } from '../maintenance/espera';
import { IncidentStatus, Priority, WorkOrderStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * LA BANDEJA: lo que espera una decisión, hoy.
 *
 * POR QUÉ EXISTE
 * Para saber qué le tocaba, el ingeniero tenía que abrir cuatro pantallas:
 * órdenes, materiales por firmar, accesos por aprobar y hallazgos. Y acordarse
 * de mirarlas. Lo que no se ve, no se hace.
 *
 * Esto no es un tablero de indicadores: un indicador se mira, una bandeja se
 * VACÍA. Cada línea de aquí es algo que alguien está esperando.
 *
 * TODO EN UNA SOLA LLAMADA. Cinco peticiones desde una tablet con la wifi de
 * planta es medio minuto mirando una pantalla vacía.
 */
@Injectable()
export class BandejaService {
  constructor(private prisma: PrismaService) {}

  async bandeja(userId?: string | null) {
    const ahora = new Date();
    // Tipado de verdad, no `any`. El `: any` apaga la comprobación que
    // habría cazado el filtro anidado que tumbó el tablero el 02/08.
    // Además, si mañana alguien añade un estado al enum y se olvida de esta
    // lista, TypeScript no dirá nada — pero si se escribe mal uno de estos
    // tres, lo dice al compilar.
    const ABIERTAS: WorkOrderStatus[] = ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'];
    const abiertas = { in: ABIERTAS };

    /* SIN ORDEN TODAVÍA — bloque 72.
       -------------------------------------------------------------------------
       Una incidencia con orden abierta YA ESTÁ EN MARCHA: alguien la cogió y
       aparece en «sin detallar» o en «vencidas». Volver a listarla aquí sería
       contarla dos veces y hacer que la bandeja parezca el doble de llena de
       lo que está — que es la forma más rápida de que se deje de mirar.

       Lo que esta bandeja tiene que enseñar es lo que NO ha arrancado. */
    const sinOrden = { workOrders: { none: {} } };
    /* Tipado de verdad, no `as any`. Lo cazó `verificar:constructores`, y con
       razón: un `as any` apaga la comprobación que avisa cuando un valor no
       existe en el enum. Con el tipo puesto, escribir mal un estado o quitarle
       uno al enum se ve al compilar y no en producción. */
    /* «Grave» se escribe UNA vez y se usa en los dos cubos: uno pide las que
       están dentro y el otro las que no. Si estuviera escrito dos veces, el
       día que se añada una prioridad quedaría en ninguno de los dos. */
    const GRAVES: Priority[] = ['ALTA', 'CRITICA'];
    const VIVAS: IncidentStatus[] = ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'];

    /* Quién lo reportó y cuándo. Sin el nombre, la bandeja dice que hay un
       problema pero no a quién preguntar, y entonces el ingeniero llama por
       radio preguntando «¿quién puso esto?». Con nombre y hora, se llama
       directamente a esa persona. */
    const deQuienYCuando = {
      id: true, code: true, title: true, priority: true, category: true,
      status: true, reportedAt: true, occurredAt: true, canalOrigen: true,
      asset: { select: { id: true, assetCode: true, referencePlace: true } },
      reportedBy: { select: { id: true, fullName: true } },
    };

    const [
      sinDetallar, vencidas, materialesPendientes, accesos,
      incidenciasCriticas, incidenciasNormales, mejorasPropuestas,
      bajoMinimo, sinDevolver, paradas,
    ] = await Promise.all([
      // 1. Asignadas y sin detallar. Es trabajo que todavía no se puede hacer.
      this.prisma.workOrder.findMany({
        where: { detailedAt: null, status: abiertas },
        select: {
          id: true, code: true, type: true, activity: true, scheduledDate: true,
          asset: { select: { assetCode: true } },
          // El `id` hace falta para saber si la orden es de quien mira.
          technician: { select: { id: true, fullName: true } },
          assignedBy: { select: { fullName: true } },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 50,
      }),

      // 2. Vencidas: pasaron de fecha y siguen abiertas.
      this.prisma.workOrder.findMany({
        where: { status: abiertas, scheduledDate: { lt: ahora } },
        select: {
          id: true, code: true, type: true, activity: true, scheduledDate: true,
          progressPct: true, asset: { select: { assetCode: true } },
          technician: { select: { id: true, fullName: true } },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 50,
      }),

      // 3. Materiales pedidos esperando la firma del ingeniero.
      this.prisma.workOrderMaterial.findMany({
        where: { status: 'SOLICITADO', workOrder: { status: abiertas } },
        select: {
          id: true, description: true, plannedQty: true, unit: true, sapCode: true,
          workOrder: { select: { id: true, code: true } },
          sparePart: { select: { currentStock: true } },
        },
        take: 100,
      }),

      // 4. Permisos de altura sin resolver. Sin esto nadie sube.
      this.prisma.accessRequest.findMany({
        where: { status: { in: ['SOLICITADO', 'EN_REVISION'] as any } },
        select: {
          id: true, code: true, status: true, heightMeters: true, means: true,
          asset: { select: { assetCode: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),

      /* 5. LO GRAVE: alta y crítica, viva y SIN ORDEN todavía.
            -------------------------------------------------------------------
            Va en su propio cubo y no mezclada con el resto, por petición del
            usuario y con razón: si las cinco críticas del mes se pintan entre
            cuarenta de prioridad media, dejan de verse. Separarlas es lo que
            hace que la lista larga no tape a la corta. */
      this.prisma.incident.findMany({
        where: { status: { in: VIVAS }, priority: { in: GRAVES }, ...sinOrden },
        select: deQuienYCuando,
        orderBy: { reportedAt: 'asc' },
        take: 50,
      }),

      /* 6. LO DEMÁS: media y baja, viva y sin orden.
            -------------------------------------------------------------------
            ESTO ANTES NO SALÍA EN NINGÚN SITIO, y es el hallazgo del bloque
            71: la bandeja sólo miraba ALTA y CRÍTICA, así que una MEDIA se
            quedaba en la lista de Incidencias sin que nadie la mirara. El
            técnico que la reportó creía que estaba en cola de alguien, y no
            lo estaba.

            «Una media que nadie mira acaba siendo crítica», y para entonces
            ya paró la línea. */
      this.prisma.incident.findMany({
        where: { status: { in: VIVAS }, priority: { notIn: GRAVES }, ...sinOrden },
        select: deQuienYCuando,
        orderBy: { reportedAt: 'asc' },
        take: 60,
      }),

      /* 7. MEJORAS PROPUESTAS POR LOS TÉCNICOS, esperando decisión.
            -------------------------------------------------------------------
            Sigue la MISMA secuencia que una incidencia: alguien de campo ve
            algo, lo dice, y alguien decide. La diferencia es que una
            incidencia es algo roto y una mejora es algo mejorable — pero las
            dos se mueren igual si nadie las mira.

            Va con nombre. Una propuesta sin nombre no se puede agradecer ni
            preguntar, y a la tercera que se queda sin respuesta el técnico
            deja de proponer. Ése es el circuito que hay que mantener vivo. */
      this.prisma.mejoraProcedimiento.findMany({
        where: { estado: 'PROPUESTA' },
        select: {
          id: true, texto: true, minutosReales: true, createdAt: true,
          propuestaPor: { select: { id: true, fullName: true } },
          procedimiento: { select: { id: true, titulo: true } },
          workOrder: { select: { id: true, code: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 40,
      }),

      // 6. Repuestos por debajo del mínimo. Se pregunta con SQL porque
      // comparar dos columnas entre sí no se puede expresar en el filtro.
      this.prisma.$queryRaw<any[]>`
        SELECT "id", "name", "sapCode", "currentStock", "minStock"
        FROM spare_parts
        WHERE "currentStock" <= "minStock"
        ORDER BY ("currentStock" - "minStock") ASC
        LIMIT 30
      `.catch(() => []),

      // 7. Material retirado y no devuelto en órdenes YA CERRADAS. Es la fuga
      // silenciosa: el stock quedó descontado por algo que volvió al estante.
      this.prisma.workOrderMaterial.findMany({
        where: { status: 'RETIRADO', workOrder: { status: 'CERRADA' } },
        select: {
          id: true, description: true, withdrawnQty: true, usedQty: true, unit: true,
          workOrder: { select: { id: true, code: true } },
        },
        take: 50,
      }),

      // 8. ÓRDENES PARADAS. Es la fuga más callada del sistema.
      //
      // Una orden EN ESPERA no aparece en ninguna lista de problemas: no
      // tiene fecha que venza, y esperar no es un error. Así que el trabajo
      // no se pierde, se OLVIDA — que es peor, porque nadie lo echa en falta
      // hasta que alguien pregunta por ese equipo semanas después.
      //
      // Se trae también el ÚLTIMO avance, que es donde el técnico dejó dicho
      // qué está esperando. Sin eso sólo se sabría que está parada, no por qué.
      this.prisma.workOrder.findMany({
        where: { status: 'EN_ESPERA' },
        select: {
          id: true, code: true, activity: true, updatedAt: true,
          asset: { select: { assetCode: true, referencePlace: true } },
          technician: { select: { fullName: true } },
          progress: {
            select: { reasonCode: true, note: true, reportedAt: true },
            orderBy: { reportedAt: 'desc' },
            take: 1,
          },
        },
        take: 100,
      }),
    ]);

    const sobrantes = sinDevolver
      .map((m) => ({ ...m, porDevolver: (m.withdrawnQty ?? 0) - (m.usedQty ?? 0) }))
      .filter((m) => m.porDevolver > 0);

    // El material pendiente se agrupa POR ORDEN: el ingeniero firma órdenes
    // enteras, no líneas sueltas. Enseñarle 40 líneas cuando son 6 órdenes le
    // hace creer que tiene seis veces más trabajo del que tiene.
    const porOrden = new Map<string, any>();
    for (const m of materialesPendientes) {
      const k = m.workOrder.id;
      if (!porOrden.has(k)) {
        porOrden.set(k, { workOrderId: k, code: m.workOrder.code, lineas: [], sinStock: 0 });
      }
      const g = porOrden.get(k);
      const falta = m.sparePart != null && (m.plannedQty ?? 0) > m.sparePart.currentStock;
      if (falta) g.sinStock++;
      g.lineas.push({
        id: m.id, description: m.description, plannedQty: m.plannedQty,
        unit: m.unit, sapCode: m.sapCode, falta,
      });
    }
    const firmasPendientes = [...porOrden.values()];

    // Se evalúa con la lógica pura de espera.ts: cuántos días lleva, si eso
    // es mucho PARA LO QUE ESPERA (un repuesto tarda; un permiso no), y con
    // qué frase se cuenta. Ordenado por urgencia real, no por antigüedad:
    // lo primero es lo que se pasó de plazo.
    const enEspera = ordenarPorUrgencia(
      paradas.map((o) => {
        const ultimo = o.progress[0];
        return evaluarEspera(
          {
            id: o.id,
            code: o.code,
            activity: o.activity,
            // Cuándo empezó a esperar: el último avance si lo hay, y si no
            // la última modificación de la orden. No es exacto, pero es
            // mucho mejor que no decir nada — y se afina solo en cuanto el
            // técnico registre un avance.
            desde: ultimo?.reportedAt ?? o.updatedAt,
            motivo: ultimo?.reasonCode ?? null,
            motivoTexto: ultimo?.note ?? null,
            // Los datos del equipo van DENTRO del objeto, no se pegan
            // después por índice: ordenarPorUrgencia reordena la lista, y
            // casar por posición después de ordenar es cómo se acaba
            // enseñando el equipo de otra orden.
            equipo: o.asset?.assetCode ?? null,
            lugar: o.asset?.referencePlace ?? null,
            tecnico: o.technician?.fullName ?? null,
          } as any,
          ahora.getTime(),
        );
      }),
    );

    /* LO MÍO PRIMERO — bloque 72.
       -------------------------------------------------------------------------
       Petición del usuario: «la bandeja filtra por persona; el Jefe sigue
       viéndolo todo».

       SE ORDENA, NO SE FILTRA, y la diferencia importa. Si a un técnico se le
       escondiera lo que no es suyo, dejaría de ver la orden que le van a
       asignar en diez minutos, y la que abandonó el compañero que se fue de
       turno. En una cuadrilla de cuatro personas eso es peor que el problema
       que resuelve.

       Lo suyo sube arriba y va marcado. Lo demás sigue estando, debajo. */
    const mio = (o: any) => (userId && o?.technician?.id === userId ? 0 : 1);
    const loMioArriba = <T,>(lista: T[]): T[] =>
      [...lista].sort((a, b) => mio(a) - mio(b));

    const sinDetallarOrdenadas = loMioArriba(sinDetallar).map((o: any) => ({
      ...o, esMia: userId ? o?.technician?.id === userId : false,
    }));
    const vencidasOrdenadas = loMioArriba(vencidas).map((o: any) => ({
      ...o, esMia: userId ? o?.technician?.id === userId : false,
    }));

    return {
      sinDetallar: sinDetallarOrdenadas,
      enEspera,
      vencidas: vencidasOrdenadas,
      firmasPendientes,
      accesos,
      incidenciasCriticas,
      incidenciasNormales,
      mejorasPropuestas,
      bajoMinimo,
      sobrantes,
      resumen: {
        sinDetallar: sinDetallar.length,
        /* Cuántas de las de arriba son SUYAS. Es el número con el que un
           técnico decide si abre la bandeja o sigue con lo que tenía. */
        mias: userId
          ? sinDetallar.filter((o: any) => o?.technician?.id === userId).length
            + vencidas.filter((o: any) => o?.technician?.id === userId).length
          : 0,
        enEspera: enEspera.length,
        // Las que además se pasaron del plazo razonable. Es el número que
        // de verdad hay que mirar: que haya órdenes en espera es normal.
        esperaExcedida: enEspera.filter((e) => e.excedida).length,
        vencidas: vencidas.length,
        firmasPendientes: firmasPendientes.length,
        accesos: accesos.length,
        incidenciasCriticas: incidenciasCriticas.length,
        incidenciasNormales: incidenciasNormales.length,
        mejorasPropuestas: mejorasPropuestas.length,
        bajoMinimo: bajoMinimo.length,
        sobrantes: sobrantes.length,
        // Total de cosas que esperan a alguien. Si es cero, la bandeja está
        // vacía y eso es una buena noticia que merece decirse.
        total: sinDetallar.length + vencidas.length + firmasPendientes.length
          + accesos.length + incidenciasCriticas.length + incidenciasNormales.length
          + mejorasPropuestas.length + bajoMinimo.length + sobrantes.length,
      },
      generado: ahora.toISOString(),
    };
  }
}
