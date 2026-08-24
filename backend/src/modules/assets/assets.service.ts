import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { revisarImagen } from '../../common/archivos-seguros';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { computeEffectiveStatuses, computeEffectiveStatus } from '../../common/asset-status';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { evaluarFicha, resumenPendiente } from '../../common/asset-completeness';
import { filtroDeUbicaciones } from '../../common/ambito-planta';
import { fichaParaCrear, fichaParaActualizar, sinFichas } from './asset-spec.util';
import { evaluarReincidencia, severidadGlobal } from '../../common/reincidencia';
// PDF y QR: require para no depender de @types en el build.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCode = require('qrcode');

const TYPE_ES: Record<string, string> = { CAMERA: 'Cámara', NVR: 'NVR', SWITCH: 'Switch', WIRELESS: 'Enlace inalámbrico', ROUTER: 'Router', FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', FIBER: 'Fibra', CABINET: 'Gabinete', DECODER: 'Decodificador', PC: 'PC / iVMS-4200', PANTALLA: 'Pantalla de púlpito', OTHER: 'Otro' };
const STATUS_ES: Record<string, string> = { OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento', CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock' };
const PHOTO_ES: Record<string, string> = { APUNTA: 'Imagen en pantalla (púlpito)', REFERENCIA: 'Ubicación de referencia', PLANO: 'Ubicación en plano', GENERAL: 'General' };
import { CreateAssetDto } from './dto/create-asset.dto';
import { SignedCreateAssetDto } from './dto/create-asset-signed.dto';
import { SignedUpdateAssetDto } from './dto/update-asset-signed.dto';
import { UpdateAssetStatusDto } from './dto/update-asset-status.dto';
import { UpdateNetworkDto } from './dto/update-network.dto';
import { QueryAssetDto } from './dto/query-asset.dto';

@Injectable()
export class AssetsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
  ) {}

  /**
   * Señales de reincidencia del activo, para el informe PDF.
   *
   * Se calcula aquí y no se inyecta HistoryService para evitar una dependencia
   * circular: HistoryService ya usa constantes de este módulo.
   */
  private async senalesParaInforme(assetId: string) {
    const [ordenes, tramos] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { assetId },
        orderBy: [{ endedAt: 'desc' }],
        take: 20,
        select: { type: true, status: true, rootCause: true, isRecurrent: true, endedAt: true, executedDate: true },
      }),
      this.prisma.assetCable.findMany({
        where: { status: { not: 'RETIRADO' }, OR: [{ fromAssetId: assetId }, { toAssetId: assetId }] },
        select: { meters: true, metersEstimated: true, shielded: true, route: true },
      }),
    ]);
    return evaluarReincidencia({ ordenes: ordenes as any, tramos: tramos as any });
  }

  /**
   * Alta FIRMADA de activo: re-verifica las credenciales del firmante (argon2) y deja
   * traza de auditoría (CREATE_ASSET) con el firmante. Registrar un activo es crítico
   * porque contiene información sensible (IP, red, accesos).
   */
  async createSigned(dto: SignedCreateAssetDto, ip?: string | null) {
    const signer = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = signer && signer.active
      ? await argon2.verify(signer.passwordHash, dto.password).catch(() => false)
      : false;
    if (!valid) {
      // Registra el intento fallido (no se agregó) y NO cierra sesión (error 400, no 401).
      await this.audit.record({
        userId: signer?.id || null,
        action: 'FIRMA_FALLIDA',
        entity: 'assets',
        ip,
        after: { intento: dto.email, motivo: 'contraseña incorrecta', accion: 'registrar activo' },
      });
      throw new BadRequestException('Firma inválida: contraseña incorrecta');
    }

    const { email, password, ...resto } = dto;
    // La ficha del tipo (cámara, grabador, switch, antena, decodificador,
    // pantalla, PC) se escribe en la MISMA operación que el activo: si fueran
    // dos pasos y el segundo fallara, quedaría un activo sin ficha y nadie
    // sabría que quedó a medias.
    const base = sinFichas(resto);
    const ficha = fichaParaCrear(dto.type, dto);

    const asset = await this.prisma.asset.create({
      data: { ...(base as any), ...ficha },
      include: { camera: true, nvr: true, switchDev: true, wireless: true, location: true, photos: true },
    });

    // Se marca como incompleta si le falta algo clave. No bloquea el alta:
    // el técnico registra en campo con lo mínimo y completa después.
    const completitud = evaluarFicha(asset);
    if (completitud.incompleta) {
      await this.prisma.asset.update({ where: { id: asset.id }, data: { isDraft: true } });
    }

    await this.audit.record({
      userId: signer!.id,
      action: 'CREATE_ASSET',
      entity: 'assets',
      entityId: asset.id,
      ip,
      after: {
        assetCode: asset.assetCode,
        type: asset.type,
        firmadoPor: signer!.email,
        fichaCompleta: `${completitud.porcentaje}%`,
        faltan: completitud.faltanClave.map((f) => f.etiqueta),
      },
    });
    return { ...asset, isDraft: completitud.incompleta, completitud };
  }

  /**
   * Listado PAGINADO de activos.
   *
   * Antes traía la tabla completa sin límite. Con los 400+ activos del mapeo
   * eso significa cargar todo el inventario —con sus relaciones— en cada
   * apertura de pantalla. Ahora se pagina en el servidor, como ya hacían
   * Incidencias y Órdenes.
   *
   * Devuelve { items, total, page, pageSize, pages } para que el frontend
   * pueda dibujar el paginador sin adivinar cuántos hay.
   */
  /**
   * Tren y etapa NO son columnas: se derivan del árbol de ubicaciones. Por eso
   * el filtro se traduce a un conjunto de ubicaciones y se aplica sobre
   * locationId, que sí está indexado. Ver src/common/ambito-planta.ts.
   */
  async findAll(q: QueryAssetDto, sensitive = false) {
    const ambito = await filtroDeUbicaciones(this.prisma, { tren: q.tren, etapa: q.etapa });
    const page = Math.max(1, Number(q.page) || 1);
    // Tope de 200 por página: protege al servidor de una petición como
    // ?pageSize=100000 que traería todo y anularía la paginación.
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 50));

    const where = {
      deletedAt: null,
      /* Bloque 45. Los COMPONENTES (la fuente PoE de una antena, el calefactor
         de una cámara) NO salen en el listado: trescientas fuentes sueltas y
         nadie sabe cuál es de cuál. Viven dentro de la ficha de su equipo
         padre. Si se filtra por tipo (p. ej. PSU) sí se enseñan, porque
         entonces se están buscando a propósito. */
      ...(q.type ? {} : { parteDeId: null }),
      type: q.type,
      status: q.status,
      // Si vienen los dos, manda el más específico: una ubicación concreta
      // elegida a mano gana sobre el ámbito del tren.
      locationId: q.locationId ?? (ambito ?? undefined),
      cabinetId: q.cabinetId,
      ...(q.search
        ? {
            OR: [
              { assetCode: { contains: q.search, mode: 'insensitive' as const } },
              { model: { contains: q.search, mode: 'insensitive' as const } },
              { brand: { contains: q.search, mode: 'insensitive' as const } },
              { serialNumber: { contains: q.search, mode: 'insensitive' as const } },
              { referencePlace: { contains: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    // Cuenta y página en paralelo: una sola ida a la base.
    const [total, rows] = await Promise.all([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where,
        include: sensitive
          ? {
              location: true,
              camera: { select: { ipAddress: true } },
              switchDev: { select: { mgmtIp: true } },
              nvr: { select: { nicPrimary: true } },
              credentials: { take: 1, orderBy: { createdAt: 'desc' } },
            }
          : { location: true },
        orderBy: { assetCode: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const meta = { total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };

    // Estado operativo DERIVADO (F5) y contexto de planta DERIVADO (F8).
    // Ambos por lote y solo sobre la página actual, no sobre todo el inventario.
    //
    // El tren ya NO viene de la columna Asset.train: se deduce subiendo el árbol
    // de ubicaciones. Así desaparece la posibilidad de que un activo cuelgue del
    // Tren 2 y diga TREN_1.
    const [eff, ctx] = await Promise.all([
      computeEffectiveStatuses(this.prisma, rows),
      resolverContextoDePlanta(this.prisma, rows as any),
    ]);

    const enriquecer = (a: any) => ({
      effectiveStatus: eff[a.id] || a.status,
      trenNombre: ctx[a.id]?.trenNombre || null,
      etapaNombre: ctx[a.id]?.etapaNombre || null,
      // true = al activo le falta asignar etapa del proceso. Alimenta el
      // panel de avance del mapeo.
      etapaPendiente: ctx[a.id]?.requiereAsignarEtapa ?? true,
      // Porcentaje de ficha completa. Se calcula sobre lo que trae el listado,
      // así que es orientativo; el detalle exacto está en la ficha del activo.
      fichaPct: evaluarFicha(a).porcentaje,
    });

    if (!sensitive) {
      return {
        ...meta,
        items: rows.map((a: any) => ({ ...a, ...enriquecer(a) })),
      };
    }
    // IP visible para roles con credential.read (Jefe, Supervisor TI, Técnico de Red).
    //
    // SEGURIDAD: la contraseña YA NO se descifra ni viaja en el listado. Antes se
    // enviaban todas las claves de los equipos con solo abrir la pantalla (y también
    // al pintar el dashboard). Ahora se indica si existe credencial y se revela una
    // sola, bajo demanda, por el endpoint /credentials/:id/reveal, que queda auditado.
    return {
      ...meta,
      items: rows.map((a: any) => {
        const { credentials, camera, switchDev, nvr, ...rest } = a;
        const c = credentials?.[0];
        return {
          ...rest,
          ...enriquecer(a),
          ip: a.ipAddress || camera?.ipAddress || switchDev?.mgmtIp || nvr?.nicPrimary || null,
          hasPassword: !!c,
          credentialId: c?.id || null,
        };
      }),
    };
  }

  /**
   * AVANCE DEL MAPEO.
   *
   * PARA QUÉ SIRVE
   * El levantamiento de 400 activos no se hace de una sentada ni por una sola
   * persona. Este resumen convierte el avance en algo medible y repartible:
   * cuántos faltan, cuáles son los más urgentes y qué le falta a cada uno.
   *
   * Sin esto el mapeo es una sensación ("vamos como por la mitad") y nadie
   * puede decir qué zona ya está cubierta.
   */
  /**
   * Ámbito de planta: el avance se puede pedir de un tren o de una etapa
   * concreta. Se filtra por ubicación en la CONSULTA, no después: si se
   * filtrara al final, los porcentajes saldrían sobre el total de la planta
   * y no sobre el del tren, que es justo el número que se quiere.
   */
  async avanceMapeo(q?: { tren?: string; etapa?: string }) {
    const ambito = await filtroDeUbicaciones(this.prisma, { tren: q?.tren, etapa: q?.etapa });
    // El árbol de planta es pequeño; traer los activos con sus fichas permite
    // evaluar la completitud sin una consulta por activo.
    const activos = await this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['BAJA'] },
        ...(ambito ? { locationId: ambito } : {}),
      },
      include: {
        location: { select: { id: true, name: true } },
        camera: true, nvr: true, switchDev: true, wireless: true,
        decoder: true, screen: true, pc: true,
        photos: { select: { id: true, kind: true } },
      },
      orderBy: { assetCode: 'asc' },
    });

    const ctx = await resolverContextoDePlanta(this.prisma, activos as any);

    let completos = 0;
    let sinFoto = 0;
    let sinEtapa = 0;
    const porTipo: Record<string, { total: number; completos: number }> = {};
    const pendientes: any[] = [];

    for (const a of activos as any[]) {
      const c = evaluarFicha(a);
      const t = a.type;
      porTipo[t] = porTipo[t] || { total: 0, completos: 0 };
      porTipo[t].total++;

      if (!c.incompleta) { completos++; porTipo[t].completos++; }
      if (!a.photos?.length) sinFoto++;
      if (ctx[a.id]?.requiereAsignarEtapa) sinEtapa++;

      if (c.incompleta) {
        pendientes.push({
          id: a.id,
          assetCode: a.assetCode,
          type: a.type,
          // Criticidad EFECTIVA: la que impone la etapa del proceso. Es la que
          // debe ordenar el trabajo, no la que alguien marcó a mano.
          criticidad: ctx[a.id]?.criticidad || a.criticality,
          tren: ctx[a.id]?.trenNombre || null,
          etapa: ctx[a.id]?.etapaNombre || null,
          ubicacion: a.location?.name || null,
          porcentaje: c.porcentaje,
          faltan: c.faltanClave.map((f) => f.etiqueta),
        });
      }
    }

    // Lo más crítico primero, y dentro de eso lo menos avanzado: es el orden
    // en que conviene mandar a los técnicos.
    const peso: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
    pendientes.sort((x, y) =>
      (peso[x.criticidad] ?? 9) - (peso[y.criticidad] ?? 9) || x.porcentaje - y.porcentaje);

    const total = activos.length;
    return {
      total,
      completos,
      incompletos: total - completos,
      porcentaje: total ? Math.round((completos / total) * 100) : 0,
      sinFoto,
      sinEtapa,
      porTipo,
      pendientes,
    };
  }

  /**
   * Lista LIGERA para desplegables de selección.
   *
   * Seis pantallas (Incidencias, Órdenes, Preventivo, Inventario, Accesibilidad
   * y la propia de Activos) solo necesitan poder elegir un activo de una lista.
   * Antes llamaban a findAll y recibían el inventario completo con ubicaciones,
   * credenciales y estado derivado —cientos de kilobytes para pintar un <select>.
   *
   * Aquí van solo los campos necesarios para identificarlo. Sin paginar:
   * un desplegable necesita la lista entera, pero pesa una fracción.
   */
  async options() {
    const rows = await this.prisma.asset.findMany({
      where: { deletedAt: null, status: { notIn: ['BAJA'] } },
      select: {
        id: true,
        assetCode: true,
        type: true,
        status: true,
        location: { select: { name: true } },
      },
      orderBy: { assetCode: 'asc' },
    });
    return rows.map((a) => ({
      id: a.id,
      assetCode: a.assetCode,
      type: a.type,
      status: a.status,
      locationName: a.location?.name || null,
    }));
  }

  /**
   * Detalle de activo. Los datos de RED sensibles (IP, MAC, IP de gestión, NICs del NVR)
   * solo se devuelven si `sensitive` es true (usuario con permiso credential.read:
   * Jefe de Mantenimiento, Supervisor TI, Técnico de Red). Al resto se le ocultan.
   */
  async findOne(id: string, sensitive = false) {
    const asset: any = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        location: true, cabinet: true, camera: true, nvr: true, switchDev: true, wireless: true,
        decoder: { include: { outputs: true } },
        screen: { include: { cells: true, fedByOutputs: true } },
        pc: true,
        cablesTo: true,
        cablesFrom: true,
        photos: { orderBy: { createdAt: 'asc' } },
        /* Bloque 45. La fuente PoE, el calefactor, el conversor: viven DENTRO
           de la ficha de su equipo, nunca sueltos en el listado. */
        componentes: {
          where: { deletedAt: null },
          select: { id: true, assetCode: true, type: true, status: true, brand: true, model: true },
        },
        parteDe: { select: { id: true, assetCode: true, type: true } },
        preventivePlan: true,
        // Accesibilidad: si el activo es inaccesible (altura/manlift), se ve en su ficha.
        accessRequests: {
          orderBy: { createdAt: 'desc' }, take: 5,
          select: { id: true, code: true, status: true, means: true, heightMeters: true, createdAt: true },
        },
        workOrders: {
          orderBy: { createdAt: 'desc' }, take: 8,
          // `activity` hace falta para la ficha del QR: "OM-14 en proceso" no
          // dice nada; "OM-14 en proceso — cambio de fuente PoE" sí, y evita
          // que alguien abra una orden repetida por lo mismo.
          select: {
            /* `id` hace falta desde el bloque 62-A: el QR ya no sólo enseña
               la orden, deja ANOTAR EL AVANCE sobre ella
               (`POST /work-orders/:id/progress`). Sin el identificador la
               ficha listaba órdenes sobre las que no se podía actuar. */
            id: true,
            code: true, type: true, status: true, activity: true,
            scheduledDate: true, executedDate: true,
            technician: { select: { fullName: true } },
          },
        },
      },
    });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');

    if (!sensitive) {
      if (asset.camera) { asset.camera.ipAddress = null; asset.camera.macAddress = null; }
      if (asset.switchDev) { asset.switchDev.mgmtIp = null; }
      if (asset.nvr) { asset.nvr.nicPrimary = null; asset.nvr.nicSecondary = null; }
    }
    // Estado operativo derivado (F5) y contexto de planta derivado (F8),
    // para que la ficha sea coherente con las OM/incidencias y con el árbol.
    const [effStatus, ctx] = await Promise.all([
      computeEffectiveStatus(this.prisma, asset),
      resolverContextoDePlanta(this.prisma, [asset]),
    ]);
    asset.effectiveStatus = effStatus;

    const c = ctx[asset.id];
    asset.planta = {
      tren: c?.trenNombre || null,
      etapa: c?.etapaNombre || null,
      ambiente: c?.ambiente || null,
      // Criticidad efectiva: la mayor entre la del activo y la mínima que
      // impone su etapa del proceso.
      criticidadEfectiva: c?.criticidad || asset.criticality,
      intervaloPreventivoDias: c?.intervaloDias ?? null,
      etapaPendiente: c?.requiereAsignarEtapa ?? true,
      /* LO QUE DIJO PRODUCCIÓN (bloque 26).
         Va aquí y no en un endpoint aparte porque el técnico que abre la
         ficha para arreglar la cámara es exactamente quien tiene que leer
         «si esto se cae, se para la línea». Un dato así en otra pantalla es
         un dato que nadie ve. */
      zonaVital: c?.zonaVital ?? false,
      criticidadProduccion: c?.criticidadProduccion ?? null,
      zonaCriticaNombre: c?.zonaCriticaNombre ?? null,
      porQueEsVital: c?.porQueEsVital ?? null,
      impactoSiSeCae: c?.impactoSiSeCae ?? null,
      queSeVigila: c?.queSeVigila ?? null,
      declaracionVencida: c?.declaracionVencida ?? false,
      /* CÓMO SE INTERVIENE ESTA ZONA (bloque 62-B).
         -------------------------------------------------------------------
         Esto YA se calculaba —`resolverContextoDePlanta` lo resuelve para
         todos los activos— y se quedaba dentro del backend. La consecuencia
         real: el técnico escanea el QR de pie delante de la cámara y la
         pantalla le cuenta la marca, el modelo y la IP, pero NO le dice que
         esa zona exige que el tren esté parado.

         El dato más caro de todos los que hay en esta ficha estaba calculado
         y sin enseñar. Es exactamente el mismo error que el mapa de red y el
         módulo de documentos: modelo + cálculo ≠ función. Sin pantalla, no
         existe.

         `aplica` es lo que MANDA, no la propuesta. La propuesta no autoriza
         a nadie (ver `common/intervenibilidad.ts`): sin firma se aplica
         EXIGE_PARADA, y eso es lo que tiene que leer el que está en campo. */
      intervencionAplica: c?.intervencionAplica ?? 'EXIGE_PARADA',
      intervencionPropuesta: c?.intervencionPropuesta ?? 'SIN_CLASIFICAR',
      intervencionFirmada: c?.intervencionFirmada ?? false,
      intervencionDesactualizada: c?.intervencionDesactualizada ?? false,
      intervencionMotivo: c?.intervencionMotivo ?? '',
      esperaVentanaDeParada: c?.esperaVentanaDeParada ?? true,
    };
    // Qué le falta a la ficha. Alimenta el QR ("faltan canal y foto") y el
    // panel de avance del mapeo.
    asset.completitud = evaluarFicha(asset);
    asset.pendiente = resumenPendiente(asset);
    return asset;
  }

  /**
   * Cambio de ESTADO del activo — única edición sin firma.
   *
   * ANTES: este método aceptaba el activo COMPLETO (UpdateAssetDto) con solo
   * el permiso asset.update. Es decir, un Técnico podía cambiar la IP, el
   * código o la ubicación sin dejar firma, rodeando por completo la protección
   * de PATCH /assets/:id/edit, que sí la exige. Dos caminos para lo mismo con
   * niveles de control distintos: el débil anulaba al fuerte.
   *
   * AHORA solo acepta el estado. Es lo que el técnico legítimamente cambia en
   * campo ("lo dejé en mantenimiento"), es reversible, y queda auditado.
   * Cualquier otro campo exige el camino firmado.
   */
  async updateStatus(
    id: string,
    dto: UpdateAssetStatusDto,
    userId?: string | null,
    ip?: string | null,
  ) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');

    const updated = await this.prisma.asset.update({
      where: { id },
      data: { status: dto.status },
    });

    await this.audit.record({
      userId: userId || null,
      action: 'UPDATE_ASSET_STATUS',
      entity: 'assets',
      entityId: id,
      ip,
      before: { status: asset.status },
      after: { assetCode: asset.assetCode, status: updated.status },
    });

    return { id: updated.id, status: updated.status };
  }

  /**
   * Edición FIRMADA de activo: re-verifica credenciales del firmante y audita UPDATE_ASSET.
   * Un fallo de firma se audita (FIRMA_FALLIDA) y devuelve 400 (no cierra sesión).
   */
  async updateSigned(id: string, dto: SignedUpdateAssetDto, ip?: string | null) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');
    const signer = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = signer && signer.active
      ? await argon2.verify(signer.passwordHash, dto.password).catch(() => false)
      : false;
    if (!valid) {
      await this.audit.record({
        userId: signer?.id || null, action: 'FIRMA_FALLIDA', entity: 'assets', entityId: id, ip,
        after: { intento: dto.email, motivo: 'contraseña incorrecta', accion: 'editar activo' },
      });
      throw new BadRequestException('Firma inválida: contraseña incorrecta');
    }
    const { email, password, ...resto } = dto;
    // El tipo NO se toma del cuerpo sino del activo guardado: si se aceptara
    // del formulario, se podría cambiar el tipo y adjuntar una ficha que no
    // corresponde, dejando filas en la tabla equivocada.
    const base = sinFichas(resto);
    const ficha = fichaParaActualizar(asset.type, dto);

    const updated = await this.prisma.asset.update({
      where: { id },
      data: { ...(base as any), ...ficha },
      include: { camera: true, nvr: true, switchDev: true, wireless: true, location: true, photos: true },
    });

    // Se recalcula: al completar la ficha el activo puede dejar de estar incompleto.
    const completitud = evaluarFicha(updated);
    if (updated.isDraft !== completitud.incompleta) {
      await this.prisma.asset.update({ where: { id }, data: { isDraft: completitud.incompleta } });
    }

    await this.audit.record({
      userId: signer!.id, action: 'UPDATE_ASSET', entity: 'assets', entityId: id, ip,
      after: {
        assetCode: updated.assetCode,
        firmadoPor: signer!.email,
        fichaCompleta: `${completitud.porcentaje}%`,
      },
    });
    return { ...updated, isDraft: completitud.incompleta, completitud };
  }

  /**
   * Actualiza datos de RED sensibles (IP). Solo credential.manage (Jefe y Técnico de Red).
   * Queda auditado — pensado para proyectos de estandarización de red.
   */
  async updateNetwork(id: string, dto: UpdateNetworkDto, ip?: string | null, userId?: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');
    const updated = await this.prisma.asset.update({ where: { id }, data: { ipAddress: dto.ipAddress } });
    await this.audit.record({
      userId: userId || null,
      action: 'UPDATE_NETWORK',
      entity: 'assets',
      entityId: id,
      ip,
      after: { assetCode: asset.assetCode, ipAddress: dto.ipAddress },
    });
    return { id: updated.id, ipAddress: updated.ipAddress };
  }

  /**
   * Baja de activo (borrado lógico). No se elimina físicamente: se conserva el
   * historial de OM, incidencias y auditoría asociado, que es evidencia documental.
   * El activo deja de aparecer en listados, planes y tableros.
   */
  async remove(id: string, userId?: string | null, ip?: string | null) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');

    const [wos, incs] = await Promise.all([
      this.prisma.workOrder.count({ where: { assetId: id, status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] as any } } }),
      this.prisma.incident.count({ where: { assetId: id, status: { in: ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'] as any } } }),
    ]);
    if (wos > 0 || incs > 0) {
      throw new BadRequestException(
        `No se puede dar de baja: el activo tiene ${wos} OM y ${incs} incidencia(s) abiertas. ` +
        'Ciérralas o cancélalas primero.',
      );
    }

    const updated = await this.prisma.asset.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'BAJA' },
    });
    // Se desactiva su plan preventivo para que no siga generando OM.
    await this.prisma.preventivePlan.updateMany({ where: { assetId: id }, data: { active: false } });

    await this.audit.record({
      userId: userId || null, action: 'DELETE_ASSET', entity: 'assets', entityId: id, ip,
      after: { assetCode: asset.assetCode, tipo: asset.type },
    });
    return { ok: true, assetCode: updated.assetCode };
  }

  // ---------- Fotografías del activo (a qué apunta, referencia, plano) ----------
  async addPhoto(id: string, file: any, kind?: string, caption?: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');
    if (!file || !file.buffer) throw new BadRequestException('Imagen requerida');
    // No se cree lo que el archivo DICE ser: se miran sus primeros bytes.
    // `file.mimetype` lo manda el navegador; un .html declarado como
    // imagen quedaba guardado y se ejecutaba al abrir la evidencia.
    const revision = revisarImagen(file as any);
    if (!revision.ok) throw new BadRequestException(revision.motivo);
    // La extensión sale del tipo REAL del archivo, nunca del nombre que
    // mandó el navegador: 'foto.jpg.html' o un nombre con ../ dentro no
    // puede acabar decidiendo cómo ni dónde se guarda.
    const ext = revision.tipo.extension;
    const objectName = `asset/${id}/${Date.now()}-${randomUUID()}.${ext}`;
    await this.storage.put(objectName, file.buffer, revision.tipo.mime);
    return this.prisma.assetPhoto.create({
      data: { assetId: id, kind: (kind as any) || 'GENERAL', fileId: objectName, caption: caption || null },
    });
  }

  listPhotos(id: string) {
    return this.prisma.assetPhoto.findMany({ where: { assetId: id }, orderBy: { createdAt: 'asc' } });
  }

  async getPhotoFile(photoId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const ph = await this.prisma.assetPhoto.findUnique({ where: { id: photoId } });
    if (!ph) throw new NotFoundException('Foto no encontrada');
    const buffer = await this.storage.getBuffer(ph.fileId);
    const ext = ph.fileId.split('.').pop()?.toLowerCase();
    return { buffer, contentType: ext === 'png' ? 'image/png' : 'image/jpeg' };
  }

  async removePhoto(photoId: string) {
    const ph = await this.prisma.assetPhoto.findUnique({ where: { id: photoId } });
    if (!ph) throw new NotFoundException('Foto no encontrada');
    await this.prisma.assetPhoto.delete({ where: { id: photoId } });
    await this.storage.remove(ph.fileId).catch(() => null);
    return { ok: true };
  }

  // ---------- Identificación por QR ----------
  /**
   * URL pública a la que apunta la etiqueta QR del activo.
   * El técnico escanea con el celular y entra directo a la ficha, sin buscar
   * el equipo entre cientos de registros.
   */
  private assetUrl(id: string): string {
    const base = (process.env.APP_PUBLIC_URL || process.env.CORS_ORIGIN || '')
      .split(',')[0]
      .trim()
      .replace(/\/$/, '');
    return `${base}/a/${id}`;
  }

  /** QR del activo en PNG (para pantalla o etiqueta individual). */
  async qrPng(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const asset = await this.prisma.asset.findUnique({
      where: { id }, select: { assetCode: true, deletedAt: true },
    });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');
    const buffer: Buffer = await QRCode.toBuffer(this.assetUrl(id), {
      type: 'png', width: 512, margin: 1,
      color: { dark: '#16233bff', light: '#ffffffff' },
      errorCorrectionLevel: 'M', // tolera desgaste/suciedad de planta
    });
    return { buffer, filename: `qr-${asset.assetCode}.png` };
  }

  /**
   * Hoja de etiquetas en PDF lista para imprimir y pegar en los equipos.
   * Cada etiqueta lleva el QR, el código del activo y su ubicación.
   */
  async qrSheet(ids?: string[]): Promise<{ buffer: Buffer; filename: string }> {
    const assets = await this.prisma.asset.findMany({
      where: { deletedAt: null, ...(ids && ids.length ? { id: { in: ids } } : {}) },
      select: {
        id: true, assetCode: true, type: true,
        location: { select: { name: true } },
        cabinet: { select: { code: true } },
      },
      orderBy: { assetCode: 'asc' },
      take: 200,
    });
    if (!assets.length) throw new NotFoundException('No hay activos para generar etiquetas');

    const doc = new PDFDocument({ size: 'A4', margin: 28 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const NAVY = '#16233b', GREY = '#555555';
    const cols = 3, rows = 4;                 // 12 etiquetas por hoja
    const cellW = (doc.page.width - 56) / cols;
    const cellH = (doc.page.height - 56) / rows;

    let i = 0;
    for (const a of assets) {
      const pos = i % (cols * rows);
      if (i > 0 && pos === 0) doc.addPage();
      const cx = 28 + (pos % cols) * cellW;
      const cy = 28 + Math.floor(pos / cols) * cellH;

      // Marco de corte
      doc.rect(cx + 4, cy + 4, cellW - 8, cellH - 8).lineWidth(0.5).strokeColor('#cccccc').stroke();

      const png: Buffer = await QRCode.toBuffer(this.assetUrl(a.id), {
        type: 'png', width: 300, margin: 0,
        color: { dark: '#000000ff', light: '#ffffffff' }, errorCorrectionLevel: 'M',
      });
      const qrSize = Math.min(cellW - 60, cellH - 78);
      doc.image(png, cx + (cellW - qrSize) / 2, cy + 16, { width: qrSize, height: qrSize });

      let ty = cy + 16 + qrSize + 8;
      doc.fontSize(10).fillColor(NAVY).text(a.assetCode, cx + 8, ty, { width: cellW - 16, align: 'center' });
      ty = doc.y + 1;
      const sub = [a.location?.name, a.cabinet?.code].filter(Boolean).join(' · ') || TYPE_ES[a.type] || a.type;
      doc.fontSize(7).fillColor(GREY).text(sub, cx + 8, ty, { width: cellW - 16, align: 'center' });
      i++;
    }

    doc.end();
    const buffer = await done;
    return { buffer, filename: `etiquetas-qr-${new Date().toISOString().slice(0, 10)}.pdf` };
  }

  // ---------- Informe del equipo (PDF): ficha técnica + fotos + historial ----------
  async buildReport(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const asset: any = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        location: true, cabinet: true,
        photos: { orderBy: { createdAt: 'asc' } },
        /* Bloque 45. La fuente PoE, el calefactor, el conversor: viven DENTRO
           de la ficha de su equipo, nunca sueltos en el listado. */
        componentes: {
          where: { deletedAt: null },
          select: { id: true, assetCode: true, type: true, status: true, brand: true, model: true },
        },
        parteDe: { select: { id: true, assetCode: true, type: true } },
        preventivePlan: true,
        workOrders: {
          orderBy: { createdAt: 'desc' }, take: 10,
          select: { code: true, type: true, status: true, scheduledDate: true, executedDate: true, activity: true, rootCause: true, isRecurrent: true },
        },
      },
    });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');
    const eff = await computeEffectiveStatus(this.prisma, asset);

    const images: { buffer: Buffer; kind: string; caption?: string | null }[] = [];
    for (const ph of asset.photos) {
      try { images.push({ buffer: await this.storage.getBuffer(ph.fileId), kind: ph.kind, caption: ph.caption }); } catch { /* omitir */ }
    }

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const NAVY = '#1b2a4a', RED = '#c0392b', GREY = '#555555';
    const pageW = doc.page.width;
    const fmt = (d?: Date | null) => (d ? new Date(d).toLocaleDateString('es-PE') : '—');

    doc.rect(0, 0, pageW, 92).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(17).text('ACEROS AREQUIPA — Planta Pisco', 50, 26);
    doc.fillColor('#cfd8e3').fontSize(10).text('SGIT-CCTV · Informe del equipo (ficha técnica)', 50, 50);
    doc.fillColor('#ffffff').fontSize(20).text(asset.assetCode, 0, 34, { align: 'right', width: pageW - 50 });
    doc.fillColor('#000000');

    let y = 116;
    const heading = (t: string) => {
      doc.fontSize(13).fillColor(NAVY).text(t, 50, y); y = doc.y + 6;
      doc.moveTo(50, y).lineTo(pageW - 50, y).strokeColor('#dddddd').stroke(); y += 8;
    };
    const line = (label: string, value: string) => {
      doc.fontSize(10).fillColor(GREY).text(label, 50, y);
      doc.fontSize(11).fillColor('#000000').text(value || '—', 210, y, { width: pageW - 260 });
      y = doc.y + 6;
    };

    heading('Ficha del activo');
    line('Tipo', TYPE_ES[asset.type] || asset.type);
    line('Marca / Modelo', [asset.brand, asset.model].filter(Boolean).join(' ') || '—');
    line('N° de serie', asset.serialNumber || '—');
    line('Estado operativo', STATUS_ES[eff] || eff);
    line('Criticidad', asset.criticality);
    line('IP', asset.ipAddress || '—');
    line('Ubicación', asset.location ? asset.location.name : '—');
    line('Gabinete', asset.cabinet ? `${asset.cabinet.code} — ${asset.cabinet.name}` : '—');
    line('Lugar de referencia', asset.referencePlace || '—');
    line('Código SAP', asset.sapId || '—');

    y += 6;
    heading('Plan de mantenimiento preventivo');
    if (asset.preventivePlan) {
      line('Intervalo', `${asset.preventivePlan.intervalDays} días${asset.preventivePlan.zoneCritical ? ' (zona crítica)' : ''}`);
      line('Último preventivo', fmt(asset.preventivePlan.lastServiceAt));
      line('Próximo preventivo', fmt(asset.preventivePlan.nextDueAt));
    } else {
      doc.fontSize(11).fillColor(GREY).text('Sin plan preventivo asignado.', 50, y); y = doc.y + 6;
    }

    y += 6;
    // ANÁLISIS DE REINCIDENCIA.
    // Va antes del historial a propósito: el informe deja de ser una lista de
    // lo que se hizo y pasa a decir QUÉ ESTÁ PASANDO con el equipo. Es lo que
    // convierte el documento en algo útil para decidir un reemplazo.
    const senales = await this.senalesParaInforme(id).catch(() => []);
    if (senales.length) {
      const grave = severidadGlobal(senales) === 'CONFIRMADA';
      heading(grave ? 'Reincidencia CONFIRMADA' : 'Posible reincidencia');
      for (const sn of senales) {
        doc.fontSize(10).fillColor(grave ? RED : '#92400e')
          .text(`• ${sn.mensaje}`, 55, y, { width: pageW - 110 });
        y = doc.y + 2;
        if (sn.sugerencia) {
          doc.fontSize(9).fillColor(GREY).text(`   → ${sn.sugerencia}`, 60, y, { width: pageW - 120 });
          y = doc.y + 4;
        }
        if (y > doc.page.height - 140) { doc.addPage(); y = 50; }
      }
      y += 6;
    }

    heading('Historial de mantenimiento (últimas 10)');
    if (asset.workOrders.length) {
      for (const w of asset.workOrders) {
        doc.fontSize(10).fillColor('#000000').text(
          `• ${w.code} · ${w.type} · ${w.status} · ${fmt(w.executedDate || w.scheduledDate)}`
          + (w.rootCause ? ` · causa: ${w.rootCause}` : '')
          + (w.isRecurrent ? ' · REINCIDENTE' : ''),
          55, y, { width: pageW - 110 });
        y = doc.y + 2;
        if (w.activity) { doc.fontSize(9).fillColor(GREY).text(`   ${w.activity}`, 60, y, { width: pageW - 120 }); y = doc.y + 3; }
        if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
      }
    } else {
      doc.fontSize(11).fillColor(GREY).text('Sin órdenes de mantenimiento registradas.', 50, y); y = doc.y + 6;
    }

    if (images.length) {
      doc.addPage();
      doc.fontSize(13).fillColor(NAVY).text('Fotografías del equipo', 50, 50);
      let iy = 82; const maxW = pageW - 100;
      for (const img of images) {
        if (iy > doc.page.height - 250) { doc.addPage(); iy = 50; }
        doc.fontSize(10).fillColor(NAVY).text(PHOTO_ES[img.kind] || img.kind, 50, iy); iy = doc.y + 4;
        try { doc.image(img.buffer, 50, iy, { fit: [maxW, 220], align: 'center' }); iy += 228; }
        catch { doc.fontSize(9).fillColor(RED).text('(imagen no renderizable)', 50, iy); iy += 20; }
        if (img.caption) { doc.fontSize(9).fillColor(GREY).text(img.caption, 50, iy, { width: maxW }); iy = doc.y + 12; }
      }
    }

    doc.fontSize(8).fillColor(GREY).text(
      `Documento generado por SGIT-CCTV el ${new Date().toLocaleString('es-PE')}. Ficha técnica — Aceros Arequipa, Planta Pisco.`,
      50, doc.page.height - 38, { width: pageW - 100, align: 'center' },
    );

    doc.end();
    const buffer = await done;
    return { buffer, filename: `informe-${asset.assetCode}.pdf` };
  }
}
