/* =============================================================================
   POR QUÉ SE CERRÓ LA SESIÓN — bloque 183
   -----------------------------------------------------------------------------
   «Me botó aunque estaba trabajando.» Hasta aquí había DOS caminos que te
   llevaban a la pantalla de acceso y sólo uno decía por qué:

     · el cierre por inactividad  → «se cerró por inactividad»;
     · el servidor que rechaza la renovación (sesión revocada, cuenta
       desactivada, acceso cortado) → la pantalla de acceso, MUDA.

   Para quien lo vive son idénticos, así que todo se achacaba a la
   inactividad y nadie podía decir qué pasó de verdad. Ahora cada salida
   forzada deja escrito su motivo y la hora, y la pantalla de acceso lo lee.
   Un fallo que no habla no se arregla.
============================================================================= */

import { hora } from '../fechas';

export type MotivoSalida = 'inactividad' | 'sesion' | 'otra-pestana';

const CLAVE = 'sgit.ultimaSalida';

export interface Salida {
  motivo: MotivoSalida;
  /** Texto del servidor, o los minutos de inactividad. */
  detalle?: string;
  hora: number;
}

export function registrarSalida(motivo: MotivoSalida, detalle?: string) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ motivo, detalle, hora: Date.now() } as Salida));
  } catch { /* sin almacenamiento: la pantalla dirá sólo el motivo de la URL */ }
}

/** Se olvida al volver a entrar: se cuenta hasta entonces, no para siempre. */
export function olvidarSalida() {
  try { localStorage.removeItem(CLAVE); } catch { /* nada que olvidar */ }
}

/** Lee la última salida (no la borra: la borra el siguiente inicio de sesión). */
export function leerSalida(): Salida | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const s = JSON.parse(raw) as Salida;
    // Una salida de hace más de un día ya no explica nada de lo que se ve.
    return s && Date.now() - s.hora < 86_400_000 ? s : null;
  } catch { return null; }
}

/** La frase que se enseña en la pantalla de acceso. `null` = no hay nada que contar. */
export function textoDeSalida(motivoUrl: string | null, s: Salida | null): string | null {
  const motivo = s?.motivo || motivoUrl;
  const a = s ? ` (a las ${hora(s.hora)})` : '';
  if (motivo === 'inactividad') {
    const min = s?.detalle ? `${s.detalle} minutos` : 'un rato';
    return `Tu sesión se cerró por inactividad${a}: ${min} sin usar la aplicación. Vuelve a ingresar.`;
  }
  if (motivo === 'sesion') {
    const d = s?.detalle ? ` El servidor dijo: «${s.detalle}».` : '';
    return `Tu sesión terminó${a}.${d} Vuelve a ingresar.`;
  }
  if (motivo === 'otra-pestana') return `Se cerró la sesión en otra pestaña${a}. Vuelve a ingresar.`;
  return null;
}
