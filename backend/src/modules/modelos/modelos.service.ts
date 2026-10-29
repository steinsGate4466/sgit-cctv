import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { nombreEnAlmacen, revisarDocumento } from '../documents/archivos-documento';
import { CrearModeloDto, DatosFichaDto, EditarModeloDto } from './dto/modelos.dto';
import { AssetType } from '../../generated/prisma/client';
import { leerFicha } from './leer-ficha';
import { Optica, problemasDeOptica, vision } from './vision';
import { diaDePlanta } from '../../common/dia-de-planta';

/** Lo que se guarda de una ficha óptica (sin el modelo ni el PDF). */
interface DatosOptica extends Optica {
  lente: string;
  resolucionAlto: number;
  sensor: string | null;
  anguloV: number | null;
  anguloHTele: number | null;
  zoomOptico: number | null;
  irM: number | null;
}

/* =============================================================================
   CATÁLOGO DE MODELOS Y FICHAS TÉCNICAS — bloque 184
   -----------------------------------------------------------------------------
   Pedido de Cristhian: el cono del mapa tiene que reflejar lo que ve la cámara
   de verdad, con datos que llena el técnico «pero fehacientes».

   DOS COSAS QUE ESTO CIERRA
   1. El catálogo `modelos_equipo` existía desde el bloque 32 y NO había forma de
      llenarlo: ni pantalla ni endpoint. Riesgo decía «6 modelos sin ficha de
      obsolescencia» y nadie podía hacer nada. Modelo + cálculo ≠ función.
   2. Las fichas ópticas: lo que ve cada modelo con cada lente.

   LO QUE LO HACE FEHACIENTE
   · El PDF del fabricante es OBLIGATORIO y se comprueba por sus bytes.
   · Los números se validan: lo imposible y el error de dedo se rechazan.
   · Lo declara una persona y lo VERIFICA OTRA con permiso de cierre. Cambiar
     un número quita la verificación: hay que volver a mirarlo.
============================================================================= */

/** Mismo valor guardado: fechas por su instante, el resto tal cual (null = null). */
function igual(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  return (a ?? null) === (b ?? null);
}

const clave = (tipo: string, marca?: string | null, modelo?: string | null) =>
  `${tipo}|${(marca ?? '').trim().toLowerCase()}|${(modelo ?? '').trim().toLowerCase()}`;

const SELECT_FICHA = {
  id: true, lente: true, resolucionAncho: true, resolucionAlto: true, sensor: true,
  anguloH: true, anguloV: true, anguloHTele: true, zoomOptico: true, doriAnguloRef: true,
  identificarM: true, reconocerM: true, observarM: true, detectarM: true, irM: true,
  documentoId: true, declaradaEn: true, verificadaEn: true, actualizadaEn: true,
  declaradaPor: { select: { id: true, fullName: true } },
  verificadaPor: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class ModelosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /** El catálogo, con cuántos equipos usan cada modelo y sus fichas ópticas. */
  async lista(tipo?: string, q?: string) {
    const tipoValido = tipo && /^[A-Z_]{2,30}$/.test(tipo) ? tipo : undefined;
    const texto = q?.trim().slice(0, 80);
    const [modelos, usos] = await Promise.all([
      this.prisma.modeloEquipo.findMany({
        where: {
          ...(tipoValido ? { tipoActivo: tipoValido as AssetType } : {}),
          ...(texto ? {
            OR: [
              { marca: { contains: texto, mode: 'insensitive' as const } },
              { modelo: { contains: texto, mode: 'insensitive' as const } },
            ],
          } : {}),
        },
        orderBy: [{ tipoActivo: 'asc' }, { marca: 'asc' }, { modelo: 'asc' }],
        take: 500,
        select: {
          id: true, tipoActivo: true, marca: true, modelo: true,
          finDeSoporte: true, sinRecambio: true, reemplazadoPor: true, notas: true,
          verificadoEn: true, createdAt: true,
          verificadoPor: { select: { id: true, fullName: true } },
          declaradoPor: { select: { id: true, fullName: true } },
          fichasOpticas: {
            select: { ...SELECT_FICHA, _count: { select: { camaras: true } } },
            orderBy: { lente: 'asc' },
          },
        },
      }),
      this.usosPorModelo(),
    ]);
    return modelos.map((m) => ({ ...m, equipos: usos.get(clave(m.tipoActivo, m.marca, m.modelo)) ?? 0 }));
  }

  /** Cuántos equipos (no dados de baja) hay de cada tipo + marca + modelo. */
  private async usosPorModelo() {
    const filas = await this.prisma.asset.groupBy({
      by: ['type', 'brand', 'model'],
      where: { deletedAt: null, status: { not: 'BAJA' }, brand: { not: null } },
      _count: { _all: true },
    });
    const mapa = new Map<string, number>();
    for (const f of filas) {
      const k = clave(f.type, f.brand, f.model);
      mapa.set(k, (mapa.get(k) ?? 0) + f._count._all);
    }
    return mapa;
  }

  /**
   * LA TAREA, NO EL CONSEJO: qué modelos en uso faltan en el catálogo y qué
   * cámaras no tienen ficha óptica. Es lo que el técnico tiene que averiguar.
   */
  async pendientes() {
    const [filas, catalogo, sinFicha] = await Promise.all([
      this.prisma.asset.groupBy({
        by: ['type', 'brand', 'model'],
        where: { deletedAt: null, status: { not: 'BAJA' }, brand: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.modeloEquipo.findMany({ select: { tipoActivo: true, marca: true, modelo: true } }),
      this.prisma.asset.groupBy({
        by: ['brand', 'model'],
        where: {
          deletedAt: null, type: 'CAMERA', status: { not: 'BAJA' },
          OR: [{ camera: { is: null } }, { camera: { is: { fichaOpticaId: null } } }],
        },
        _count: { _all: true },
      }),
    ]);
    const enCatalogo = new Set(catalogo.map((c) => clave(c.tipoActivo, c.marca, c.modelo)));
    const vistos = new Map<string, { tipo: string; marca: string; modelo: string; equipos: number }>();
    for (const f of filas) {
      if (!f.brand?.trim()) continue;
      const k = clave(f.type, f.brand, f.model);
      if (enCatalogo.has(k)) continue;
      const previo = vistos.get(k);
      if (previo) previo.equipos += f._count._all;
      else vistos.set(k, { tipo: f.type, marca: f.brand.trim(), modelo: (f.model ?? '').trim(), equipos: f._count._all });
    }
    const modelosSinCatalogo = [...vistos.values()].sort((a, b) => b.equipos - a.equipos).slice(0, 100);
    const camarasSinFicha = sinFicha
      .map((f) => ({ marca: f.brand?.trim() || null, modelo: f.model?.trim() || null, camaras: f._count._all }))
      .sort((a, b) => b.camaras - a.camaras);
    return {
      modelosSinCatalogo,
      camarasSinFicha,
      totalCamarasSinFicha: camarasSinFicha.reduce((s, x) => s + x.camaras, 0),
    };
  }

  /** Fichas para el formulario de la cámara: lo que puede elegir el técnico. */
  async fichasParaElegir() {
    const fichas = await this.prisma.fichaOptica.findMany({
      orderBy: [{ modelo: { marca: 'asc' } }, { modelo: { modelo: 'asc' } }, { lente: 'asc' }],
      take: 1000,
      select: {
        id: true, lente: true, verificadaEn: true,
        modelo: { select: { marca: true, modelo: true } },
      },
    });
    return fichas.map((f) => ({
      id: f.id, lente: f.lente, marca: f.modelo.marca, modelo: f.modelo.modelo,
      verificada: !!f.verificadaEn,
    }));
  }

  async crearModelo(dto: CrearModeloDto, userId: string | null, ip?: string) {
    const marca = dto.marca.trim(), modelo = dto.modelo.trim();
    const existe = await this.prisma.modeloEquipo.findFirst({
      where: {
        tipoActivo: dto.tipoActivo,
        marca: { equals: marca, mode: 'insensitive' },
        modelo: { equals: modelo, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existe) throw new ConflictException(`${marca} ${modelo} ya está en el catálogo.`);
    const creado = await this.prisma.modeloEquipo.create({
      data: { tipoActivo: dto.tipoActivo, marca, modelo, declaradoPorId: userId },
      select: { id: true, tipoActivo: true, marca: true, modelo: true },
    });
    await this.audit.record({
      userId, ip, action: 'MODELO_ALTA', entity: 'modelos_equipo', entityId: creado.id,
      after: { tipo: creado.tipoActivo, marca, modelo },
    });
    return creado;
  }

  /** Ciclo de vida del modelo. Cambiarlo quita la verificación: hay que volver a mirarlo. */
  async editarModelo(id: string, dto: EditarModeloDto, userId: string | null, ip?: string) {
    const antes = await this.prisma.modeloEquipo.findUnique({ where: { id } });
    if (!antes) throw new NotFoundException('Ese modelo no existe.');
    const datos: Record<string, any> = {};
    if (dto.finDeSoporte !== undefined) datos.finDeSoporte = dto.finDeSoporte ? diaDePlanta(dto.finDeSoporte) : null;
    if (dto.sinRecambio !== undefined) datos.sinRecambio = dto.sinRecambio;
    if (dto.reemplazadoPor !== undefined) datos.reemplazadoPor = dto.reemplazadoPor?.trim() || null;
    if (dto.notas !== undefined) datos.notas = dto.notas?.trim() || null;
    /* Sólo cuenta lo que CAMBIA. Guardar la misma ficha sin tocarla no puede
       quitarle la verificación a otra persona: eso enseñaría a no abrirla. */
    for (const k of Object.keys(datos)) if (igual(datos[k], (antes as any)[k])) delete datos[k];
    if (!Object.keys(datos).length) return { ok: true, sinCambios: true };
    const r = await this.prisma.modeloEquipo.update({
      where: { id },
      data: { ...datos, declaradoPorId: userId, verificadoPorId: null, verificadoEn: null },
      select: { id: true },
    });
    await this.audit.record({
      userId, ip, action: 'MODELO_EDITAR', entity: 'modelos_equipo', entityId: id,
      before: {
        finDeSoporte: antes.finDeSoporte, sinRecambio: antes.sinRecambio,
        reemplazadoPor: antes.reemplazadoPor, verificado: !!antes.verificadoEn,
      },
      after: datos,
    });
    return r;
  }

  async verificarModelo(id: string, userId: string | null, ip?: string) {
    const m = await this.prisma.modeloEquipo.findUnique({ where: { id }, select: { id: true, declaradoPorId: true, marca: true, modelo: true } });
    if (!m) throw new NotFoundException('Ese modelo no existe.');
    if (m.declaradoPorId && m.declaradoPorId === userId) {
      throw new ForbiddenException('Lo declaraste tú: lo tiene que verificar otra persona. Dos ojos ven más que uno.');
    }
    await this.prisma.modeloEquipo.update({ where: { id }, data: { verificadoPorId: userId, verificadoEn: new Date() } });
    await this.audit.record({
      userId, ip, action: 'MODELO_VERIFICAR', entity: 'modelos_equipo', entityId: id,
      after: { marca: m.marca, modelo: m.modelo },
    });
    return { ok: true };
  }

  /** Los números de una ficha, como los guarda la base, y lo que no puede ser. */
  private optica(dto: DatosFichaDto): { datos: DatosOptica; problemas: string[] } {
    const doriAnguloRef = dto.doriEn === 'TELE' ? (dto.anguloHTele ?? NaN) : dto.anguloH;
    const datos: DatosOptica = {
      lente: dto.lente.trim().replace(/\s+/g, ' '),
      resolucionAncho: dto.resolucionAncho,
      resolucionAlto: dto.resolucionAlto,
      sensor: dto.sensor?.trim() || null,
      anguloH: dto.anguloH,
      anguloV: dto.anguloV ?? null,
      anguloHTele: dto.anguloHTele ?? null,
      zoomOptico: dto.zoomOptico ?? null,
      doriAnguloRef,
      identificarM: dto.identificarM,
      reconocerM: dto.reconocerM,
      observarM: dto.observarM,
      detectarM: dto.detectarM,
      irM: dto.irM ?? null,
    };
    const problemas = dto.doriEn === 'TELE' && !dto.anguloHTele
      ? ['Si la ficha da las distancias en tele, escribe el ángulo en tele.']
      : problemasDeOptica(datos);
    return { datos, problemas };
  }

  async crearFicha(modeloId: string, archivo: any, dto: DatosFichaDto, userId: string | null, ip?: string) {
    const modelo = await this.prisma.modeloEquipo.findUnique({
      where: { id: modeloId }, select: { id: true, tipoActivo: true, marca: true, modelo: true },
    });
    if (!modelo) throw new NotFoundException('Ese modelo no existe.');
    if (modelo.tipoActivo !== 'CAMERA') throw new BadRequestException('La ficha óptica es sólo para cámaras.');

    const { datos, problemas } = this.optica(dto);
    if (problemas.length) throw new BadRequestException(problemas.join(' '));

    /* LA PRUEBA ES OBLIGATORIA, y es un PDF de verdad (por sus bytes, no por
       el nombre). Sin ficha del fabricante no hay dato fehaciente. */
    if (!archivo?.buffer?.length) {
      throw new BadRequestException('Falta el PDF de la ficha del fabricante: sin él, los números no se pueden comprobar.');
    }
    const revision = revisarDocumento(archivo.buffer, archivo.originalname || '');
    if (!revision.ok) throw new BadRequestException(revision.motivo);
    if (revision.tipo!.ext !== 'pdf') {
      throw new BadRequestException('La ficha técnica tiene que ser el PDF del fabricante.');
    }

    const repetida = await this.prisma.fichaOptica.findUnique({
      where: { modeloId_lente: { modeloId, lente: datos.lente } }, select: { id: true },
    });
    if (repetida) throw new ConflictException(`${modelo.modelo} con lente ${datos.lente} ya tiene ficha: corrígela en vez de crear otra.`);

    const doc = await this.prisma.document.create({
      data: {
        title: `Ficha técnica · ${modelo.marca} ${modelo.modelo} · ${datos.lente}`.slice(0, 160),
        category: 'FICHA_TECNICA',
        fileId: 'pendiente',
        uploadedBy: userId,
      },
      select: { id: true },
    });
    /* El nombre en el almacén sale del id que da la base, nunca del archivo:
       un nombre como «../../algo» podría salirse de su carpeta. */
    const objeto = nombreEnAlmacen(doc.id, revision.tipo!);
    try {
      await this.storage.put(objeto, archivo.buffer, revision.tipo!.mime);
      await this.prisma.document.update({ where: { id: doc.id }, data: { fileId: objeto } });
      const ficha = await this.prisma.fichaOptica.create({
        data: { ...datos, modeloId, documentoId: doc.id, declaradaPorId: userId },
        select: { id: true, lente: true },
      });
      await this.audit.record({
        userId, ip, action: 'FICHA_OPTICA_ALTA', entity: 'fichas_opticas', entityId: ficha.id,
        after: { marca: modelo.marca, modelo: modelo.modelo, ...datos },
      });
      return ficha;
    } catch (e) {
      /* Si algo falla a medias no queda un documento huérfano apuntando a nada. */
      await this.prisma.document.delete({ where: { id: doc.id } }).catch(() => undefined);
      await this.storage.remove(objeto).catch(() => undefined);
      throw e;
    }
  }

  /** Corregir números. Quita la verificación: el que verifica tiene que volver a mirar. */
  async editarFicha(id: string, dto: DatosFichaDto, userId: string | null, ip?: string) {
    const antes = await this.prisma.fichaOptica.findUnique({ where: { id } });
    if (!antes) throw new NotFoundException('Esa ficha no existe.');
    const { datos, problemas } = this.optica(dto);
    if (problemas.length) throw new BadRequestException(problemas.join(' '));
    if (datos.lente !== antes.lente) {
      const otra = await this.prisma.fichaOptica.findUnique({
        where: { modeloId_lente: { modeloId: antes.modeloId, lente: datos.lente } }, select: { id: true },
      });
      if (otra) throw new ConflictException(`Ya hay una ficha con la lente ${datos.lente}.`);
    }
    // Sin un solo número distinto, no se toca: la verificación sigue valiendo.
    if ((Object.keys(datos) as (keyof DatosOptica)[]).every((k) => igual(datos[k], (antes as any)[k]))) {
      return { id, sinCambios: true };
    }
    const r = await this.prisma.fichaOptica.update({
      where: { id },
      data: { ...datos, declaradaPorId: userId, declaradaEn: new Date(), verificadaPorId: null, verificadaEn: null },
      select: { id: true },
    });
    await this.audit.record({
      userId, ip, action: 'FICHA_OPTICA_EDITAR', entity: 'fichas_opticas', entityId: id,
      before: {
        lente: antes.lente, identificarM: antes.identificarM, reconocerM: antes.reconocerM,
        observarM: antes.observarM, detectarM: antes.detectarM, anguloH: antes.anguloH,
        verificada: !!antes.verificadaEn,
      },
      after: datos,
    });
    return r;
  }

  async verificarFicha(id: string, userId: string | null, ip?: string) {
    const f = await this.prisma.fichaOptica.findUnique({
      where: { id }, select: { id: true, declaradaPorId: true, lente: true, modelo: { select: { marca: true, modelo: true } } },
    });
    if (!f) throw new NotFoundException('Esa ficha no existe.');
    if (f.declaradaPorId && f.declaradaPorId === userId) {
      throw new ForbiddenException('La cargaste tú: la tiene que verificar otra persona, con el PDF delante.');
    }
    await this.prisma.fichaOptica.update({ where: { id }, data: { verificadaPorId: userId, verificadaEn: new Date() } });
    await this.audit.record({
      userId, ip, action: 'FICHA_OPTICA_VERIFICAR', entity: 'fichas_opticas', entityId: id,
      after: { marca: f.modelo.marca, modelo: f.modelo.modelo, lente: f.lente },
    });
    return { ok: true };
  }

  /**
   * Borrar: quien la cargó, mientras nadie la haya verificado; o quien tiene
   * permiso de cierre. Nunca con cámaras que la usan: el mapa se quedaría sin
   * saber qué ven.
   */
  async borrarFicha(id: string, userId: string | null, permisos: string[], ip?: string) {
    const f = await this.prisma.fichaOptica.findUnique({
      where: { id },
      select: {
        id: true, lente: true, declaradaPorId: true, verificadaEn: true, documentoId: true,
        modelo: { select: { marca: true, modelo: true } },
        _count: { select: { camaras: true } },
      },
    });
    if (!f) throw new NotFoundException('Esa ficha ya no existe.');
    const esJefe = permisos.includes('wo.approve');
    const esSuya = !!userId && f.declaradaPorId === userId && !f.verificadaEn;
    if (!esJefe && !esSuya) {
      throw new ForbiddenException('Sólo la borra quien la cargó (si aún no está verificada) o quien tiene permiso de cierre.');
    }
    if (f._count.camaras > 0) {
      throw new BadRequestException(`${f._count.camaras} cámara(s) usan esta ficha. Cámbialas de ficha antes de borrarla.`);
    }
    // Se audita ANTES de borrar (bloque 15).
    await this.audit.record({
      userId, ip, action: 'FICHA_OPTICA_BORRAR', entity: 'fichas_opticas', entityId: id,
      before: { marca: f.modelo.marca, modelo: f.modelo.modelo, lente: f.lente, verificada: !!f.verificadaEn },
    });
    await this.prisma.fichaOptica.delete({ where: { id } });
    const doc = await this.prisma.document.findUnique({ where: { id: f.documentoId }, select: { fileId: true } });
    const otras = await this.prisma.fichaOptica.count({ where: { documentoId: f.documentoId } });
    if (doc && otras === 0) {
      await this.prisma.document.delete({ where: { id: f.documentoId } }).catch(() => undefined);
      await this.storage.remove(doc.fileId).catch(() => undefined);
    }
    return { ok: true };
  }

  async pdfDeFicha(id: string) {
    const f = await this.prisma.fichaOptica.findUnique({
      where: { id },
      select: { lente: true, modelo: { select: { modelo: true } }, documento: { select: { fileId: true } } },
    });
    if (!f) throw new NotFoundException('Esa ficha no existe.');
    const buffer = await this.storage.getBuffer(f.documento.fileId);
    // El nombre lo limpia la cabecera (`common/descarga.ts`).
    return { buffer, nombre: `Ficha técnica ${f.modelo.modelo} ${f.lente}.pdf` };
  }

  leerFicha(texto: string) {
    return leerFicha(texto);
  }

  /**
   * Lo que se comprueba al guardar, sin guardar. Si los números valen, dice
   * además lo que verá la cámara (en gran angular y, si tiene zoom, en tele):
   * quien copia del PDF ve al momento si «67 m» le cuadra.
   */
  revisarFicha(dto: DatosFichaDto) {
    const { datos, problemas } = this.optica(dto);
    if (problemas.length) return { problemas, gran: null, tele: null };
    const gran = vision(datos, 1);
    return { problemas, gran, tele: gran.zoomMax > 1 ? vision(datos, gran.zoomMax) : null };
  }
}
