import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { revisarDocumento, nombreEnAlmacen } from './archivos-documento';

/**
 * DOCUMENTOS: MANUALES, PLANOS Y FICHAS (bloque 12.7).
 *
 * EL AGUJERO QUE CIERRA
 * El modelo `Document` existía en el esquema desde F0 y los permisos
 * `document.read` y `document.manage` estaban en el catálogo de roles. Pero
 * el módulo era un archivo con un `@Module({})` vacío: **el ingeniero podía
 * otorgar un permiso que no hacía absolutamente nada.**
 *
 * Es el tercer caso del mismo patrón en este proyecto (el mapa de red y la
 * pantalla de conexiones fueron los otros dos). La regla ya está escrita en
 * CLAUDE.md: *modelo + endpoint ≠ función. Sin pantalla, no existe.*
 *
 * PARA QUÉ SIRVE DE VERDAD
 * El técnico está frente a un NVR que no arranca, a las once de la noche, y
 * necesita el manual. Hoy eso significa llamar a alguien. Con esto, escanea
 * el QR del equipo y el manual está ahí.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async lista(filtros: { assetId?: string; locationId?: string; categoria?: string; q?: string }) {
    const q = filtros.q?.trim();
    return this.prisma.document.findMany({
      where: {
        ...(filtros.assetId ? { assetId: filtros.assetId } : {}),
        ...(filtros.locationId ? { locationId: filtros.locationId } : {}),
        ...(filtros.categoria ? { category: filtros.categoria as any } : {}),
        ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      select: {
        id: true, title: true, category: true, version: true, createdAt: true,
        uploadedBy: true, fileId: true, assetId: true, locationId: true,
        asset: { select: { assetCode: true } },
        location: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async subir(
    archivo: any,
    dto: { title: string; category: string; assetId?: string; locationId?: string },
    userId?: string | null,
    ip?: string | null,
  ) {
    if (!dto?.title?.trim()) throw new BadRequestException('Falta el título del documento.');

    const revision = revisarDocumento(archivo?.buffer, archivo?.originalname || '');
    if (!revision.ok) throw new BadRequestException(revision.motivo);
    const tipo = revision.tipo!;

    // Al menos uno de los dos: un documento suelto que no cuelga de nada no
    // lo encuentra nadie, y acaba siendo basura que ocupa espacio.
    if (!dto.assetId && !dto.locationId) {
      throw new BadRequestException(
        'Indica a qué equipo o a qué ubicación pertenece. Un documento que no cuelga de nada no lo encuentra nadie.',
      );
    }
    if (dto.assetId) {
      const existe = await this.prisma.asset.findFirst({
        where: { id: dto.assetId, deletedAt: null }, select: { id: true },
      });
      if (!existe) throw new BadRequestException('Ese equipo no existe.');
    }
    if (dto.locationId) {
      const existe = await this.prisma.location.findUnique({
        where: { id: dto.locationId }, select: { id: true },
      });
      if (!existe) throw new BadRequestException('Esa ubicación no existe.');
    }

    /* VERSIONADO: si ya hay un documento con el mismo título en el mismo
       sitio, este es la versión siguiente. NO se sobrescribe el anterior.
       Un plano viejo sigue siendo la verdad de cómo estaba la planta antes,
       y perder eso hace imposible entender un cambio. */
    const previo = await this.prisma.document.findFirst({
      where: {
        title: dto.title.trim(),
        assetId: dto.assetId || null,
        locationId: dto.locationId || null,
      },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const creado = await this.prisma.document.create({
      data: {
        title: dto.title.trim(),
        category: dto.category as any,
        fileId: 'pendiente',
        version: (previo?.version ?? 0) + 1,
        assetId: dto.assetId || null,
        locationId: dto.locationId || null,
        uploadedBy: userId || null,
      },
      select: { id: true, title: true, version: true },
    });

    // El nombre en el almacén se construye con el ID que acaba de dar la
    // base, NUNCA con el que puso el usuario: un nombre como
    // "../../algo" podría salirse de su carpeta.
    const objeto = nombreEnAlmacen(creado.id, tipo);
    await this.storage.put(objeto, archivo.buffer, tipo.mime);
    await this.prisma.document.update({ where: { id: creado.id }, data: { fileId: objeto } });

    await this.audit.record({
      userId: userId || null, action: 'UPLOAD_DOCUMENT', entity: 'documents',
      entityId: creado.id, ip,
      after: { title: creado.title, version: creado.version, tipo: tipo.ext },
    });

    return { ...creado, fileId: objeto };
  }

  /** Devuelve el contenido para descargarlo. */
  async descargar(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      select: { id: true, title: true, fileId: true },
    });
    if (!doc) throw new NotFoundException('Ese documento no existe.');

    const buffer = await this.storage.getBuffer(doc.fileId);
    const ext = doc.fileId.split('.').pop() || 'bin';
    // Se sirve SIEMPRE como descarga y con tipo genérico. Aunque alguien
    // hubiera colado un HTML, el navegador no lo ejecutaría en el dominio
    // del sistema — que es como se roban sesiones.
    return {
      buffer,
      nombre: `${doc.title.replace(/[^\w\s.-]/g, '_')}.${ext}`,
    };
  }

  async borrar(id: string, userId?: string | null, ip?: string | null) {
    const doc = await this.prisma.document.findUnique({
      where: { id }, select: { id: true, title: true, fileId: true, version: true },
    });
    if (!doc) throw new NotFoundException('Ese documento ya no existe.');

    await this.prisma.document.delete({ where: { id } });
    // El archivo se borra DESPUÉS de la fila. Si falla el borrado del
    // archivo queda un objeto huérfano en el almacén — molesto pero
    // inofensivo. Al revés dejaría una fila apuntando a nada, que sí rompe
    // la pantalla al intentar descargarlo.
    await this.storage.remove(doc.fileId).catch(() => undefined);

    await this.audit.record({
      userId: userId || null, action: 'DELETE_DOCUMENT', entity: 'documents',
      entityId: id, ip, before: { title: doc.title, version: doc.version },
    });
    return { ok: true };
  }
}
