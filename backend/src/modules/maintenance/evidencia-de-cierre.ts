/**
 * TODA ORDEN SE CIERRA CON FOTO, O CON EL PORQUÉ — bloque 163.
 *
 * Pedido de Cristhian: «que todo se pueda registrar, se pueda evidenciar,
 * historial, imágenes». El cierre firmado ya pedía causa, síntoma y acción,
 * pero se podía cerrar una correctiva sin una sola foto: en la auditoría la
 * orden decía «cámara reparada» y no había nada que lo enseñara.
 *
 * Regla: para cerrar hace falta AL MENOS UNA FOTO de evidencia en la orden.
 * Si de verdad no se pudo tomar (zona donde no se permite cámara, equipo sin
 * acceso visual, celular sin batería) se escribe el motivo, y queda firmado en
 * la orden y en la auditoría. No se bloquea el trabajo; se obliga a decirlo.
 */
export const MINIMO_MOTIVO_SIN_FOTO = 10;

export type VeredictoEvidencia =
  | { ok: true; motivo: string | null }
  | { ok: false; error: string };

export function evidenciaDeCierre(fotos: number, motivoSinFoto?: string | null): VeredictoEvidencia {
  if (fotos > 0) return { ok: true, motivo: null };
  const m = (motivoSinFoto || '').trim();
  if (m.length >= MINIMO_MOTIVO_SIN_FOTO) return { ok: true, motivo: m };
  return {
    ok: false,
    error: 'Para cerrar la orden hace falta al menos una foto de evidencia. '
      + 'Si no se pudo tomar, escribe por qué (mínimo 10 letras): queda firmado en la orden.',
  };
}

/** Lo que se añade al diagnóstico cuando se cierra sin foto: se lee en la orden y en su PDF. */
export const notaSinFoto = (motivo: string) => `[Cerrada sin foto de evidencia: ${motivo}]`;
