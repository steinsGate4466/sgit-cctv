import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BandejaSalidaService } from '../notificaciones/bandeja-salida.service';
import { incidenciaCritica, tuReporteSeResolvio } from '../notificaciones/plantillas';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { Prisma } from '../../generated/prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { filtroDeUbicaciones } from '../../common/ambito-planta';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { QueryIncidentDto } from './dto/query-incident.dto';
import { ResolveIncidentDto } from './dto/resolve-incident.dto';
import { computeEffectiveStatuses } from '../../common/asset-status';
import { conReintentoDeCodigo, esChoqueDeUnicidad, siguienteCorrelativo } from '../../common/correlativo';
import {
  Criticidad,
  firmaDeQuienReporta,
  reporteDeProduccion,
} from './reporte-de-produccion';
// PDF: require para no depender de @types en el build.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

const assetSel = { asset: { select: { id: true, assetCode: true, type: true, status: true } } };

@Injectable()
export class IncidentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
    private avisos: BandejaSalidaService,
  ) {}

  private readonly logger = new Logger('Incidencias');

  /**
   * EL CORRELATIVO, DEL ÚLTIMO CÓDIGO Y NO DE UN CONTEO.
   *
   * Antes era `count() + 1`. Eso funciona hasta la primera vez que se borra
   * algo — y hay una pantalla de Limpieza que borra incidencias. Con 42
   * incidencias, se borran 3, la siguiente pide INC-2026-0040… que ya existe.
   * Y como `code` es único, la creación revienta con un error que no dice
   * nada de lo que pasó realmente.
   *
   * Ahora se pide el mayor código DEL AÑO y se le suma uno, igual que en
   * instalaciones y en órdenes. El prefijo lleva el año, así que la serie se
   * reinicia sola en enero.
   *
   * Recibe el cliente porque dentro de una transacción hay que leer con el
   * MISMO cliente: leer con `this.prisma` desde dentro miraría fuera de la
   * transacción y devolvería un número obsoleto.
   */
  private async nextCode(cliente: Prisma.TransactionClient | PrismaService = this.prisma): Promise<string> {
    const prefijo = `INC-${new Date().getFullYear()}-`;
    const ultimo = await cliente.incident.findFirst({
      where: { code: { startsWith: prefijo } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    return siguienteCorrelativo(ultimo?.code ?? null, prefijo);
  }

  /**
   * CUÁNDO SE CAYÓ DE VERDAD — bloque 68.
   *
   * Tres reglas, y las tres salieron de pensar qué se escribe con guantes:
   *
   *  1. VACÍO ES UNA RESPUESTA. Si no se sabe, se deja `null` y se usa la
   *     fecha de reporte. Rellenarlo por rellenar inventa un dato que luego
   *     nadie sabe distinguir de uno medido.
   *
   *  2. EL FUTURO SE RECHAZA, y con un mensaje que dice qué pasa. Una avería
   *     no puede haber ocurrido mañana; si llega así es un dedazo en el
   *     calendario, y guardarlo daría un MTTR NEGATIVO que rompe el informe
   *     del mes sin que nadie sepa por qué.
   *
   *  3. HAY UN MARGEN DE UN MINUTO. El reloj del móvil del técnico y el del
   *     servidor no van sincronizados al segundo. Sin margen, «ahora mismo»
   *     se rechazaría a veces sí y a veces no, que es la peor clase de fallo:
   *     el que no se puede reproducir.
   */
  private cuandoOcurrio(valor?: string | null): Date | null {
    if (!valor) return null;
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return null;
    if (d.getTime() > Date.now() + 60_000) {
      throw new BadRequestException(
        'La avería no puede haber ocurrido en el futuro. Revisa la fecha.',
      );
    }
    return d;
  }

  async create(dto: CreateIncidentDto) {
    const inc = await this.prisma.incident.create({
      data: {
        code: await this.nextCode(),
        title: dto.title,
        description: dto.description,
        category: dto.category,
        priority: dto.priority,
        assetId: dto.assetId,
        zone: (dto as any).zone,
        concurrentSessions: dto.concurrentSessions,
        affectedCameras: dto.affectedCameras,
        visionDownMin: dto.visionDownMin,
        occurredAt: this.cuandoOcurrio(dto.occurredAt),
      },
      include: assetSel,
    });

    // AVISO DE INCIDENCIA ALTA O CRÍTICA.
    //
    // Sólo esas dos. Avisar de todas convertiría el bot en ruido y la gente
    // lo silenciaría — y entonces tampoco vería las críticas. Lo que
    // despierta se reserva para lo que exige levantarse.
    if (inc.priority === 'ALTA' || inc.priority === 'CRITICA') {
      // El tren no es una columna: se deriva del árbol. Se resuelve aquí para
      // que el aviso diga DÓNDE, que es lo primero que se pregunta.
      let tren: string | null = null;
      if (inc.assetId) {
        const activo = await this.prisma.asset
          .findUnique({ where: { id: inc.assetId }, select: { id: true, locationId: true, assetCode: true } })
          .catch(() => null);
        if (activo) {
          const ctx = await resolverContextoDePlanta(this.prisma, [activo] as any).catch(() => ({} as any));
          tren = ctx?.[activo.id]?.trenNombre || ctx?.[activo.id]?.trenCode || null;
        }
      }
      const activo = inc.assetId
        ? await this.prisma.asset
            .findUnique({ where: { id: inc.assetId }, select: { assetCode: true } })
            .catch(() => null)
        : null;

      await this.avisos.encolar(
        'INCIDENCIA_ALTA',
        incidenciaCritica({
          code: inc.code,
          titulo: inc.title,
          equipo: activo?.assetCode,
          tren,
          prioridad: inc.priority,
          reportaba: inc.responsibleName,
          enlace: enlaceIncidencia(inc.code),
        }),
        await this.avisos.destinatarios('INGENIERO').catch(() => []),
        inc.id,
      ).catch(() => 0);
    }
    return inc;
  }

  /**
   * ===========================================================================
   *  EL REPORTE DE PRODUCCIÓN — bloque 51-B
   * ===========================================================================
   *  TRES campos: qué cámara, la zona si la sabe, y una foto si puede. Nada
   *  más. Ni categoría, ni prioridad, ni sesiones del NVR. El Ing. Cañasas no
   *  sabe esas cosas y no tiene por qué; lo que sabe es que no está viendo el
   *  lecho de enfriamiento, y eso es exactamente lo que se le pide.
   *
   *  Todo lo demás lo pone el sistema:
   *    · el tren        → del árbol de planta, no lo teclea nadie
   *    · la prioridad   → de la criticidad DECLARADA de la zona
   *    · la categoría   → CAMARA_SIN_IMAGEN, que es lo que él está viendo
   *    · quién reportó  → de su sesión
   *
   *  POR QUÉ SE SERIALIZA POR ACTIVO
   *  Cuando una cámara se cae en el púlpito, se cae para todos a la vez, y
   *  tres personas tocan «reportar» en el mismo minuto. Sin el candado, los
   *  tres leerían «no hay ninguna abierta» y crearían tres incidencias del
   *  mismo problema. El `pg_advisory_xact_lock` las pone en fila por activo:
   *  la primera crea, las otras dos se suman. Dura lo que dura la transacción
   *  y no bloquea a nadie que trabaje sobre otro equipo.
   *
   *  La foto se sube FUERA de la transacción, a propósito: subir a MinIO puede
   *  tardar segundos con la señal de planta, y tener la fila de la base
   *  esperando por eso bloquearía a los demás reportando la misma cámara.
   */
  async reportarDesdeProduccion(
    assetId: string,
    userId: string,
    zona?: string | null,
    file?: any,
  ) {
    const activo = await this.prisma.asset.findFirst({
      where: { id: assetId, deletedAt: null },
      // `referencePlace` es el lugar de referencia en planta —«lecho de
      // enfriamiento»—. Es lo que la gente usa para nombrar la cámara cuando
      // no se sabe el código, así que es el mejor sustituto de la zona.
      select: { id: true, assetCode: true, referencePlace: true, locationId: true },
    });
    if (!activo) throw new NotFoundException('Esa cámara no está en el sistema.');

    const quien = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true },
    });
    if (!quien) throw new BadRequestException('No se pudo identificar quién reporta.');

    // Tren y criticidad declarada: los dos salen del árbol, no del formulario.
    const ctx = await resolverContextoDePlanta(this.prisma, [activo] as any).catch(() => ({} as any));
    const contexto = ctx?.[activo.id];

    /* La foto se sube ANTES de entrar a la transacción. Ver la nota de arriba:
       la señal de planta hace que esto tarde, y la transacción tiene que ser
       corta. Si la subida falla, el reporte sigue: perder la foto es malo,
       perder el aviso de que la línea no ve es peor. */
    let fileId: string | null = null;
    if (file?.buffer) {
      const ext = (file.originalname?.split('.').pop() || 'jpg').toLowerCase();
      const objeto = `inc/reporte/${assetId}/${Date.now()}-${randomUUID()}.${ext}`;
      try {
        await this.storage.put(objeto, file.buffer, file.mimetype || 'image/jpeg');
        fileId = objeto;
      } catch (e: any) {
        this.logger.warn(`No se pudo guardar la foto del reporte de ${activo.assetCode}: ${e?.message}`);
      }
    }

    const zonaLimpia = (zona || '').trim() || null;

    /* El candado serializa a los que reportan LA MISMA cámara. Pero dos
       personas reportando cámaras DISTINTAS a la vez pueden pedir el mismo
       correlativo, y ahí choca la unicidad de `code`. Se reintenta con el
       patrón ya probado del bloque 37: releer y volver, con espera al azar.
       Va FUERA de la transacción porque un choque la aborta entera. */
    const salida = await conReintentoDeCodigo(() => this.prisma.$transaction(async (tx) => {
      // Una cámara, un reporte a la vez. Ver la nota del candado arriba.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${assetId}))`;

      /* Sólo hacen falta las vivas y la última que se resolvió. Traer el
         historial entero de una cámara con dos años de fallas sería pagar
         una consulta grande para responder una pregunta pequeña. */
      const delActivo = await tx.incident.findMany({
        where: { assetId },
        orderBy: { reportedAt: 'desc' },
        take: 20,
        select: {
          id: true, code: true, status: true, priority: true,
          reportedAt: true, resolvedAt: true,
          avisos: { select: { userId: true } },
          reportedById: true,
        },
      });

      const decision = reporteDeProduccion({
        activoCodigo: activo.assetCode,
        activoNombre: activo.referencePlace,
        zonaEscrita: zonaLimpia,
        quienReportaId: quien.id,
        quienReportaNombre: quien.fullName,
        trenNombre: contexto?.trenNombre ?? null,
        criticidadZona: (contexto?.criticidadProduccion ?? null) as Criticidad,
        incidenciasDelActivo: delActivo.map((i) => ({
          id: i.id,
          code: i.code,
          estado: i.status as string,
          reportadaEn: i.reportedAt,
          resueltaEn: i.resolvedAt,
          prioridad: i.priority as any,
          /* Quien la abrió también cuenta como avisador, aunque no tenga fila
             en `incident_avisos`: si no, el que reportó primero podría volver
             a reportar y el contador subiría a dos con una sola persona. */
          yaAvisaronIds: [
            ...(i.reportedById ? [i.reportedById] : []),
            ...i.avisos.map((a) => a.userId),
          ],
        })),
        ahora: new Date(),
      });

      if (decision.decision === 'NUEVA') {
        const inc = await tx.incident.create({
          data: {
            code: await this.nextCode(tx),
            title: decision.titulo,
            category: 'CAMARA_SIN_IMAGEN',
            priority: decision.prioridad,
            assetId: activo.id,
            zone: zonaLimpia,
            canalOrigen: 'PRODUCCION',
            reportedById: quien.id,
            reaparecio: decision.reaparecio,
            /* La firma va en la descripción y no en un campo suelto porque es
               lo que se lee en la bandeja sin abrir nada. */
            description: firmaDeQuienReporta(quien.fullName, contexto?.trenNombre ?? null),
          },
          select: { id: true, code: true, priority: true },
        });
        if (fileId) {
          await tx.incidentEvidence.create({
            data: { incidentId: inc.id, fileId, caption: 'Foto del púlpito' },
          });
        }
        return { ...decision, incidenciaId: inc.id, incidenciaCodigo: inc.code };
      }

      if (decision.decision === 'SE_SUMA' && decision.incidenciaId) {
        /* Si dos toques del MISMO dedo entran a la vez, el candado los pone en
           fila pero el segundo ya no ve nada nuevo que crear. El índice único
           lo rechaza, y eso NO es un error que deba ver el púlpito: es
           exactamente el caso «ya lo reportaste». Reintentarlo ocho veces
           daría ocho rechazos y una pantalla roja por tocar dos veces. */
        const creado = await tx.incidentAviso
          .create({
            data: { incidentId: decision.incidenciaId, userId: quien.id, zona: zonaLimpia, fileId },
          })
          .catch((e: any) => {
            if (esChoqueDeUnicidad(e)) return null;
            throw e;
          });
        if (!creado) {
          return {
            ...decision,
            decision: 'YA_LO_REPORTASTE' as const,
            vecesReportada: decision.vecesReportada - 1,
            sugiereSubirPrioridad: false,
            respuesta: `Ya lo reportaste (${decision.incidenciaCodigo}). Sigue abierta.`,
          };
        }
        if (fileId) {
          await tx.incidentEvidence.create({
            data: {
              incidentId: decision.incidenciaId,
              fileId,
              caption: `Foto de ${quien.fullName}`,
            },
          });
        }
      }
      return decision;
    }));

    /* El aviso al ingeniero va FUERA de la transacción y con `catch`: que
       Telegram esté caído no puede impedir que Producción reporte. */
    if (salida.decision === 'NUEVA' && (salida.prioridad === 'ALTA' || salida.prioridad === 'CRITICA')) {
      await this.avisos.encolar(
        'INCIDENCIA_ALTA',
        incidenciaCritica({
          code: salida.incidenciaCodigo || '',
          titulo: salida.titulo,
          equipo: activo.assetCode,
          tren: contexto?.trenNombre ?? null,
          prioridad: salida.prioridad,
          reportaba: quien.fullName,
          enlace: enlaceIncidencia(salida.incidenciaCodigo || ''),
        }),
        await this.avisos.destinatarios('INGENIERO').catch(() => []),
        salida.incidenciaId,
      ).catch(() => 0);
    }

    return {
      ...salida,
      equipo: activo.assetCode,
      tren: contexto?.trenNombre ?? null,
      firma: firmaDeQuienReporta(quien.fullName, contexto?.trenNombre ?? null),
      fotoGuardada: !!fileId,
    };
  }

  async findAll(q: QueryIncidentDto) {
    const page = q.page && q.page > 0 ? q.page : 1;
    const pageSize = q.pageSize && q.pageSize > 0 && q.pageSize <= 200 ? q.pageSize : 50;
    // Tipado con el WhereInput que genera Prisma: si se escribe mal el
    // nombre de un campo o se anida un filtro dentro de otro, lo dice al
    // compilar en lugar de devolver un 400 en producción.
    const where: Prisma.IncidentWhereInput = { status: q.status, category: q.category, priority: q.priority, assetId: q.assetId };

    // Ámbito de planta: la incidencia hereda el tren de su activo.
    const ambito = await filtroDeUbicaciones(this.prisma, { tren: q.tren, etapa: q.etapa });
    if (ambito) where.asset = { locationId: ambito };
    if (q.q && q.q.trim()) {
      const t = q.q.trim();
      where.OR = [
        { code: { contains: t, mode: 'insensitive' } },
        { title: { contains: t, mode: 'insensitive' } },
        { zone: { contains: t, mode: 'insensitive' } },
      ];
    }
    // El rango se arma ENTERO y se asigna una vez.
    //
    // Antes era `where.reportedAt = {}` y luego `.gte = ...`. Con el tipo real
    // de Prisma eso NO COMPILA: `reportedAt` puede ser una fecha o un filtro,
    // y a una unión no se le puede tocar una propiedad sin decidir cuál es.
    // Escribirlo así no es un rodeo para contentar al compilador: describe
    // mejor lo que pasa, que es "este es el filtro de fechas", no "creo un
    // objeto vacío y lo voy rellenando".
    if (q.from || q.to) {
      where.reportedAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    const [total, data] = await this.prisma.$transaction([
      this.prisma.incident.count({ where }),
      this.prisma.incident.findMany({
        where,
        orderBy: { reportedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: assetSel,
      }),
    ]);
    // Estado operativo derivado del activo afectado (coherencia con la incidencia).
    const assetsForStatus = data.map((i: any) => i.asset).filter((a: any) => a && a.id);
    const eff = await computeEffectiveStatuses(this.prisma, assetsForStatus);
    for (const i of data as any[]) {
      if (i.asset && i.asset.id) i.asset.effectiveStatus = eff[i.asset.id] || i.asset.status;
    }
    return { page, pageSize, total, data };
  }

  async findOne(id: string) {
    const inc = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        asset: true,
        responsible: { select: { id: true, fullName: true } },
        evidences: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!inc) throw new NotFoundException('Incidencia no encontrada');
    return inc;
  }

  async update(id: string, dto: UpdateIncidentDto) {
    const current = await this.prisma.incident.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Incidencia no encontrada');
    // El cierre/resolución NO se hace por esta vía: exige firma del Jefe (endpoint /resolve).
    // Aquí solo se permiten estados no terminales (Abierta, En diagnóstico, En proceso, En espera).
    if (dto.status === 'RESUELTA' || dto.status === 'CERRADA') {
      throw new ForbiddenException('El cierre de la incidencia lo firma el Jefe de Mantenimiento (usa “Resolver”).');
    }
    const data: any = { ...dto };
    return this.prisma.incident.update({ where: { id }, data, include: assetSel });
  }

  /**
   * Resuelve con FIRMA + retroalimentación de análisis (solución, causa, materiales,
   * técnicos, responsable, observaciones, jefe de línea, impacto).
   */
  async resolveSigned(id: string, dto: ResolveIncidentDto, ip?: string | null) {
    const inc = await this.prisma.incident.findUnique({ where: { id } });
    if (!inc) throw new NotFoundException('Incidencia no encontrada');

    const signer = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = signer && signer.active
      ? await argon2.verify(signer.passwordHash, dto.password).catch(() => false)
      : false;
    if (!valid) {
      await this.audit.record({
        userId: signer?.id || null, action: 'FIRMA_FALLIDA', entity: 'incidents', entityId: id, ip,
        after: { intento: dto.email, motivo: 'contraseña incorrecta', accion: 'resolver incidencia' },
      });
      throw new BadRequestException('Firma inválida: contraseña incorrecta');
    }

    const resolvedAt = new Date();
    const updated = await this.prisma.incident.update({
      where: { id },
      data: {
        status: 'RESUELTA',
        solution: dto.solution ?? inc.solution,
        rootCause: dto.rootCause ?? inc.rootCause,
        materials: dto.materials ?? inc.materials,
        interveners: dto.interveners ?? inc.interveners,
        responsibleName: dto.responsibleName ?? inc.responsibleName,
        observations: dto.observations ?? inc.observations,
        lineManagerNotified: dto.lineManagerNotified ?? inc.lineManagerNotified,
        affectedCameras: dto.affectedCameras ?? inc.affectedCameras,
        visionDownMin: dto.visionDownMin ?? inc.visionDownMin,
        resolvedAt: inc.resolvedAt || resolvedAt,
        mttrMinutes: inc.mttrMinutes ?? Math.max(0, Math.round((resolvedAt.getTime() - inc.reportedAt.getTime()) / 60000)),
        responsibleId: signer!.id,
      },
      include: assetSel,
    });

    await this.audit.record({
      userId: signer!.id, action: 'RESOLVE', entity: 'incidents', entityId: id, ip,
      after: { firmadoPor: signer!.email, incidente: inc.code },
    });

    /* SE LE CONTESTA A QUIEN AVISÓ — bloque 51-B.
       El Ing. Cañasas reportó, alguien fue, la arregló, y él no se enteró
       nunca. La próxima vez usa la radio. Este aviso es lo que hace que el
       canal se siga usando; un canal que no contesta se abandona en dos
       semanas. Va con `catch`: Telegram caído no puede impedir un cierre. */
    if (updated.reportedById) {
      await this.avisos.encolar(
        'REPORTE_RESUELTO',
        tuReporteSeResolvio({
          code: updated.code,
          equipo: updated.asset?.assetCode,
          zona: updated.zone,
          duracionMin: updated.mttrMinutes,
          enlace: enlaceIncidencia(updated.code),
        }),
        await this.avisos.aUnaPersona(updated.reportedById).catch(() => []),
        updated.id,
      ).catch(() => 0);
    }
    return updated;
  }

  // ---------- Fotografías de campo ----------
  async addEvidence(id: string, file: any, caption?: string) {
    const inc = await this.prisma.incident.findUnique({ where: { id } });
    if (!inc) throw new NotFoundException('Incidencia no encontrada');
    if (!file || !file.buffer) throw new BadRequestException('Archivo de imagen requerido');
    const ext = (file.originalname?.split('.').pop() || 'jpg').toLowerCase();
    const objectName = `inc/${id}/${Date.now()}-${randomUUID()}.${ext}`;
    await this.storage.put(objectName, file.buffer, file.mimetype || 'image/jpeg');
    return this.prisma.incidentEvidence.create({
      data: { incidentId: id, fileId: objectName, caption: caption || null },
    });
  }

  async listEvidence(id: string) {
    return this.prisma.incidentEvidence.findMany({ where: { incidentId: id }, orderBy: { createdAt: 'asc' } });
  }

  async getEvidenceFile(evidenceId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const ev = await this.prisma.incidentEvidence.findUnique({ where: { id: evidenceId } });
    if (!ev) throw new NotFoundException('Evidencia no encontrada');
    const buffer = await this.storage.getBuffer(ev.fileId);
    const ext = ev.fileId.split('.').pop()?.toLowerCase();
    return { buffer, contentType: ext === 'png' ? 'image/png' : 'image/jpeg' };
  }

  // ---------- Informe PDF de la incidencia ----------
  async buildReport(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const inc = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        asset: true,
        responsible: { select: { fullName: true } },
        evidences: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!inc) throw new NotFoundException('Incidencia no encontrada');

    const images: { buffer: Buffer; caption?: string | null }[] = [];
    for (const ev of inc.evidences) {
      try { images.push({ buffer: await this.storage.getBuffer(ev.fileId), caption: ev.caption }); } catch { /* omitir */ }
    }

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const NAVY = '#1b2a4a', RED = '#c0392b', GREY = '#555555';
    const pageW = doc.page.width;
    const fmt = (d?: Date | null) => (d ? new Date(d).toLocaleString('es-PE') : '—');

    doc.rect(0, 0, pageW, 92).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(17).text('ACEROS AREQUIPA — Planta Pisco', 50, 26);
    doc.fillColor('#cfd8e3').fontSize(10).text('SGIT-CCTV · Informe de Incidencia', 50, 50);
    doc.fillColor('#ffffff').fontSize(20).text(inc.code, 0, 34, { align: 'right', width: pageW - 50 });
    doc.fillColor('#000000');

    let y = 116;
    const heading = (t: string) => {
      doc.fontSize(13).fillColor(NAVY).text(t, 50, y); y = doc.y + 6;
      doc.moveTo(50, y).lineTo(pageW - 50, y).strokeColor('#dddddd').stroke(); y += 8;
    };
    const line = (label: string, value: string) => {
      doc.fontSize(10).fillColor(GREY).text(label, 50, y);
      doc.fontSize(11).fillColor('#000000').text(value || '—', 200, y, { width: pageW - 250 });
      y = doc.y + 6;
    };
    const block = (label: string, value: string) => {
      doc.fontSize(10).fillColor(GREY).text(label, 50, y); y = doc.y + 3;
      doc.fontSize(11).fillColor('#000000').text(value || '—', 50, y, { width: pageW - 100 }); y = doc.y + 8;
    };

    heading('Datos de la incidencia');
    line('Título', inc.title);
    line('Categoría', inc.category);
    line('Prioridad', inc.priority);
    line('Estado', inc.status);
    line('Zona / área', inc.zone || '—');
    line('Activo', inc.asset ? `${inc.asset.assetCode} (${inc.asset.type})` : '—');
    line('Reportada', fmt(inc.reportedAt));
    line('Resuelta', fmt(inc.resolvedAt));
    line('Tiempo de resolución (MTTR)', inc.mttrMinutes != null ? `${inc.mttrMinutes} min` : '—');
    line('Cámaras afectadas', inc.affectedCameras != null ? String(inc.affectedCameras) : '—');
    line('Minutos sin visión', inc.visionDownMin != null ? String(inc.visionDownMin) : '—');
    line('Firmado / responsable', inc.responsible ? inc.responsible.fullName : (inc.responsibleName || '—'));
    line('Jefe de línea enterado', inc.lineManagerNotified ? 'Sí' : 'No');

    y += 6;
    heading('Descripción del problema');
    doc.fontSize(11).fillColor('#000000').text(inc.description || '—', 50, y, { width: pageW - 100 }); y = doc.y + 10;

    // Propuesta técnica: qué se plantea hacer, qué demanda y qué riesgo hay si no se atiende.
    if (inc.proposal || inc.proposalCost || inc.proposalRisk || inc.requiresThirdParty) {
      heading('Propuesta técnica de solución');
      block('Propuesta planteada', inc.proposal || '—');
      block('Recursos / materiales requeridos', inc.proposalCost || '—');
      block('Riesgo si no se atiende', inc.proposalRisk || '—');
      line('Requiere apoyo de terceros', inc.requiresThirdParty ? 'Sí' : 'No');
      y += 4;
    }

    heading('Análisis y solución');
    block('¿Qué se hizo para resolverlo?', inc.solution || '—');
    block('Causa raíz', inc.rootCause || '—');
    block('Materiales utilizados', inc.materials || '—');
    block('Técnicos que intervinieron', inc.interveners || '—');
    block('Responsable de la solución', inc.responsibleName || (inc.responsible?.fullName || '—'));
    block('Observaciones / recomendaciones', inc.observations || '—');

    if (images.length) {
      doc.addPage();
      doc.fontSize(13).fillColor(NAVY).text('Evidencias fotográficas', 50, 50);
      let iy = 82; const maxW = pageW - 100;
      for (const img of images) {
        if (iy > doc.page.height - 240) { doc.addPage(); iy = 50; }
        try { doc.image(img.buffer, 50, iy, { fit: [maxW, 230], align: 'center' }); iy += 238; }
        catch { doc.fontSize(9).fillColor(RED).text('(imagen no renderizable)', 50, iy); iy += 20; }
        if (img.caption) { doc.fontSize(9).fillColor(GREY).text(img.caption, 50, iy, { width: maxW }); iy = doc.y + 12; }
      }
    }

    doc.fontSize(8).fillColor(GREY).text(
      `Documento generado por SGIT-CCTV el ${new Date().toLocaleString('es-PE')}. Registro documental — Aceros Arequipa.`,
      50, doc.page.height - 38, { width: pageW - 100, align: 'center' },
    );

    doc.end();
    const buffer = await done;
    return { buffer, filename: `informe-${inc.code}.pdf` };
  }
}

/**
 * Enlace a la incidencia. Sale de APP_URL; sin ella el aviso va sin enlace,
 * que es mejor que uno roto a `undefined/incidents`.
 */
function enlaceIncidencia(code: string): string | null {
  const base = (process.env.APP_URL || '').replace(/\/+$/, '');
  return base ? `${base}/incidents?q=${code}` : null;
}
