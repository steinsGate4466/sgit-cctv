import { fechaCorta } from '../fechas';/**
 * Catálogos del módulo de Órdenes de Mantenimiento.
 * Viven aparte para que Mantenimiento, Preventivo y Correctivo usen los mismos
 * textos y no acaben con etiquetas distintas para el mismo valor.
 */

export const WO_TYPES = ['PREVENTIVO', 'CORRECTIVO', 'MEJORA', 'PREDICTIVO', 'MAPEO'];

export const WO_TYPE_ES: Record<string, string> = {
  PREVENTIVO: 'Preventivo',
  CORRECTIVO: 'Correctivo',
  MEJORA: 'Mejora',
  PREDICTIVO: 'Predictivo',
  MAPEO: 'Mapeo de activos',
};

/** Por dónde llegó el pedido de Producción. */
export const CANAL_ES: Record<string, string> = {
  SAP: 'SAP',
  WHATSAPP: 'WhatsApp',
  RADIO: 'Radio (púlpito)',
  CORREO: 'Correo',
  VERBAL: 'En persona',
  SISTEMA: 'Generada por el sistema',
};
export const CANALES = ['SAP', 'WHATSAPP', 'RADIO', 'CORREO', 'VERBAL'];

/**
 * Causas de cierre AGRUPADAS por familia.
 * Son 17: en una lista plana, dentro de un teléfono y con la parada corriendo,
 * el técnico elegiría la primera que vea. Agrupadas se encuentran rápido.
 */
export const CAUSAS: { grupo: string; opciones: { v: string; t: string }[] }[] = [
  {
    grupo: 'Energía',
    opciones: [
      { v: 'ENERGIA_CORTE', t: 'Corte o falla eléctrica' },
      { v: 'FUENTE_POE', t: 'Fuente / inyector PoE' },
    ],
  },
  {
    grupo: 'Cableado',
    opciones: [
      { v: 'CABLE_DANADO', t: 'Cable dañado (cortado, aplastado, quemado)' },
      { v: 'CABLE_FUERA_NORMA', t: 'Tramo fuera de norma (más de 90 m)' },
      { v: 'CONECTOR', t: 'Conector RJ45 / empalme' },
    ],
  },
  {
    grupo: 'Equipo',
    opciones: [
      { v: 'EQUIPO_QUEMADO', t: 'Equipo quemado' },
      { v: 'EQUIPO_FIN_VIDA', t: 'Fin de vida útil / desgaste' },
      { v: 'CONFIGURACION', t: 'Configuración incorrecta' },
      { v: 'FIRMWARE', t: 'Firmware' },
    ],
  },
  {
    grupo: 'Red',
    opciones: [
      { v: 'PUERTO_SWITCH', t: 'Puerto del switch' },
      { v: 'ENLACE_INALAMBRICO', t: 'Enlace inalámbrico / antena' },
      { v: 'SATURACION_NVR', t: 'Sesiones del grabador agotadas' },
      { v: 'DISCO_NVR', t: 'Disco del grabador' },
    ],
  },
  {
    grupo: 'Entorno',
    opciones: [
      { v: 'AMBIENTAL', t: 'Ambiental (polvo, calor, humedad, escoria)' },
      { v: 'GOLPE_VANDALISMO', t: 'Golpe o vandalismo' },
    ],
  },
  {
    grupo: 'Otros',
    opciones: [
      { v: 'SIN_FALLA_ENCONTRADA', t: 'No se encontró falla' },
      { v: 'OTRO', t: 'Otra causa' },
    ],
  },
];

export const CAUSA_ES: Record<string, string> = Object.fromEntries(
  CAUSAS.flatMap((g) => g.opciones.map((o) => [o.v, o.t])),
);

/** Fecha y hora en formato local, corto. */
export const fh = (v?: string | null) => fechaCorta(v, '—');

/** Minutos a "2 h 15 min". */
export function duracion(min?: number | null): string {
  if (min === null || min === undefined) return '—';
  const signo = min < 0 ? '-' : '';
  const m = Math.abs(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${signo}${h ? `${h} h ` : ''}${r} min`;
}
