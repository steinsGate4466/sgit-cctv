/**
 * EL TEXTO DE CADA AVISO — función pura, probada aparte.
 *
 * POR QUÉ ESTO ES UN ARCHIVO PROPIO Y NO CADENAS SUELTAS POR AHÍ
 *
 * Un aviso se lee a las tres de la mañana, medio dormido, en una pantalla de
 * cinco pulgadas, con la notificación asomando media línea. Es contenido, no
 * decoración: si no se entiende en esa media línea, no sirve.
 *
 * De ahí las reglas de abajo. Todas salen de imaginarse a alguien mirando el
 * teléfono en la cama, no a alguien sentado delante del sistema.
 */

export interface Aviso {
  asunto: string;
  cuerpo: string;
  /** Sin sonido. Los resúmenes no despiertan a nadie. */
  silencioso: boolean;
}

/** Recorta sin cortar una palabra por la mitad. */
function recortar(t: string, max: number): string {
  const s = (t || '').trim();
  if (s.length <= max) return s;
  const corte = s.slice(0, max);
  const esp = corte.lastIndexOf(' ');
  return (esp > max * 0.6 ? corte.slice(0, esp) : corte) + '…';
}

function linea(etiqueta: string, valor?: string | null): string {
  const v = (valor || '').trim();
  return v ? `${etiqueta}: ${v}\n` : '';
}

/**
 * LA PRIMERA LÍNEA ES EL AVISO ENTERO.
 * En el teléfono se ve el asunto y poco más. Si dice "SGIT-CCTV: nueva
 * notificación", obliga a abrir la aplicación para saber si importa — y a la
 * tercera vez ya no se abre.
 */
export function omCerrada(d: {
  code: string; equipo?: string | null; lugar?: string | null;
  actividad?: string | null; cerradaPor?: string | null;
  sintoma?: string | null; causa?: string | null; accion?: string | null;
  duracionMin?: number | null; enlace?: string | null;
}): Aviso {
  return {
    asunto: `✅ ${d.code} cerrada · ${d.equipo || 'sin equipo'}`,
    cuerpo:
      `${recortar(d.actividad || 'Orden cerrada', 90)}\n\n` +
      linea('Equipo', d.equipo) +
      linea('Dónde', d.lugar) +
      linea('Síntoma', d.sintoma) +
      linea('Causa', d.causa) +
      linea('Acción', d.accion) +
      linea('Tiempo', d.duracionMin ? `${d.duracionMin} min` : null) +
      linea('Cerró', d.cerradaPor) +
      // EL INFORME NO VIAJA POR TELEGRAM: va el enlace. Un PDF con fotos de
      // planta subido a Telegram queda alojado en sus servidores, fuera del
      // control de la empresa, y cualquiera lo reenvía con dos toques.
      (d.enlace ? `\nInforme completo: ${d.enlace}` : ''),
    silencioso: false,
  };
}

export function omEnEspera(d: {
  code: string; equipo?: string | null; queEspera?: string | null;
  dias?: number | null; tecnico?: string | null; enlace?: string | null;
}): Aviso {
  const cuanto = d.dias && d.dias > 0 ? ` (${d.dias} día(s))` : '';
  return {
    // Se dice QUÉ espera en el asunto. "OM-123 en espera" no permite decidir
    // nada; "esperando repuesto" sí: quien lee sabe si le toca a él.
    asunto: `⏸ ${d.code} parada${cuanto} · ${recortar(d.queEspera || 'sin motivo declarado', 40)}`,
    cuerpo:
      linea('Equipo', d.equipo) +
      linea('Espera', d.queEspera) +
      linea('Parada desde hace', d.dias ? `${d.dias} día(s)` : 'hoy') +
      linea('Técnico', d.tecnico) +
      (d.enlace ? `\n${d.enlace}` : ''),
    silencioso: false,
  };
}

export function omAsignada(d: {
  code: string; equipo?: string | null; actividad?: string | null;
  para?: string | null; asignadaPor?: string | null; enlace?: string | null;
}): Aviso {
  return {
    asunto: `🔧 Te asignaron ${d.code} · ${d.equipo || 'sin equipo'}`,
    cuerpo:
      `${recortar(d.actividad || 'Sin descripción', 120)}\n\n` +
      linea('Equipo', d.equipo) +
      linea('Para', d.para) +
      linea('Asignó', d.asignadaPor) +
      (d.enlace ? `\n${d.enlace}` : ''),
    silencioso: false,
  };
}

export function incidenciaCritica(d: {
  code: string; titulo: string; equipo?: string | null; tren?: string | null;
  prioridad?: string | null; reportaba?: string | null; enlace?: string | null;
}): Aviso {
  return {
    asunto: `🔴 ${d.prioridad === 'CRITICA' ? 'CRÍTICA' : 'Alta'} · ${recortar(d.titulo, 60)}`,
    cuerpo:
      linea('Incidencia', d.code) +
      linea('Equipo', d.equipo) +
      linea('Tren', d.tren) +
      linea('Reportó', d.reportaba) +
      (d.enlace ? `\n${d.enlace}` : ''),
    silencioso: false,
  };
}

/**
 * Resumen diario. Va SIN SONIDO a propósito.
 *
 * Si todo suena igual, la gente silencia el bot entero — y ahí se acabó el
 * sistema de avisos, incluido lo urgente. Lo que despierta se reserva para lo
 * que exige levantarse.
 */
export function resumenDiario(d: {
  vencidas: number; paradas: number; bajoMinimo: number; sinDetallar: number;
  enlace?: string | null;
}): Aviso | null {
  const total = d.vencidas + d.paradas + d.bajoMinimo + d.sinDetallar;
  // Sin nada que contar NO SE MANDA NADA. Un "hoy no hay novedades" diario es
  // la forma más rápida de que alguien silencie el bot.
  if (total === 0) return null;

  const partes = [
    d.sinDetallar ? `${d.sinDetallar} sin detallar` : '',
    d.vencidas ? `${d.vencidas} vencida(s)` : '',
    d.paradas ? `${d.paradas} parada(s)` : '',
    d.bajoMinimo ? `${d.bajoMinimo} repuesto(s) bajo mínimo` : '',
  ].filter(Boolean);

  return {
    asunto: `📋 Hoy: ${partes.join(' · ')}`,
    cuerpo: partes.map((p) => `• ${p}`).join('\n') + (d.enlace ? `\n\n${d.enlace}` : ''),
    silencioso: true,
  };
}

/**
 * Junta asunto y cuerpo en el mensaje que se manda.
 * Se escapa lo que Telegram interpretaría como formato: un código de equipo
 * con guion bajo saldría en cursiva y a medias.
 */
export function mensajeCompleto(a: Aviso): string {
  return `${a.asunto}\n\n${a.cuerpo}`.trim();
}
