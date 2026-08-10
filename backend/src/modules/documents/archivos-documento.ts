/**
 * QUÉ ARCHIVOS SE ACEPTAN COMO DOCUMENTO — lógica pura, probada aparte.
 *
 * `archivos-seguros.ts` valida IMÁGENES por sus primeros bytes. Aquí hace
 * falta más: un manual es un PDF, un plano puede ser DWG, una configuración
 * de switch es texto plano.
 *
 * LA REGLA: NO SE CREE LO QUE EL ARCHIVO DICE SER.
 * La extensión la escribe quien sube; los primeros bytes los escribe el
 * programa que lo generó. Un `.pdf` que empieza por `MZ` es un ejecutable de
 * Windows con el nombre cambiado, y eso no entra.
 *
 * DWG y texto plano no tienen firma fiable —el texto no tiene ninguna— así
 * que para ésos se acepta por extensión Y se guarda con un tipo que el
 * navegador NO ejecuta. Es la diferencia entre "confío" y "no puede hacer
 * daño aunque mienta".
 */

export interface TipoDocumento {
  ext: string;
  mime: string;
  /** true si se verificó por los bytes; false si sólo por extensión. */
  verificado: boolean;
}

/** 25 MB. Un plano grande cabe; un vídeo, no — y un vídeo no es un documento. */
export const MAX_BYTES_DOC = 25 * 1024 * 1024;

const empieza = (b: Buffer, bytes: number[], desde = 0) =>
  b.length >= desde + bytes.length && bytes.every((x, i) => b[desde + i] === x);

/**
 * Firmas que sí se pueden comprobar. El orden importa: los formatos de
 * Office y los .zip comparten cabecera (PK), así que se distinguen por
 * extensión sólo DESPUÉS de confirmar que son un zip de verdad.
 */
export function tipoRealDeDocumento(buf: Buffer, nombre: string): TipoDocumento | null {
  const ext = (nombre.split('.').pop() || '').toLowerCase();

  // PDF: "%PDF"
  if (empieza(buf, [0x25, 0x50, 0x44, 0x46])) {
    return { ext: 'pdf', mime: 'application/pdf', verificado: true };
  }

  // Contenedor ZIP: "PK\x03\x04". Los .docx/.xlsx lo son por dentro.
  if (empieza(buf, [0x50, 0x4b, 0x03, 0x04])) {
    if (ext === 'docx') return { ext, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', verificado: true };
    if (ext === 'xlsx') return { ext, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', verificado: true };
    if (ext === 'zip') return { ext, mime: 'application/zip', verificado: true };
    return null; // un zip con otra extensión: no se adivina
  }

  // Imágenes (planos escaneados, fotos de placa)
  if (empieza(buf, [0xff, 0xd8, 0xff])) return { ext: 'jpg', mime: 'image/jpeg', verificado: true };
  if (empieza(buf, [0x89, 0x50, 0x4e, 0x47])) return { ext: 'png', mime: 'image/png', verificado: true };

  // DWG: "AC10xx". Es una firma débil pero existe.
  if (empieza(buf, [0x41, 0x43, 0x31, 0x30])) {
    return { ext: 'dwg', mime: 'application/octet-stream', verificado: true };
  }

  /* SIN FIRMA: texto plano. Una configuración de switch exportada es texto y
     no tiene cabecera de nada. Se acepta por extensión, PERO se guarda como
     `text/plain`: aunque alguien meta HTML con un <script> dentro, el
     navegador lo enseñará como texto en vez de ejecutarlo. */
  if (['txt', 'cfg', 'conf', 'log', 'csv'].includes(ext)) {
    // Se comprueba que de verdad parece texto: sin bytes nulos en el arranque.
    const muestra = buf.subarray(0, 512);
    if (!muestra.includes(0)) {
      return { ext, mime: 'text/plain; charset=utf-8', verificado: false };
    }
  }

  return null;
}

export interface RevisionDoc { ok: boolean; motivo?: string; tipo?: TipoDocumento }

export function revisarDocumento(buf: Buffer | null | undefined, nombre: string): RevisionDoc {
  if (!buf || buf.length === 0) return { ok: false, motivo: 'El archivo llegó vacío.' };
  if (buf.length > MAX_BYTES_DOC) {
    return { ok: false, motivo: `El archivo pesa más de ${Math.round(MAX_BYTES_DOC / 1024 / 1024)} MB.` };
  }
  const tipo = tipoRealDeDocumento(buf, nombre);
  if (!tipo) {
    return {
      ok: false,
      motivo:
        'Ese archivo no es de un tipo admitido, o su contenido no coincide con su extensión. ' +
        'Se aceptan: PDF, DOCX, XLSX, JPG, PNG, DWG, TXT, CFG, LOG y CSV.',
    };
  }
  return { ok: true, tipo };
}

/** Nombre en el almacén. Nunca el que puso el usuario: podría traer rutas. */
export function nombreEnAlmacen(id: string, tipo: TipoDocumento): string {
  return `documentos/${id}.${tipo.ext}`;
}
