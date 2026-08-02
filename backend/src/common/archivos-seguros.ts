/**
 * VALIDACIÓN REAL DE LAS FOTOS QUE SE SUBEN.
 *
 * POR QUÉ EXISTE (hallazgo de la auditoría del 02/08)
 *
 * Las tres pantallas que suben fotos —activos, gabinetes y permisos de
 * altura— limitaban el TAMAÑO a 12 MB y nada más. En concreto:
 *
 *     await this.storage.put(objeto, file.buffer, file.mimetype || 'image/jpeg');
 *                                                 ^^^^^^^^^^^^^^
 * Ese `mimetype` LO MANDA EL NAVEGADOR. No lo mira nadie. Quien sube el
 * archivo decide qué dice que es.
 *
 * Se puede subir un .html o un .svg con JavaScript dentro, declararlo como
 * `text/html`, y queda guardado y servido con ese tipo. Al abrir la foto del
 * gabinete, el navegador ejecuta ese código con la sesión de quien lo abre.
 * Es un XSS almacenado, y el que lo dispara es el ingeniero al revisar una
 * evidencia.
 *
 * LA REGLA: no se cree lo que el archivo DICE ser, se mira lo que ES.
 * Los formatos de imagen empiezan por una firma fija de unos pocos bytes.
 * Eso no se puede falsificar sin dejar de ser una imagen válida.
 */

export interface ImagenAceptada {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
}

/** Tamaño máximo. 12 MB es una foto de móvil de sobra. */
export const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Mira los primeros bytes y dice qué es de verdad. `null` si no es ninguna
 * de las tres imágenes que aceptamos.
 */
export function tipoRealDeImagen(buf: Buffer | Uint8Array | null | undefined): ImagenAceptada | null {
  if (!buf || buf.length < 12) return null;
  const b = Buffer.from(buf.subarray(0, 16));

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A  (los 8 bytes completos, no sólo "PNG":
  // los cuatro últimos detectan un archivo corrompido al copiarlo por FTP)
  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return { mime: 'image/png', extension: 'png' };
  }
  // WEBP: "RIFF" .... "WEBP"  — el tamaño va en medio, por eso se miran los
  // dos trozos por separado.
  if (b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', extension: 'webp' };
  }
  return null;
}

/**
 * Comprueba una subida entera. Devuelve el motivo del rechazo en castellano
 * —va directo a la pantalla— o el tipo real si pasa.
 *
 * El mensaje NO dice "firma inválida" ni habla de bytes: quien sube la foto
 * es un técnico en planta, y lo que necesita saber es qué hacer.
 */
export function revisarImagen(
  file: { buffer?: Buffer; size?: number; originalname?: string } | null | undefined,
): { ok: true; tipo: ImagenAceptada } | { ok: false; motivo: string } {
  if (!file || !file.buffer || file.buffer.length === 0) {
    return { ok: false, motivo: 'No llegó ninguna foto. Vuelve a intentarlo.' };
  }
  if ((file.size ?? file.buffer.length) > MAX_BYTES) {
    return {
      ok: false,
      motivo: 'La foto pesa más de 12 MB. Hazla de nuevo con menos resolución.',
    };
  }
  const tipo = tipoRealDeImagen(file.buffer);
  if (!tipo) {
    return {
      ok: false,
      motivo: 'Ese archivo no es una foto (se aceptan JPG, PNG y WEBP). Si la sacaste con el teléfono, súbela directamente sin convertirla.',
    };
  }
  return { ok: true, tipo };
}

/**
 * Nombre del objeto en el almacén. La extensión sale del tipo REAL, nunca
 * del nombre que mandó el navegador: un nombre como `foto.jpg.html` o con
 * `../../` dentro no puede acabar decidiendo dónde ni cómo se guarda.
 */
export function nombreSeguro(prefijo: string, id: string, tipo: ImagenAceptada): string {
  const limpio = String(id).replace(/[^A-Za-z0-9_-]/g, '');
  return `${prefijo}/${limpio}-${Date.now()}.${tipo.extension}`;
}
