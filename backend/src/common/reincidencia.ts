/**
 * DETECCIÓN DE REINCIDENCIA.
 *
 * PARA QUÉ EXISTE
 * La queja concreta del Jefe de Mantenimiento es: "se soluciona por un momento
 * y luego vuelve a fallar, casi nunca sabemos por qué". Eso ocurre porque cada
 * intervención se trata como un caso aislado: el técnico va, arregla el
 * síntoma, se va, y nadie mira si ya había pasado antes.
 *
 * Estas reglas leen el historial y dicen si hay un patrón. Son funciones puras
 * —no consultan la base— para poder probarlas caso por caso: una regla que
 * marca de más es tan inútil como una que no marca nada, porque en ambos casos
 * la gente deja de mirarla.
 */

export type Severidad = 'NINGUNA' | 'SOSPECHA' | 'CONFIRMADA';

export interface SenalReincidencia {
  codigo: string;
  /** Qué se detectó, en lenguaje de planta. */
  mensaje: string;
  severidad: Severidad;
  /** Qué conviene revisar. Sin esto la alerta no sirve de nada. */
  sugerencia?: string;
}

/** Ventana en días para considerar que dos fallas están relacionadas. */
export const VENTANA_DIAS = 90;

/** Órdenes correctivas dentro de la ventana que hacen sospechar. */
export const UMBRAL_ORDENES = 3;

export interface DatosHistorial {
  /** Órdenes del activo, de la más reciente a la más antigua. */
  ordenes: {
    type: string;
    status: string;
    rootCause?: string | null;
    isRecurrent?: boolean | null;
    endedAt?: Date | string | null;
    executedDate?: Date | string | null;
  }[];
  /** Tramos de cable conectados al activo. */
  tramos?: { meters?: number | null; metersEstimated?: boolean | null; shielded?: boolean | null; route?: string | null }[];
  /** Cuántos activos comparten infraestructura y cuántos de ellos fallaron. */
  compartida?: { vecinos: number; vecinosConFalla: number; via?: string | null };
  /** Límite de norma del tramo, en metros. */
  limiteTramoM?: number;
}

const fecha = (o: any): number => {
  const d = o?.endedAt || o?.executedDate;
  return d ? new Date(d).getTime() : 0;
};

/**
 * Evalúa el historial y devuelve las señales encontradas.
 * Devuelve un arreglo vacío cuando no hay patrón: no se inventan alertas.
 */
export function evaluarReincidencia(d: DatosHistorial): SenalReincidencia[] {
  const senales: SenalReincidencia[] = [];
  const ordenes = d.ordenes || [];
  const limite = d.limiteTramoM ?? 90;

  const desde = Date.now() - VENTANA_DIAS * 24 * 60 * 60 * 1000;
  const enVentana = ordenes.filter((o) => fecha(o) >= desde);
  const correctivas = enVentana.filter((o) => o.type === 'CORRECTIVO');

  // --- 1) Varias correctivas en poco tiempo -------------------------------
  if (correctivas.length >= UMBRAL_ORDENES) {
    senales.push({
      codigo: 'ORDENES_REPETIDAS',
      mensaje: `${correctivas.length} órdenes correctivas en los últimos ${VENTANA_DIAS} días.`,
      severidad: 'CONFIRMADA',
      sugerencia: 'La causa de fondo no se ha resuelto. Revisar antes de volver a intervenir.',
    });
  } else if (correctivas.length === 2) {
    senales.push({
      codigo: 'ORDENES_REPETIDAS',
      mensaje: `2 órdenes correctivas en los últimos ${VENTANA_DIAS} días.`,
      severidad: 'SOSPECHA',
    });
  }

  // --- 2) Cierres sin falla encontrada ------------------------------------
  // Es la señal más valiosa: el técnico fue, revisó, no halló nada, y volvió a
  // fallar. Eso NO es un fracaso del técnico: es la huella de una falla
  // intermitente —cable largo, interferencia, contacto flojo con el calor—.
  const sinFalla = ordenes.filter((o) => o.rootCause === 'SIN_FALLA_ENCONTRADA');
  if (sinFalla.length >= 2) {
    senales.push({
      codigo: 'SIN_FALLA_REPETIDA',
      mensaje: `${sinFalla.length} intervenciones cerradas sin encontrar falla.`,
      severidad: 'CONFIRMADA',
      sugerencia:
        'Patrón de falla intermitente. Revisar longitud del tramo, blindaje, ' +
        'conectores y presupuesto PoE del switch.',
    });
  } else if (sinFalla.length === 1 && correctivas.length >= 2) {
    senales.push({
      codigo: 'SIN_FALLA_REPETIDA',
      mensaje: 'Una intervención se cerró sin encontrar falla y hubo más órdenes después.',
      severidad: 'SOSPECHA',
      sugerencia: 'Posible intermitencia. Medir el tramo de cable si no está medido.',
    });
  }

  // --- 3) Marcado por el técnico ------------------------------------------
  const marcadas = ordenes.filter((o) => o.isRecurrent);
  if (marcadas.length >= 2) {
    senales.push({
      codigo: 'MARCADA_POR_TECNICO',
      mensaje: `El técnico marcó ${marcadas.length} veces que el problema ya se había presentado.`,
      severidad: 'CONFIRMADA',
    });
  }

  // --- 4) Tramo de cable fuera de norma -----------------------------------
  // Pasado el límite el enlace no falla: falla A VECES. Es la explicación
  // material de la intermitencia y nadie la ve si no está anotada.
  for (const t of d.tramos || []) {
    if (t.meters != null && t.meters > limite) {
      senales.push({
        codigo: 'TRAMO_FUERA_NORMA',
        mensaje: `Tramo de ${t.meters} m, por encima del límite de ${limite} m` +
          (t.metersEstimated ? ' (medida estimada).' : '.'),
        severidad: ordenes.length ? 'CONFIRMADA' : 'SOSPECHA',
        sugerencia: 'Causa material probable de la intermitencia. Considerar repetidor o fibra.',
      });
    }
    if (t.route === 'BANDEJA' && t.shielded === false && ordenes.length) {
      senales.push({
        codigo: 'RUIDO_BANDEJA',
        mensaje: 'Cable sin blindaje por bandeja, con historial de fallas.',
        severidad: 'SOSPECHA',
        sugerencia: 'Verificar si comparte bandeja con fuerza. El ruido da fallas irreproducibles.',
      });
    }
  }

  // --- 5) Infraestructura compartida --------------------------------------
  // Si los vecinos que cuelgan de la misma antena o switch también fallan, el
  // problema no es este equipo. Es lo que hoy nadie puede ver.
  const c = d.compartida;
  if (c && c.vecinos > 0 && c.vecinosConFalla >= 2) {
    senales.push({
      codigo: 'FALLA_COMPARTIDA',
      mensaje: `${c.vecinosConFalla} de ${c.vecinos} equipos que comparten ` +
        `${c.via || 'la misma infraestructura'} también tuvieron fallas.`,
      severidad: 'CONFIRMADA',
      sugerencia: 'El problema probablemente NO está en este equipo, sino aguas arriba.',
    });
  }

  return senales;
}

/** La severidad más alta encontrada. Sirve para pintar un solo distintivo. */
export function severidadGlobal(senales: SenalReincidencia[]): Severidad {
  if (senales.some((s) => s.severidad === 'CONFIRMADA')) return 'CONFIRMADA';
  if (senales.some((s) => s.severidad === 'SOSPECHA')) return 'SOSPECHA';
  return 'NINGUNA';
}
