import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HOJAS_DE_ARRANQUE,
  MAX_CARACTERES_DESCRIPCION,
  PASOS_POR_DEFECTO,
} from './hojas-de-arranque';

/* exceljs entra con `require`, NO con `import * as`: con `esModuleInterop`
   eso devuelve un espacio de nombres y no una clase, así que `new` compila y
   revienta al ejecutarse. Ya pasó con PDFDocument (bloque 3). */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS = require('exceljs');

/* =============================================================================
   HOJAS DE RUTA — bloque 75
   -----------------------------------------------------------------------------
   Los pasos de un mantenimiento preventivo, con el formato de SAP PM.

   UNA HOJA POR TIPO DE EQUIPO. Una sola sirve para las cuatrocientas cámaras
   de Laminación: si fuera por equipo habría que escribir los mismos catorce
   pasos cuatrocientas veces, y el día que cambie uno habría que corregirlo
   cuatrocientas veces.
============================================================================= */

@Injectable()
export class HojasRutaService {
  constructor(private prisma: PrismaService) {}

  private readonly incluir = {
    aprobadaPor: { select: { id: true, fullName: true } },
    operaciones: {
      orderBy: [{ operacion: 'asc' as const }, { subOperacion: 'asc' as const }],
      include: { materiales: true },
    },
  };

  async listar() {
    const hojas = await this.prisma.hojaDeRuta.findMany({
      include: this.incluir,
      orderBy: { descripcion: 'asc' },
    });

    /* Cuántos EQUIPOS usa cada hoja. Es el número que hace que la pantalla
       signifique algo: «MANTENIMIENTO DE CAMARA · 412 equipos» dice de un
       vistazo que tocar ese documento tiene consecuencias. */
    const porTipo = await this.prisma.asset.groupBy({
      by: ['type'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const cuantos = new Map(porTipo.map((t: any) => [t.type, t._count._all]));

    return hojas.map((h) => ({
      ...h,
      equiposQueLaUsan: cuantos.get(h.tipoEquipo) ?? 0,
      /* Se cuentan aquí y no en la pantalla: si se contara en el frontend, un
         día la lista diría 14 pasos y el detalle 13 y nadie sabría cuál miente. */
      totalPasos: h.operaciones.length,
    }));
  }

  async unaSola(id: string) {
    const h = await this.prisma.hojaDeRuta.findUnique({ where: { id }, include: this.incluir });
    if (!h) throw new NotFoundException('Hoja de ruta no encontrada');
    return h;
  }

  /** Los pasos con los que nace una hoja nueva: seguridad y documentación. */
  plantillaNueva() {
    return { pasos: PASOS_POR_DEFECTO, maxCaracteres: MAX_CARACTERES_DESCRIPCION };
  }

  /* ---------------------------------------------------------------------------
     LA VALIDACIÓN QUE DE VERDAD IMPORTA
  --------------------------------------------------------------------------- */
  /**
   * Comprueba el límite de 40 caracteres ANTES de guardar.
   *
   * No es una preferencia de estilo: **SAP corta ese campo en 40**, y si una
   * sola línea se pasa, la carga se rechaza ENTERA — no la línea, la carga.
   * Buscar cuál fue entre setenta líneas es media mañana.
   *
   * Se valida al GUARDAR y no al exportar a propósito: si se dejara para el
   * final, el ingeniero se enteraría de que su documento no sirve el día que
   * intenta subirlo, con todo el trabajo hecho.
   */
  private revisarLargos(descripcion: string, pasos: { descripcion: string }[]) {
    const malas: string[] = [];
    if (descripcion.length > MAX_CARACTERES_DESCRIPCION) {
      malas.push(`El título tiene ${descripcion.length} caracteres (máximo ${MAX_CARACTERES_DESCRIPCION}).`);
    }
    for (const p of pasos) {
      if (p.descripcion.length > MAX_CARACTERES_DESCRIPCION) {
        malas.push(`«${p.descripcion}» tiene ${p.descripcion.length} caracteres (máximo ${MAX_CARACTERES_DESCRIPCION}).`);
      }
    }
    if (malas.length) {
      throw new BadRequestException(
        `SAP no acepta descripciones de más de ${MAX_CARACTERES_DESCRIPCION} caracteres. ${malas.join(' ')}`,
      );
    }
  }

  /**
   * Crea o reemplaza la hoja de un tipo de equipo.
   *
   * TODO EN UNA TRANSACCIÓN. Los pasos se borran y se vuelven a escribir: es
   * más simple que casar cuáles cambiaron, y con la transacción no hay ningún
   * instante en que la hoja exista sin sus pasos. Si se hiciera en dos
   * operaciones y fallara la segunda, quedaría un documento vacío que dice
   * que no hay que hacer nada.
   */
  async guardar(dto: any, userId?: string | null) {
    const pasos: any[] = Array.isArray(dto.operaciones) ? dto.operaciones : [];
    if (!pasos.length) {
      throw new BadRequestException('Una hoja de ruta sin pasos no le sirve a nadie. Añade al menos uno.');
    }
    this.revisarLargos(dto.descripcion || '', pasos);

    /* Dos pasos con el mismo número reventarían contra el índice único con un
       error de base que no dice nada. Mejor decirlo aquí, con el número. */
    const claves = pasos.map((p) => `${p.operacion}-${p.subOperacion ?? 'principal'}`);
    const repetida = claves.find((c, i) => claves.indexOf(c) !== i);
    if (repetida) {
      throw new BadRequestException(`Hay dos pasos con el número ${repetida}. Cada paso lleva el suyo.`);
    }

    const cabecera = {
      descripcion: dto.descripcion,
      ubicacionSap: dto.ubicacionSap || null,
      grupoPlanif: dto.grupoPlanif || null,
      frecuencia: dto.frecuencia || '3 MESES',
      frecuenciaDias: this.diasDeLaFrecuencia(dto.frecuencia),
      puestoTrabajo: dto.puestoTrabajo || null,
      centro: dto.centro || null,
      trabajoTotalH: dto.trabajoTotalH ?? null,
      numPersonas: dto.numPersonas ?? null,
      duracionH: dto.duracionH ?? null,
      activa: dto.activa ?? true,
    };

    return this.prisma.$transaction(async (tx) => {
      const hoja = await tx.hojaDeRuta.upsert({
        where: { tipoEquipo: dto.tipoEquipo },
        create: { ...cabecera, tipoEquipo: dto.tipoEquipo },
        update: cabecera,
      });

      await tx.operacionHojaRuta.deleteMany({ where: { hojaId: hoja.id } });
      for (const p of pasos) {
        const op = await tx.operacionHojaRuta.create({
          data: {
            hojaId: hoja.id,
            operacion: Number(p.operacion),
            subOperacion: p.subOperacion == null ? null : Number(p.subOperacion),
            /* La clave se DEDUCE, no se pide: sin suboperación es la operación
               principal (PM01) y con ella es un paso (PM04). Pedirla sería
               dejar que alguien la ponga al revés. */
            claveControl: p.subOperacion == null ? 'PM01' : 'PM04',
            descripcion: p.descripcion,
            puestoTrabajo: p.puestoTrabajo || cabecera.puestoTrabajo,
            centro: p.centro || cabecera.centro,
            duracionH: p.duracionH ?? null,
            numPersonas: p.numPersonas ?? null,
          },
        });
        for (const m of (p.materiales || [])) {
          if (!m?.descripcion) continue;
          await tx.materialOperacion.create({
            data: {
              operacionId: op.id,
              descripcion: m.descripcion,
              cantidad: m.cantidad ?? null,
              unidad: m.unidad || null,
              sparePartId: m.sparePartId || null,
            },
          });
        }
      }

      if (userId && dto.aprobar) {
        await tx.hojaDeRuta.update({
          where: { id: hoja.id },
          data: { aprobadaPorId: userId, aprobadaEn: new Date() },
        });
      }
      return tx.hojaDeRuta.findUnique({ where: { id: hoja.id }, include: this.incluir });
    });
  }

  /**
   * De «3 MESES» a 90 días.
   *
   * Si no se entiende el texto se devuelve `null` y NO se inventa un número:
   * la hoja sigue valiendo como documento, sólo que no se puede programar
   * sola. Inventar 30 días haría que el sistema empezase a generar órdenes con
   * una frecuencia que nadie pidió.
   */
  private diasDeLaFrecuencia(txt?: string | null): number | null {
    if (!txt) return null;
    const t = txt.toUpperCase().trim();
    const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (/MES|^\d+M$/.test(t)) return n * 30;
    if (/SEMANA|^\d+S$/.test(t)) return n * 7;
    if (/AÑO|ANIO|^\d+A$/.test(t)) return n * 365;
    if (/D[IÍ]A|^\d+D$/.test(t)) return n;
    return null;
  }

  /** Carga las cinco hojas del ingeniero. No pisa las que ya existan. */
  async cargarLasDelIngeniero() {
    let creadas = 0;
    const yaEstaban: string[] = [];
    for (const h of HOJAS_DE_ARRANQUE) {
      const existe = await this.prisma.hojaDeRuta.findUnique({
        where: { tipoEquipo: h.tipoEquipo as any },
        select: { id: true },
      });
      if (existe) { yaEstaban.push(h.descripcion); continue; }
      await this.guardar({
        tipoEquipo: h.tipoEquipo,
        descripcion: h.descripcion,
        ubicacionSap: h.ubicacionSap,
        grupoPlanif: h.grupoPlanif,
        frecuencia: h.frecuencia,
        puestoTrabajo: h.puestoTrabajo,
        centro: h.centro,
        trabajoTotalH: h.trabajoTotalH,
        numPersonas: h.numPersonas,
        duracionH: h.duracionH,
        operaciones: h.pasos.map((p) => ({
          operacion: p.op,
          subOperacion: p.sub,
          descripcion: p.texto,
        })),
      });
      creadas++;
    }
    return { creadas, yaEstaban };
  }

  /* ---------------------------------------------------------------------------
     EL EXCEL PARA SAP
  --------------------------------------------------------------------------- */
  /**
   * Genera el libro con las MISMAS columnas y en el MISMO orden que el Excel
   * del ingeniero, para que se pueda cargar a SAP sin retocar nada.
   *
   * Se conserva incluso la columna «Cant. Caract.», que es la que él usa para
   * comprobar el límite de 40 antes de subir. Quitarla porque «el sistema ya
   * lo valida» obligaría a fiarse a ciegas.
   */
  async excel(id?: string): Promise<{ buffer: Buffer; filename: string }> {
    const hojas = id
      ? [await this.unaSola(id)]
      : await this.prisma.hojaDeRuta.findMany({ where: { activa: true }, include: this.incluir });

    if (!hojas.length) throw new NotFoundException('No hay hojas de ruta que exportar');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SGIT-CCTV · Aceros Arequipa Pisco';
    wb.created = new Date();

    const CABECERAS = [
      'Ubicación en SAP', 'Equipo', 'Descripción Principal de la H.R.', 'G.P.',
      'Frecuencia', 'Ope.', 'SubOpe.', 'Puesto Trabajo', 'Cent.', 'Clave Cont.',
      'Descripción de Operación', 'Total Trabajo', 'U.N. Trab.', 'N° Perso.',
      'Dura.', 'U.N. Dura.', 'Calculo Clave', 'Cant. Caract.',
    ];

    for (const h of hojas as any[]) {
      /* Un nombre de pestaña de Excel no admite más de 31 caracteres ni los
         símbolos \ / ? * [ ]. Si se pasa, el archivo se abre corrupto. */
      const nombre = h.descripcion.replace(/[\\/?*[\]:]/g, '').slice(0, 31);
      const ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });

      ws.addRow(CABECERAS);
      const fila1 = ws.getRow(1);
      fila1.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      fila1.height = 28;
      fila1.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      fila1.eachCell((c: any) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16233B' } };
      });

      for (const op of h.operaciones) {
        const esPrincipal = op.subOperacion == null;
        ws.addRow([
          esPrincipal ? h.ubicacionSap : '',
          '',
          esPrincipal ? h.descripcion : '',
          esPrincipal ? h.grupoPlanif : '',
          esPrincipal ? h.frecuencia : '',
          op.operacion,
          op.subOperacion ?? '',
          op.puestoTrabajo ?? h.puestoTrabajo ?? '',
          op.centro ?? h.centro ?? '',
          op.claveControl,
          op.descripcion,
          esPrincipal ? h.trabajoTotalH ?? '' : 0,
          'H',
          esPrincipal ? h.numPersonas ?? '' : '',
          esPrincipal ? h.duracionH ?? '' : '',
          'H',
          2,
          op.descripcion.length,
        ]);
      }

      ws.columns.forEach((c: any, i: number) => {
        c.width = i === 10 ? 44 : i === 2 ? 38 : 13;
      });

      /* La columna del contador se pinta en rojo si alguna se pasa de 40. El
         sistema no deja guardarlas así, pero un archivo viejo abierto a mano
         sí puede tenerlas, y entonces se ve de un vistazo cuál es. */
      ws.eachRow((row: any, n: number) => {
        if (n === 1) return;
        const celda = row.getCell(18);
        if (Number(celda.value) > MAX_CARACTERES_DESCRIPCION) {
          celda.font = { bold: true, color: { argb: 'FFC0121F' } };
        }
      });
    }

    const buffer: Buffer = await wb.xlsx.writeBuffer();
    const cuando = new Date().toISOString().slice(0, 10);
    const filename = id
      ? `hoja-de-ruta-${(hojas[0] as any).tipoEquipo}-${cuando}.xlsx`
      : `hojas-de-ruta-${cuando}.xlsx`;
    return { buffer, filename };
  }
}
