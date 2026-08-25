import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { computeEffectiveStatuses } from '../../common/asset-status';
import { alcanza, ambitoDelUsuario, noVeNada } from '../../common/ambito-usuario';
import { evaluarEspera } from '../maintenance/espera';
import { proponer, resolver } from '../../common/intervenibilidad';
import {
  construirLineaDeTiempo, enPalabras, resumirTiempo,
  titularDeMateriales, veredictoDeMaterial, EstadoMaterialLinea,
} from '../../common/linea-de-tiempo';

/**
 * QUÉ CÁMARA FALLA Y QUÉ SE ESTÁ HACIENDO — bloque 39.
 *
 * =============================================================================
 *  PARA QUIÉN ES ESTO
 * =============================================================================
 *  Para el jefe de tren y el jefe de producción. NO arreglan nada, y no deben:
 *  el trabajo de campo es de Mantenimiento. Pero hoy se enteran de todo tarde
 *  y por radio, y cuando preguntan «¿qué pasa con esa cámara?» nadie tiene una
 *  respuesta con horas.
 *
 *  Aquí la tienen entera y de una sola vez:
 *
 *    · a QUÉ APUNTA la cámara, con la foto. Un código de activo no le dice
 *      nada a un jefe de línea; la foto del campo de visión, sí.
 *    · CUÁNDO se fue y cuándo lo reportaron — que son cosas distintas.
 *    · SI la están atacando, quién y desde cuándo.
 *    · CÓMO va, con la última nota del técnico.
 *    · QUÉ MATERIAL FALTA, con su código de SAP, para poder mover una compra.
 *    · HASTA DÓNDE pueden llegar hoy: en marcha, con permiso, o exige parada.
 *
 *  MIRAN. NO TOCAN. Este servicio es de sólo lectura y no expone ni una
 *  operación de escritura. El permiso `om.mirar` existe justo para eso: para
 *  no tener que dar `wo.read`, que abre el módulo de Mantenimiento entero.
 *
 * =============================================================================
 *  DOS COSAS QUE NO SE INVENTAN
 * =============================================================================
 *  1. LA HORA DE CAÍDA. Sólo se declara si el agente de monitoreo la vio, y
 *     con suficientes fallos seguidos. Sin agente se dice «reportada a las…»,
 *     nunca «se cayó a las…». La diferencia puede ser de horas.
 *
 *  2. EL STOCK DE UN MATERIAL FUERA DEL CATÁLOGO. Si el técnico escribió
 *     «abrazadera especial» a mano, no se dice que falten tres: se dice que no
 *     se puede saber.
 */
@Injectable()
export class CamarasCaidasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Estados en los que la cámara NO está dando imagen útil. */
  private readonly CIEGA = ['FUERA_SERVICIO', 'MANTENIMIENTO', 'CON_INCIDENCIA'];
  private readonly OM_VIVA = ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] as const;

  async porTren(trenCode: string, userId?: string, verMateriales = false) {
    const ambito = await ambitoDelUsuario(this.prisma, userId);

    /* EL ÁMBITO SE COMPRUEBA AQUÍ, NO EN LA PANTALLA. Un jefe del Tren 2 que
       escriba T1 en la dirección no ve el Tren 1: se le devuelve vacío.
       Bloque 42: la comparación va por `alcanza()`, que no confunde T1 con T10. */
    if (noVeNada(ambito)) return this.vacio(trenCode, ambito.motivo);
    if (!alcanza(ambito, trenCode)) {
      return this.vacio(trenCode, 'Ese tren no está en tu ámbito.');
    }

    const camaras = await this.prisma.asset.findMany({
      where: { deletedAt: null, type: 'CAMERA' },
      select: {
        id: true, assetCode: true, status: true, brand: true, model: true,
        referencePlace: true,
        location: { select: { id: true, name: true } },
      },
    });

    const [estados, ctx] = await Promise.all([
      computeEffectiveStatuses(this.prisma, camaras),
      resolverContextoDePlanta(this.prisma, camaras),
    ]);

    // Sólo las de ESTE tren y que no están viendo.
    const caidas = camaras.filter((c) => {
      const suyo = (ctx[c.id]?.trenCode || '').toUpperCase();
      if (!suyo.includes(trenCode.toUpperCase())) return false;
      return this.CIEGA.includes(estados[c.id] || c.status);
    });

    if (!caidas.length) {
      const delTren = camaras.filter((c) =>
        (ctx[c.id]?.trenCode || '').toUpperCase().includes(trenCode.toUpperCase()));
      /* SE DEVUELVE LA LISTA AUNQUE ESTÉN TODAS BIEN.
         -------------------------------------------------------------------
         Antes esto devolvía `camaras: []` y un titular. La pantalla se
         llamaba «Mis cámaras» y no enseñaba ni una: sólo un recuadro verde.
         En una demostración eso parece una pantalla que no funciona, y en el
         día a día no responde la pregunta obvia — «¿cuáles son mis cámaras?».

         Ahora se devuelven con su ubicación y su estado. Sin novedad sigue
         siendo sin novedad, pero se ve QUÉ es lo que está sin novedad. */
      return this.vacio(trenCode, null, delTren.length, delTren.map((c) => ({
        id: c.id,
        assetCode: c.assetCode,
        estado: estados[c.id] || c.status,
        lugar: c.location?.name || c.referencePlace || null,
        etapa: ctx[c.id]?.etapaNombre || null,
        zonaVital: ctx[c.id]?.zonaVital ?? false,
      })));
    }

    const ids = caidas.map((c) => c.id);

    /* Todo lo que hace falta, en CUATRO consultas para N cámaras. Una consulta
       por cámara serían 4N: con veinte cámaras caídas en un mal día son
       ochenta viajes a la base para pintar una pantalla. */
    const [observaciones, incidencias, ordenes, fotos] = await Promise.all([
      this.prisma.assetObservation.findMany({
        where: { assetId: { in: ids } },
        select: { assetId: true, lastSeenAt: true, consecutiveFails: true, result: true },
      }),
      this.prisma.incident.findMany({
        where: { assetId: { in: ids }, status: { in: ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO'] } },
        orderBy: { reportedAt: 'asc' },
        select: {
          assetId: true, code: true, title: true, priority: true, reportedAt: true,
          /* `Incident` NO guarda quién reportó: guarda el RESPONSABLE de
             resolverla. Se usa ése y se llama por su nombre. Poner el
             responsable donde va «reportada por» sería atribuirle a alguien
             un aviso que quizá no dio. */
          responsible: { select: { fullName: true } },
        },
      }),
      this.prisma.workOrder.findMany({
        where: { assetId: { in: ids }, status: { in: this.OM_VIVA as any } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, assetId: true, code: true, status: true, activity: true,
          progressPct: true, createdAt: true, startedAt: true, updatedAt: true,
          scheduledDate: true,
          technician: { select: { fullName: true } },
          assignedBy: { select: { fullName: true } },
          openedBy: { select: { fullName: true } },
          progress: {
            orderBy: { reportedAt: 'desc' }, take: 1,
            select: { pct: true, note: true, reasonCode: true, reportedAt: true,
                      reportedBy: { select: { fullName: true } } },
          },
          materialItems: verMateriales ? {
            select: {
              description: true, sapCode: true, status: true,
              plannedQty: true, withdrawnQty: true, rejectedReason: true,
              sparePart: { select: { currentStock: true } },
            },
          } : false,
        },
      }),
      /* La foto de A QUÉ APUNTA. Es la que convierte «AA-CAM-T2-COL-004» en
         algo que un jefe de línea reconoce sin sacar el plano. */
      this.prisma.assetPhoto.findMany({
        where: { assetId: { in: ids }, kind: 'APUNTA' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, assetId: true, fileId: true, caption: true },
      }),
    ]);

    const obsDe = new Map(observaciones.map((o) => [o.assetId, o]));
    const incDe = new Map<string, typeof incidencias[number]>();
    for (const i of incidencias) if (i.assetId && !incDe.has(i.assetId)) incDe.set(i.assetId, i);
    const omDe = new Map<string, any>();
    for (const w of ordenes) if (w.assetId && !omDe.has(w.assetId)) omDe.set(w.assetId, w);
    const fotoDe = new Map<string, typeof fotos[number]>();
    for (const f of fotos) if (!fotoDe.has(f.assetId)) fotoDe.set(f.assetId, f);

    const ahora = Date.now();
    const filas = caidas.map((c) => this.armarFila(c, ctx[c.id], estados[c.id],
      obsDe.get(c.id), incDe.get(c.id), omDe.get(c.id), fotoDe.get(c.id), ahora, verMateriales));

    /* Orden: primero lo que más duele. Zona vital, luego lo que lleva más
       tiempo. Sin esto, la primera fila sería la que el índice de la base
       devolvió antes — es decir, ninguna razón. */
    filas.sort((a, b) =>
      Number(b.zonaVital) - Number(a.zonaVital)
      || (b.tiempo.totalMin ?? 0) - (a.tiempo.totalMin ?? 0));

    const sinAgente = filas.every((f) => f.tiempo.horaDeCaidaDesconocida);

    return {
      tren: trenCode,
      camaras: filas,
      titular: this.titular(filas),
      /* Se dice si el agente está o no. Con él, «se fue a las 06:12» es un
         hecho; sin él, lo único que hay es cuándo alguien avisó — y esa
         diferencia puede ser de horas. */
      horaDeCaidaDisponible: !sinAgente,
      avisoSinAgente: sinAgente
        ? 'Sin el agente de monitoreo instalado no se sabe a qué hora se fue de '
          + 'verdad cada cámara, sólo cuándo alguien la reportó. Entre las dos '
          + 'cosas puede haber horas.'
        : null,
    };
  }

  // ---------------------------------------------------------------- una fila

  private armarFila(
    c: any, ctx: any, estadoEfectivo: string,
    obs: any, inc: any, om: any, foto: any, ahora: number, verMateriales: boolean,
  ) {
    const hitos = construirLineaDeTiempo({
      dejoDeResponderEn: obs?.result === 'NO_RESPONDE' ? obs?.lastSeenAt : null,
      fallosSeguidos: obs?.consecutiveFails,
      reportadaEn: inc?.reportedAt ?? null,
      reportadaPor: inc?.responsible?.fullName ?? null,
      ordenAbiertaEn: om?.createdAt ?? null,
      asignadaA: om?.technician?.fullName ?? null,
      trabajoIniciadoEn: om?.startedAt ?? null,
      inicioFirmadoPor: om?.openedBy?.fullName ?? null,
    });
    const tiempo = resumirTiempo(hitos, ahora);

    // ¿Se puede tocar hoy sin parar el tren? Lo decide el bloque 28.
    const propuesta = proponer(ctx?.ambiente, ctx?.requiereAltura);
    const intervencion = resolver(propuesta, ctx?.intervencionFirmada);

    /* ¿ESTÁ PARADA ESPERANDO ALGO, Y DESDE CUÁNDO?
       -----------------------------------------------------------------------
       `WorkOrder` no tiene columnas propias de espera. El motivo y la fecha se
       derivan del ÚLTIMO PARTE DE AVANCE, que es donde el técnico declara por
       qué no pudo seguir. Es exactamente lo que ya hace la bandeja del
       ingeniero, y tiene que hacerse igual: si aquí se calculara de otra
       forma, la misma orden diría «14 h esperando» en una pantalla y «3 días»
       en otra.

       Si no hay ningún parte, se cae a `updatedAt`. No es exacto, pero es
       mucho mejor que no decir nada, y se afina solo en cuanto el técnico
       registre un avance. */
    const ultimoAvance = om?.progress?.[0];
    const espera = om?.status === 'EN_ESPERA'
      ? evaluarEspera({
        id: om.id, code: om.code, activity: om.activity,
        desde: ultimoAvance?.reportedAt ?? om.updatedAt,
        motivo: ultimoAvance?.reasonCode ?? null,
        motivoTexto: ultimoAvance?.note ?? null,
      }, ahora)
      : null;

    const materiales = verMateriales && om?.materialItems
      ? om.materialItems.map((m: any) => veredictoDeMaterial({
        descripcion: m.description,
        sapCode: m.sapCode,
        estado: m.status as EstadoMaterialLinea,
        previsto: m.plannedQty,
        retirado: m.withdrawnQty,
        /* `undefined` cuando la línea no está ligada al catálogo: escrita a
           mano. No es lo mismo que stock 0, y el veredicto lo distingue. */
        stock: m.sparePart?.currentStock ?? null,
        motivoRechazo: m.rejectedReason,
      }))
      : null;

    return {
      id: c.id,
      codigo: c.assetCode,
      /* «Colada continua» es lo que el jefe de línea reconoce; el código de
         activo es para el técnico. Los dos, en ese orden. */
      zona: ctx?.zonaCriticaNombre || c.location?.name || 'Sin zona asignada',
      queSeVigila: ctx?.queSeVigila ?? null,
      lugar: c.referencePlace ?? null,
      modelo: [c.brand, c.model].filter(Boolean).join(' ') || null,
      estado: estadoEfectivo,
      zonaVital: !!ctx?.zonaVital,
      porQueEsVital: ctx?.porQueEsVital ?? null,

      /* A QUÉ APUNTA. Si no hay foto se dice: es una tarea concreta para el
         mapeo, no un hueco gris en la pantalla. */
      foto: foto
        ? { id: foto.id, url: `/api/v1/assets/photos/${foto.id}/file`, pie: foto.caption }
        : null,

      hitos: hitos.map((h) => ({
        ...h,
        hace: h.desdeElAnterior !== null ? enPalabras(h.desdeElAnterior) : null,
      })),
      tiempo: { ...tiempo, enPalabras: enPalabras(tiempo.totalMin) },

      incidencia: inc ? { code: inc.code, titulo: inc.title, prioridad: inc.priority } : null,

      orden: om ? {
        code: om.code,
        estado: om.status,
        actividad: om.activity,
        avance: om.progressPct ?? 0,
        tecnico: om.technician?.fullName ?? null,
        asignadaPor: om.assignedBy?.fullName ?? null,
        para: om.scheduledDate,
        ultimaNota: ultimoAvance ? {
          pct: ultimoAvance.pct,
          texto: ultimoAvance.note || ultimoAvance.reasonCode || null,
          quien: ultimoAvance.reportedBy?.fullName ?? null,
          cuando: ultimoAvance.reportedAt,
          hace: enPalabras(Math.round((ahora - ultimoAvance.reportedAt.getTime()) / 60_000)),
        } : null,
      } : null,

      espera: espera ? {
        texto: espera.texto, dias: espera.dias, plazo: espera.plazo,
        excedida: espera.excedida,
      } : null,

      /* HASTA DÓNDE SE PUEDE LLEGAR HOY.
         `resolver()` devuelve `EXIGE_PARADA` cuando NO hay firma, sea cual sea
         la propuesta. Es deliberado del bloque 28: sin firma del supervisor de
         tercería o del jefe de mantenimiento, nadie se acerca a una línea en
         marcha. Aquí se enseña tal cual, sin suavizarlo. */
      intervencion: {
        nivel: intervencion.aplica,
        porQue: intervencion.motivo,
        firmada: intervencion.estaFirmada,
        firmaDesactualizada: intervencion.firmaDesactualizada,
      },

      materiales,
      faltaMaterial: materiales ? titularDeMateriales(materiales) : null,
    };
  }

  // ------------------------------------------------------------- el titular

  private titular(filas: any[]): string {
    const n = filas.length;
    const vitales = filas.filter((f) => f.zonaVital).length;
    const sinAtender = filas.filter((f) => !f.orden).length;

    let t = `${n} ${n === 1 ? 'cámara sin imagen' : 'cámaras sin imagen'}`;
    if (vitales) t += `, ${vitales} en zona vital`;

    /* Lo que de verdad quiere saber el jefe no es cuántas hay: es si alguien
       las está mirando. Una cámara caída con técnico encima es un trámite;
       una caída sin orden es un olvido. */
    if (sinAtender) {
      t += `. ${sinAtender} sin nadie asignado todavía`;
    } else {
      t += '. Todas con técnico asignado';
    }
    return t + '.';
  }

  private vacio(tren: string, motivo: string | null, total = 0, operativas: any[] = []) {
    return {
      tren,
      camaras: [],
      /** Las que SÍ están dando imagen. Se enseñan para que la pantalla
       *  responda «cuáles son mis cámaras», no sólo «cuáles fallan». */
      operativas,
      titular: motivo
        ?? (total === 0
          ? 'Este tren todavía no tiene cámaras cargadas'
          : `Las ${total} cámaras del tren están dando imagen`),
      horaDeCaidaDisponible: false,
      avisoSinAgente: null,
    };
  }
}
