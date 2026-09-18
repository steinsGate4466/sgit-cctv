import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HistoryService } from './history.service';
import { EquipoInstaladoService } from './equipo-instalado.service';
import { decidirReemplazo, TITULO, UMBRAL_REEMPLAZO } from './veredicto-reemplazo';
// PDF: se carga con require para no depender de @types en el build, igual que
// en `assets.service.ts` y en `maintenance.service.ts`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

/**
 * INFORME DE REEMPLAZO — bloque 108.
 *
 * =============================================================================
 *  QUÉ ES, Y EN QUÉ SE DIFERENCIA DEL INFORME DE ACTIVO QUE YA HABÍA
 * =============================================================================
 *  `GET /assets/:id/report` es la FICHA: qué es este equipo, dónde está, qué se
 *  le ha hecho. Sirve para ir a campo.
 *
 *  Esto es otra cosa: es el documento que se lleva a una reunión para pedir un
 *  presupuesto. No describe el equipo — **contesta una pregunta**: ¿hay que
 *  cambiarlo, o no? Y deja detrás los números con los que se contestó, para
 *  que quien firme pueda comprobarlo en lugar de creerse una frase.
 *
 * =============================================================================
 *  POR QUÉ NO LLEVA COSTES, Y POR QUÉ ESO NO ES UNA CARENCIA
 * =============================================================================
 *  En este sistema no hay precio de los equipos: no existe el campo, en ningún
 *  modelo. Poner una cifra «razonable» en un documento que va a una reunión de
 *  presupuesto sería inventar un dato de planta — y eso aquí no se hace ni para
 *  que el informe quede más completo.
 *
 *  El argumento económico que SÍ tenemos es mejor que un precio inventado, y es
 *  el que va destacado: **los minutos que el púlpito estuvo ciego** por culpa de
 *  este equipo. Eso es tiempo de producción sin vista, y lo entiende cualquiera
 *  sin saber de cámaras.
 *
 * =============================================================================
 *  Y POR QUÉ NO HAY DOS VERSIONES
 * =============================================================================
 *  Estaba previsto un informe «de supervisor» y otro «de técnico sin datos
 *  sensibles». Al escribirlo se comprobó qué lleva dentro: órdenes, causas,
 *  minutos sin visión, aparatos instalados. **Ni una contraseña, ni una IP de
 *  gestión, ni un coste.** No hay nada que quitar.
 *
 *  Hacer dos versiones iguales sólo para tener dos habría dado la falsa
 *  impresión de que la del técnico está recortada — y el día que alguien
 *  añadiera un dato sensible, lo pondría en «la completa» pensando que la otra
 *  se recorta sola. Una sola versión, y el control donde tiene que estar: en
 *  QUIÉN puede descargarla y de qué tren, que lo pone el ámbito del guard.
 */
@Injectable()
export class InformeReemplazoService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private history: HistoryService,
    private aparatos: EquipoInstaladoService,
  ) {}

  /** Los datos del veredicto, sin PDF. La pantalla los usa para el aviso. */
  async analisis(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true, assetCode: true, type: true, brand: true, model: true,
        serialNumber: true, criticality: true, installDate: true, deletedAt: true,
        location: { select: { name: true } },
      },
    });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');

    const [h, aparatos] = await Promise.all([
      this.history.delActivo(assetId),
      this.aparatos.historial(assetId),
    ]);

    const puesto = aparatos.items.find((x: any) => !x.hasta) || null;

    /* CORRECTIVAS, con la fecha que de verdad manda. `endedAt` es cuando se
       cerró; si la orden sigue abierta se usa cuando se creó. Tomar sólo
       `endedAt` dejaría fuera la avería de esta semana — justo la que más
       pesa para decidir. */
    const correctivas = (h.ordenes as any[])
      .filter((o) => o.type === 'CORRECTIVO')
      .map((o) => ({ fecha: o.endedAt || o.executedDate || o.scheduledDate || null }));

    const v = decidirReemplazo({
      severidad: h.severidad as any,
      codigos: (h.senales as any[]).map((s) => s.codigo),
      correctivas,
      aparatoDesde: puesto?.desde ?? null,
      aparatoDesdeEsEstimado: puesto?.desdeEsEstimado ?? false,
      reemplazosPrevios: aparatos.reemplazos,
    });

    return { asset, historial: h, aparatos, puesto, veredicto: v };
  }

  /** El PDF. Queda auditado: un informe que va a una reunión deja rastro. */
  async pdf(assetId: string, actorId?: string | null, ip?: string) {
    const d = await this.analisis(assetId);
    const { asset, historial: h, aparatos, puesto, veredicto } = d;

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const trozos: Buffer[] = [];
    doc.on('data', (c: Buffer) => trozos.push(c));
    const listo = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(trozos))));

    const NAVY = '#1b2a4a', ROJO = '#c0392b', AMBAR = '#b45309', VERDE = '#15803d', GRIS = '#555555';
    const ancho = doc.page.width;
    const f = (x: any) => (x ? new Date(x).toLocaleDateString('es-PE') : '—');

    const colorVeredicto = veredicto.veredicto === 'PROPONER_REEMPLAZO' ? ROJO
      : veredicto.veredicto === 'MIRAR_AGUAS_ARRIBA' ? AMBAR
        : veredicto.veredicto === 'SIN_MOTIVO' ? VERDE : AMBAR;

    // ---- Cabecera ----
    doc.rect(0, 0, ancho, 92).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(17).text('ACEROS AREQUIPA — Planta Pisco', 50, 26);
    doc.fillColor('#cfd8e3').fontSize(10).text('SGIT-CCTV · Informe de reemplazo de equipo', 50, 50);
    doc.fillColor('#ffffff').fontSize(20).text(asset.assetCode, 0, 34, { align: 'right', width: ancho - 50 });
    doc.fillColor('#000000');

    let y = 112;
    const titulo = (t: string, color = NAVY) => {
      if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
      doc.fontSize(13).fillColor(color).text(t, 50, y); y = doc.y + 6;
      doc.moveTo(50, y).lineTo(ancho - 50, y).strokeColor('#dddddd').stroke(); y += 8;
    };
    const linea = (k: string, v: string) => {
      if (y > doc.page.height - 90) { doc.addPage(); y = 50; }
      doc.fontSize(10).fillColor(GRIS).text(k, 50, y);
      doc.fontSize(11).fillColor('#000000').text(v || '—', 210, y, { width: ancho - 260 });
      y = doc.y + 5;
    };
    const parrafo = (t: string, color = '#000000', tam = 10) => {
      if (y > doc.page.height - 110) { doc.addPage(); y = 50; }
      doc.fontSize(tam).fillColor(color).text(t, 50, y, { width: ancho - 100 });
      y = doc.y + 6;
    };

    /* EL VEREDICTO VA ARRIBA DEL TODO, EN UN RECUADRO.
       Quien recibe esto en una reunión lee la primera página y decide. Si la
       conclusión estuviera al final, el informe funcionaría como un expediente
       que nadie termina. */
    doc.rect(50, y, ancho - 100, 2).fill(colorVeredicto);
    y += 12;
    doc.fontSize(16).fillColor(colorVeredicto).text(TITULO[veredicto.veredicto], 50, y, { width: ancho - 100 });
    y = doc.y + 6;
    parrafo(veredicto.frase, '#000000', 11);
    if (veredicto.apoyadoEnFechaEstimada) {
      parrafo('Aviso: la fecha de instalación del aparato actual es ESTIMADA (se tomó '
        + 'del alta del punto, porque la real no estaba registrada). El reparto de '
        + 'fallas entre el aparato actual y el anterior puede variar.', AMBAR, 9);
    }
    y += 4;

    // ---- El punto ----
    titulo('El punto de instalación');
    linea('Código', asset.assetCode);
    linea('Tipo', asset.type);
    linea('Ubicación', asset.location?.name || '—');
    linea('Criticidad', asset.criticality);
    linea('Dado de alta', f(asset.installDate));

    // ---- El aparato ----
    titulo('El aparato que está puesto');
    if (!puesto) {
      parrafo('No hay ningún aparato registrado en este punto. Sin ese dato no se '
        + 'puede separar qué fallas son del equipo actual y cuáles del anterior, así '
        + 'que el análisis de abajo cuenta TODAS las del punto.', AMBAR);
    } else {
      linea('Marca y modelo', [puesto.marca, puesto.modelo].filter(Boolean).join(' ') || '—');
      linea('N° de serie', puesto.serie || '—');
      linea('Firmware', puesto.firmware || '—');
      linea('Instalado el', f(puesto.desde) + (puesto.desdeEsEstimado ? '  (estimada)' : ''));
    }
    linea('Aparatos consumidos por este punto', String(aparatos.reemplazos));

    // ---- Los números ----
    titulo('Los números en los que se apoya');
    linea('Correctivas del APARATO actual', String(veredicto.correctivasDelAparato));
    linea('Correctivas del PUNTO (todos los aparatos)', String(veredicto.correctivasDelSitio));
    linea('Umbral para proponer reemplazo', String(UMBRAL_REEMPLAZO));
    linea(`Órdenes en los últimos ${h.ventanaDias} días`, String(h.resumen.ordenesEnVentana));
    linea('Cerradas SIN encontrar falla', String(h.resumen.sinFallaEncontrada));
    linea('Marcadas como repetidas por el técnico', String(h.resumen.marcadasReincidentes));
    linea('Incidencias registradas', String(h.resumen.incidencias));

    /* EL ARGUMENTO QUE ENTIENDE PRODUCCIÓN. No es el número de órdenes: es el
       tiempo que el púlpito estuvo sin ver. Va destacado a propósito. */
    y += 4;
    const min = h.resumen.minutosSinVision || 0;
    doc.fontSize(12).fillColor(min > 0 ? ROJO : GRIS)
      .text(min > 0
        ? `El púlpito estuvo ${min} minutos sin vista por culpa de este punto.`
        : 'No hay minutos sin visión registrados para este punto.',
      50, y, { width: ancho - 100 });
    y = doc.y + 10;

    // ---- Señales ----
    titulo('Qué se ha observado');
    if (!(h.senales as any[]).length) {
      parrafo('Ninguna señal de reincidencia.', GRIS);
    } else {
      for (const s of h.senales as any[]) {
        parrafo(`• ${s.mensaje}`, s.severidad === 'CONFIRMADA' ? ROJO : AMBAR);
        if (s.sugerencia) parrafo(`   ${s.sugerencia}`, GRIS, 9);
      }
    }

    // ---- Causas ----
    const causas = Object.entries((h.porCausa || {}) as Record<string, number>)
      .sort((a, b) => b[1] - a[1]);
    if (causas.length) {
      titulo('Por qué falló, según los cierres');
      for (const [causa, n] of causas) linea(causa, `${n} vez(ces)`);
    }

    // ---- Aparatos anteriores ----
    const anteriores = (aparatos.items as any[]).filter((x) => x.hasta);
    if (anteriores.length) {
      titulo('Aparatos que ya pasaron por este punto');
      for (const a of anteriores) {
        linea(
          [a.marca, a.modelo].filter(Boolean).join(' ') || 'sin marca',
          `${f(a.desde)} → ${f(a.hasta)} · ${a.motivoRetiro || 'sin motivo registrado'}`,
        );
      }
    }

    // ---- Pie ----
    y += 10;
    titulo('Quién decide');
    parrafo('Este documento PROPONE, no decide. El sistema reúne los datos y redacta '
      + 'la conclusión; el visto bueno lo pone el ingeniero responsable, con su firma '
      + 'y su criterio. Los números de arriba están para que pueda comprobarla, no '
      + 'para que tenga que creérsela.', GRIS, 9);
    parrafo(`Generado el ${new Date().toLocaleString('es-PE')} · SGIT-CCTV`, GRIS, 8);

    doc.end();
    const buffer = await listo;

    await this.audit.record({
      userId: actorId || null,
      action: 'INFORME_REEMPLAZO',
      entity: 'assets',
      entityId: assetId,
      ip,
      after: {
        assetCode: asset.assetCode,
        veredicto: veredicto.veredicto,
        correctivasDelAparato: veredicto.correctivasDelAparato,
      },
    }).catch(() => null);

    return { buffer, filename: `reemplazo-${asset.assetCode}.pdf` };
  }
}
