/**
 * LOS NIVELES DE RIESGO DEL MAPA — bloque 176. Una sola tabla para el plano,
 * la leyenda, la tarjeta y el editor: el mismo nivel no puede llamarse de dos
 * maneras ni pintarse de dos colores.
 */
export type NivelRiesgo = 'ALTO_RIESGO' | 'ALTURA' | 'ELECTRICO' | 'CALOR' | 'VITAL';

export const NIVELES: { nivel: NivelRiesgo; texto: string; icono: string; ayuda: string }[] = [
  { nivel: 'ALTO_RIESGO', texto: 'Alto riesgo', icono: '⚠', ayuda: 'Puede herirse una persona: paso de grúa, foso, barra caliente.' },
  { nivel: 'ELECTRICO', texto: 'Eléctrico', icono: '⚡', ayuda: 'Sala eléctrica, MCC, tableros energizados: bloqueo y permiso.' },
  { nivel: 'ALTURA', texto: 'Altura', icono: '⇡', ayuda: 'Para llegar hay que subir: PETAR de altura y arnés.' },
  { nivel: 'CALOR', texto: 'Calor', icono: '♨', ayuda: 'Radiación o material caliente cerca: EPP de calor.' },
  { nivel: 'VITAL', texto: 'Zona vital', icono: '◉', ayuda: 'Púlpito o zona que Producción no puede perder de vista.' },
];
export const NIVEL: Record<string, { texto: string; icono: string; ayuda: string }> =
  Object.fromEntries(NIVELES.map((n) => [n.nivel, n]));
