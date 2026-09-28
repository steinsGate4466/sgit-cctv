/**
 * PARADA REAL Y PRÓRROGA DE UNA ORDEN — bloques 138 y 135.
 *
 * Lógica PURA, sin base de datos: se prueba aparte (test/parada-prorroga.spec.ts).
 * Cada función devuelve `{ error }` con la frase que verá el usuario, o el
 * cambio a aplicar. El servicio sólo traduce eso a Prisma.
 */

export type EventoParada = 'INICIO' | 'FIN';

interface OrdenMinima {
  status: string;
  scheduledDate?: Date | null;
  paradaInicioReal?: Date | null;
  paradaFinReal?: Date | null;
}

const CERRADAS = ['CERRADA', 'CANCELADA'];
/** Margen para relojes que no van al segundo (el del móvil y el del servidor). */
const MARGEN_FUTURO_MS = 5 * 60 * 1000;
/** Una prórroga más allá de esto no es una prórroga: es otra orden. */
export const PRORROGA_MAX_DIAS = 180;

export function evaluarEventoDeParada(
  wo: OrdenMinima,
  evento: EventoParada,
  hora: Date,
  ahora: Date,
): { error: string } | { campo: 'paradaInicioReal' | 'paradaFinReal'; valor: Date } {
  if (CERRADAS.includes(wo.status)) return { error: 'La orden está cerrada: su parada ya no se puede cambiar.' };
  if (isNaN(hora.getTime())) return { error: 'La hora no es válida.' };
  if (hora.getTime() > ahora.getTime() + MARGEN_FUTURO_MS) {
    return { error: 'La hora está en el futuro. Se declara cuando pasa, no antes.' };
  }
  if (evento === 'INICIO') {
    if (wo.paradaFinReal && hora > wo.paradaFinReal) {
      return { error: 'El inicio no puede ser después del fin ya declarado.' };
    }
    return { campo: 'paradaInicioReal', valor: hora };
  }
  if (!wo.paradaInicioReal) return { error: 'Primero declara cuándo empezó la parada.' };
  if (hora < wo.paradaInicioReal) return { error: 'El fin no puede ser antes del inicio.' };
  return { campo: 'paradaFinReal', valor: hora };
}

export function evaluarPedidoDeProrroga(
  wo: OrdenMinima,
  fechaPedida: Date,
  motivo: string,
  hayPendiente: boolean,
  ahora: Date,
): { error: string } | { ok: true } {
  if (CERRADAS.includes(wo.status)) return { error: 'La orden está cerrada: no necesita prórroga.' };
  if (hayPendiente) return { error: 'Ya hay una prórroga pedida para esta orden. Espera a que la resuelvan.' };
  if ((motivo || '').trim().length < 5) return { error: 'Escribe el motivo: sin él no se puede aprobar.' };
  if (isNaN(fechaPedida.getTime())) return { error: 'La fecha no es válida.' };
  if (fechaPedida <= ahora) return { error: 'La nueva fecha tiene que ser futura.' };
  if (wo.scheduledDate && fechaPedida <= wo.scheduledDate) {
    return { error: 'La nueva fecha tiene que ser posterior a la que ya tiene.' };
  }
  const tope = new Date(ahora.getTime() + PRORROGA_MAX_DIAS * 86400000);
  if (fechaPedida > tope) return { error: `Más de ${PRORROGA_MAX_DIAS} días no es una prórroga: es otra orden.` };
  return { ok: true };
}

/**
 * ¿Puede ESTA persona resolver ESTA prórroga? Dos llaves: quien la pidió no la
 * aprueba, aunque tenga el permiso de aprobar.
 */
export function evaluarResolucion(
  prorroga: { estado: string; pedidaPorId: string | null },
  resolutorId: string | null,
  aprobar: boolean,
  nota: string | undefined,
): { error: string } | { ok: true } {
  if (prorroga.estado !== 'PENDIENTE') return { error: 'Esa prórroga ya se resolvió.' };
  if (resolutorId && prorroga.pedidaPorId === resolutorId) {
    return { error: 'No puedes resolver tu propia prórroga: la aprueba otra persona.' };
  }
  if (!aprobar && (nota || '').trim().length < 5) return { error: 'Di por qué se rechaza: el técnico lo necesita.' };
  return { ok: true };
}
