import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolverContextoDePlanta } from '../../common/plant-context';

// exceljs entra con require, NO con `import * as`: con esModuleInterop eso
// da un espacio de nombres que compila y revienta al ejecutar. Es el mismo
// fallo de las etiquetas de gabinete (02/08) y hay verificador que lo caza.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS = require('exceljs');

/**
 * EXPORTACIÓN A EXCEL (bloque 11.1).
 *
 * PARA QUÉ EXISTE
 *   · Llevarse la información a una reunión sin acceso al sistema.
 *   · Pasar datos al ingeniero y a SAP sin transcribir.
 *   · Una copia LEGIBLE POR UNA PERSONA que sobrevive a cualquier cosa que
 *     le pase a la nube. Complementa a los respaldos; no los reemplaza.
 *
 * LO QUE NO PROMETE — y va dicho también en la portada del libro
 * Volver a subir estas hojas NO reconstruye el sistema: son 52 tablas
 * enlazadas por identificador. Por eso cada hoja INCLUYE los identificadores
 * (columnas grises al final): sin ellos, ni siquiera un futuro importador de
 * catálogos podría casar filas.
 *
 * DISEÑO
 *   · SÓLO LECTURA. Este módulo no escribe nada, nunca.
 *   · Cada tema es una función que devuelve { columnas, filas }. El armado
 *     del libro es común: una sola forma de fallar, no siete.
 *   · Los nombres de campo salieron de LEER schema.prisma, no de memoria:
 *     executedDate (no executionDate), currentStock (no stock), warehouse
 *     (no warehouseLocation). El verificador de campos vigila los `select`.
 */

interface Col { clave: string; titulo: string; ancho?: number; id?: boolean }
interface Hoja { nombre: string; columnas: Col[]; filas: Record<string, any>[] }

const ESTADO: Record<string, string> = {
  OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento',
  CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock',
};
const TIPO: Record<string, string> = {
  CAMERA: 'Cámara', NVR: 'NVR', SWITCH: 'Switch', WIRELESS: 'Enlace', ROUTER: 'Router',
  FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', FIBER: 'Fibra', CABINET: 'Gabinete',
  DECODER: 'Decodificador', PC: 'PC / iVMS', OTHER: 'Otro',
};
const fecha = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

@Injectable()
export class ExportacionService {
  constructor(private readonly prisma: PrismaService) {}

  /** El catálogo de lo exportable. La pantalla lo pinta tal cual. */
  catalogo() {
    return [
      { clave: 'activos', nombre: 'Activos', detalle: 'Cámaras, NVR y switches: estado, tren, etapa, ubicación y gabinete.' },
      { clave: 'gabinetes', nombre: 'Gabinetes', detalle: 'Cada gabinete con cuántos equipos aloja.' },
      { clave: 'ubicaciones', nombre: 'Ubicaciones', detalle: 'El árbol de planta: tren, etapa, zona.' },
      { clave: 'ordenes', nombre: 'Órdenes de mantenimiento', detalle: 'Todas las OM con estado, técnico y fechas.' },
      { clave: 'incidencias', nombre: 'Incidencias', detalle: 'Lo reportado, su prioridad y en qué quedó.' },
      { clave: 'repuestos', nombre: 'Almacén', detalle: 'Repuestos, stock actual y mínimos.' },
      { clave: 'red', nombre: 'Red', detalle: 'Enlaces declarados y qué cuelga de cada puerto.' },
    ];
  }

  /* ================= hojas ================= */

  private async hojaActivos(): Promise<Hoja> {
    const filas = await this.prisma.asset.findMany({
      where: { deletedAt: null },
      select: {
        id: true, assetCode: true, type: true, status: true, criticality: true,
        brand: true, model: true, serialNumber: true, referencePlace: true,
        locationId: true, cabinetId: true, installDate: true,
        location: { select: { name: true } },
        cabinet: { select: { code: true } },
        camera: { select: { nvrChannel: true, nvrName: true } },
      },
      orderBy: { assetCode: 'asc' },
    });
    const ctx = await resolverContextoDePlanta(this.prisma, filas as any);
    return {
      nombre: 'Activos',
      columnas: [
        { clave: 'codigo', titulo: 'Código', ancho: 20 },
        { clave: 'tipo', titulo: 'Tipo', ancho: 14 },
        { clave: 'estado', titulo: 'Estado', ancho: 17 },
        { clave: 'criticidad', titulo: 'Criticidad', ancho: 11 },
        { clave: 'tren', titulo: 'Tren', ancho: 9 },
        { clave: 'etapa', titulo: 'Etapa', ancho: 16 },
        { clave: 'ubicacion', titulo: 'Ubicación', ancho: 24 },
        { clave: 'gabinete', titulo: 'Gabinete', ancho: 12 },
        { clave: 'lugar', titulo: 'Lugar de referencia', ancho: 26 },
        { clave: 'marca', titulo: 'Marca', ancho: 12 },
        { clave: 'modelo', titulo: 'Modelo', ancho: 16 },
        { clave: 'serie', titulo: 'Nº serie', ancho: 16 },
        { clave: 'canal', titulo: 'Canal NVR', ancho: 10 },
        { clave: 'nombrePulpito', titulo: 'Nombre en púlpito', ancho: 20 },
        { clave: 'instalado', titulo: 'Instalado', ancho: 12 },
        { clave: 'id', titulo: 'ID', ancho: 20, id: true },
        { clave: 'idUbicacion', titulo: 'ID ubicación', ancho: 20, id: true },
        { clave: 'idGabinete', titulo: 'ID gabinete', ancho: 20, id: true },
      ],
      filas: filas.map((a) => ({
        codigo: a.assetCode,
        tipo: TIPO[a.type] || a.type,
        estado: ESTADO[a.status] || a.status,
        criticidad: a.criticality as string,
        tren: ctx[a.id]?.trenCode ?? '',
        etapa: ctx[a.id]?.etapaNombre ?? ctx[a.id]?.etapaCode ?? '',
        ubicacion: a.location?.name ?? '',
        gabinete: a.cabinet?.code ?? '',
        lugar: a.referencePlace ?? '',
        marca: a.brand ?? '',
        modelo: a.model ?? '',
        serie: a.serialNumber ?? '',
        canal: a.camera?.nvrChannel ?? '',
        nombrePulpito: a.camera?.nvrName ?? '',
        instalado: fecha(a.installDate),
        id: a.id, idUbicacion: a.locationId ?? '', idGabinete: a.cabinetId ?? '',
      })),
    };
  }

  private async hojaGabinetes(): Promise<Hoja> {
    const filas = await this.prisma.cabinet.findMany({
      select: {
        id: true, code: true, name: true, referencePlace: true, locationId: true,
        location: { select: { name: true } },
        _count: { select: { assets: true } },
      },
      orderBy: { code: 'asc' },
    });
    return {
      nombre: 'Gabinetes',
      columnas: [
        { clave: 'codigo', titulo: 'Código', ancho: 14 },
        { clave: 'nombre', titulo: 'Nombre', ancho: 26 },
        { clave: 'lugar', titulo: 'Referencia física', ancho: 26 },
        { clave: 'ubicacion', titulo: 'Ubicación', ancho: 24 },
        { clave: 'equipos', titulo: 'Equipos dentro', ancho: 14 },
        { clave: 'id', titulo: 'ID', ancho: 20, id: true },
        { clave: 'idUbicacion', titulo: 'ID ubicación', ancho: 20, id: true },
      ],
      filas: filas.map((g) => ({
        codigo: g.code, nombre: g.name, lugar: g.referencePlace ?? '',
        ubicacion: g.location?.name ?? '', equipos: g._count.assets,
        id: g.id, idUbicacion: g.locationId ?? '',
      })),
    };
  }

  private async hojaUbicaciones(): Promise<Hoja> {
    const filas = await this.prisma.location.findMany({
      select: {
        id: true, name: true, code: true, type: true, parentId: true,
        parent: { select: { name: true } },
        _count: { select: { assets: true, children: true } },
      },
      orderBy: { name: 'asc' },
    });
    return {
      nombre: 'Ubicaciones',
      columnas: [
        { clave: 'nombre', titulo: 'Nombre', ancho: 28 },
        { clave: 'codigo', titulo: 'Código', ancho: 14 },
        { clave: 'tipo', titulo: 'Tipo', ancho: 14 },
        { clave: 'padre', titulo: 'Cuelga de', ancho: 26 },
        { clave: 'equipos', titulo: 'Equipos', ancho: 9 },
        { clave: 'ramas', titulo: 'Sub-ramas', ancho: 10 },
        { clave: 'id', titulo: 'ID', ancho: 20, id: true },
        { clave: 'idPadre', titulo: 'ID padre', ancho: 20, id: true },
      ],
      filas: filas.map((u) => ({
        nombre: u.name, codigo: u.code ?? '', tipo: u.type as string,
        padre: u.parent?.name ?? '', equipos: u._count.assets, ramas: u._count.children,
        id: u.id, idPadre: u.parentId ?? '',
      })),
    };
  }

  private async hojaOrdenes(): Promise<Hoja> {
    const filas = await this.prisma.workOrder.findMany({
      select: {
        id: true, code: true, type: true, status: true, activity: true,
        scheduledDate: true, executedDate: true, createdAt: true, zone: true,
        assetId: true,
        asset: { select: { assetCode: true } },
        location: { select: { name: true } },
        technician: { select: { fullName: true } },
        closedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      nombre: 'Órdenes',
      columnas: [
        { clave: 'codigo', titulo: 'Código', ancho: 18 },
        { clave: 'tipo', titulo: 'Tipo', ancho: 13 },
        { clave: 'estado', titulo: 'Estado', ancho: 12 },
        { clave: 'actividad', titulo: 'Actividad', ancho: 42 },
        { clave: 'equipo', titulo: 'Equipo', ancho: 20 },
        { clave: 'ubicacion', titulo: 'Ubicación', ancho: 22 },
        { clave: 'zona', titulo: 'Zona', ancho: 14 },
        { clave: 'tecnico', titulo: 'Técnico', ancho: 22 },
        { clave: 'programada', titulo: 'Programada', ancho: 12 },
        { clave: 'ejecutada', titulo: 'Ejecutada', ancho: 12 },
        { clave: 'cerradaPor', titulo: 'Cerrada por', ancho: 22 },
        { clave: 'creada', titulo: 'Creada', ancho: 12 },
        { clave: 'id', titulo: 'ID', ancho: 20, id: true },
        { clave: 'idEquipo', titulo: 'ID equipo', ancho: 20, id: true },
      ],
      filas: filas.map((o) => ({
        codigo: o.code, tipo: o.type as string, estado: o.status as string,
        actividad: o.activity ?? '', equipo: o.asset?.assetCode ?? '',
        ubicacion: o.location?.name ?? '', zona: o.zone ?? '',
        tecnico: o.technician?.fullName ?? '',
        programada: fecha(o.scheduledDate), ejecutada: fecha(o.executedDate),
        cerradaPor: o.closedBy?.fullName ?? '', creada: fecha(o.createdAt),
        id: o.id, idEquipo: o.assetId ?? '',
      })),
    };
  }

  private async hojaIncidencias(): Promise<Hoja> {
    const filas = await this.prisma.incident.findMany({
      select: {
        id: true, code: true, title: true, status: true, priority: true,
        reportedAt: true, resolvedAt: true, zone: true, assetId: true,
        asset: { select: { assetCode: true } },
        responsible: { select: { fullName: true } },
      },
      orderBy: { reportedAt: 'desc' },
    });
    return {
      nombre: 'Incidencias',
      columnas: [
        { clave: 'codigo', titulo: 'Código', ancho: 18 },
        { clave: 'titulo', titulo: 'Incidencia', ancho: 42 },
        { clave: 'estado', titulo: 'Estado', ancho: 13 },
        { clave: 'prioridad', titulo: 'Prioridad', ancho: 11 },
        { clave: 'equipo', titulo: 'Equipo', ancho: 20 },
        { clave: 'zona', titulo: 'Zona', ancho: 14 },
        { clave: 'responsable', titulo: 'Responsable', ancho: 22 },
        { clave: 'reportada', titulo: 'Reportada', ancho: 12 },
        { clave: 'resuelta', titulo: 'Resuelta', ancho: 12 },
        { clave: 'id', titulo: 'ID', ancho: 20, id: true },
        { clave: 'idEquipo', titulo: 'ID equipo', ancho: 20, id: true },
      ],
      filas: filas.map((i) => ({
        codigo: i.code, titulo: i.title, estado: i.status as string,
        prioridad: i.priority as string, equipo: i.asset?.assetCode ?? '',
        zona: i.zone ?? '', responsable: i.responsible?.fullName ?? '',
        reportada: fecha(i.reportedAt), resuelta: fecha(i.resolvedAt),
        id: i.id, idEquipo: i.assetId ?? '',
      })),
    };
  }

  private async hojaRepuestos(): Promise<Hoja> {
    const filas = await this.prisma.sparePart.findMany({
      select: {
        id: true, sapCode: true, name: true, category: true, brand: true,
        model: true, currentStock: true, minStock: true, unit: true, warehouse: true,
      },
      orderBy: { name: 'asc' },
    });
    return {
      nombre: 'Almacén',
      columnas: [
        { clave: 'sap', titulo: 'Código SAP', ancho: 14 },
        { clave: 'nombre', titulo: 'Repuesto', ancho: 34 },
        { clave: 'categoria', titulo: 'Categoría', ancho: 18 },
        { clave: 'marca', titulo: 'Marca', ancho: 12 },
        { clave: 'modelo', titulo: 'Modelo compatible', ancho: 18 },
        { clave: 'stock', titulo: 'Stock', ancho: 8 },
        { clave: 'minimo', titulo: 'Mínimo', ancho: 8 },
        { clave: 'unidad', titulo: 'Unidad', ancho: 9 },
        { clave: 'donde', titulo: 'Almacén', ancho: 18 },
        { clave: 'alerta', titulo: 'Bajo mínimo', ancho: 11 },
        { clave: 'id', titulo: 'ID', ancho: 20, id: true },
      ],
      filas: filas.map((r) => ({
        sap: r.sapCode ?? '', nombre: r.name, categoria: r.category ?? '',
        marca: r.brand ?? '', modelo: r.model ?? '',
        stock: r.currentStock, minimo: r.minStock, unidad: r.unit ?? '',
        donde: r.warehouse ?? '',
        alerta: r.currentStock < r.minStock ? 'SÍ' : '',
        id: r.id,
      })),
    };
  }

  private async hojaRed(): Promise<Hoja> {
    const [enlaces, puertos] = await Promise.all([
      this.prisma.networkLink.findMany({
        select: {
          id: true, medium: true, isRing: true, description: true,
          endpointA: { select: { assetCode: true } },
          endpointB: { select: { assetCode: true } },
        },
      }),
      this.prisma.switchPort.findMany({
        where: { connectedAssetId: { not: null } },
        select: {
          id: true, portNumber: true,
          switchAsset: { select: { assetCode: true } },
          connectedAsset: { select: { assetCode: true } },
        },
        orderBy: { portNumber: 'asc' },
      }),
    ]);
    return {
      nombre: 'Red',
      columnas: [
        { clave: 'tipo', titulo: 'Tipo', ancho: 18 },
        { clave: 'a', titulo: 'Extremo A', ancho: 26 },
        { clave: 'b', titulo: 'Extremo B', ancho: 26 },
        { clave: 'detalle', titulo: 'Detalle', ancho: 30 },
        { clave: 'id', titulo: 'ID', ancho: 20, id: true },
      ],
      filas: [
        ...enlaces.map((e) => ({
          tipo: e.isRing ? 'Enlace (anillo)' : `Enlace (${e.medium})`,
          a: e.endpointA?.assetCode ?? '', b: e.endpointB?.assetCode ?? '',
          detalle: e.description ?? '', id: e.id,
        })),
        ...puertos.map((p) => ({
          tipo: 'Puerto de switch',
          a: `${p.switchAsset?.assetCode ?? ''} · puerto ${p.portNumber}`,
          b: p.connectedAsset?.assetCode ?? '',
          detalle: '', id: p.id,
        })),
      ],
    };
  }

  private async hoja(clave: string): Promise<Hoja> {
    switch (clave) {
      case 'activos': return this.hojaActivos();
      case 'gabinetes': return this.hojaGabinetes();
      case 'ubicaciones': return this.hojaUbicaciones();
      case 'ordenes': return this.hojaOrdenes();
      case 'incidencias': return this.hojaIncidencias();
      case 'repuestos': return this.hojaRepuestos();
      case 'red': return this.hojaRed();
      default:
        throw new BadRequestException('No existe esa exportación. Mira la lista en la pantalla Exportar.');
    }
  }

  /* ================= armado del libro ================= */

  private pintarHoja(wb: any, h: Hoja) {
    const ws = wb.addWorksheet(h.nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = h.columnas.map((c) => ({ key: c.clave, width: c.ancho ?? 16 }));

    const cab = ws.addRow(h.columnas.map((c) => c.titulo));
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cab.height = 18;

    for (const f of h.filas) ws.addRow(h.columnas.map((c) => f[c.clave]));

    // Las columnas de identificadores van en gris y con letra pequeña: son
    // para las máquinas, no para leerlas. Pero quitarlas sería peor: sin
    // ellas ninguna reimportación futura puede casar filas.
    h.columnas.forEach((c, i) => {
      if (c.id) ws.getColumn(i + 1).font = { size: 8, color: { argb: 'FF9AA0A8' } };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: h.columnas.length } };
  }

  /** Un solo tema → un .xlsx. */
  async exportarUna(clave: string): Promise<{ nombre: string; buffer: Buffer }> {
    const h = await this.hoja(clave);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SGIT-CCTV';
    this.pintarHoja(wb, h);
    const buffer = await wb.xlsx.writeBuffer();
    return { nombre: `sgit_${clave}_${new Date().toISOString().slice(0, 10)}.xlsx`, buffer: Buffer.from(buffer) };
  }

  /** El libro completo: todas las hojas más una portada honesta. */
  async exportarTodo(): Promise<{ nombre: string; buffer: Buffer }> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SGIT-CCTV';

    const portada = wb.addWorksheet('LÉEME');
    portada.columns = [{ width: 100 }];
    const lineas = [
      'SGIT-CCTV — Copia completa en Excel',
      `Generado: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`,
      '',
      'Este libro contiene una hoja por cada tema del sistema.',
      'Sirve como copia legible y para compartir información.',
      '',
      'IMPORTANTE: volver a subir estas hojas NO reconstruye el sistema.',
      'Los datos están enlazados entre sí por los identificadores (columnas',
      'grises). La restauración de verdad se hace desde los respaldos de la',
      'base de datos. Ante una pérdida, avisar ANTES de intentar nada.',
    ];
    lineas.forEach((t, i) => {
      const r = portada.addRow([t]);
      if (i === 0) r.font = { bold: true, size: 14, color: { argb: 'FF1F4E79' } };
      if (t.startsWith('IMPORTANTE')) r.font = { bold: true, color: { argb: 'FFB3261E' } };
    });

    for (const item of this.catalogo()) this.pintarHoja(wb, await this.hoja(item.clave));

    const buffer = await wb.xlsx.writeBuffer();
    return { nombre: `sgit_copia_completa_${new Date().toISOString().slice(0, 10)}.xlsx`, buffer: Buffer.from(buffer) };
  }
}
