/**
 * EL REPORTE DE PRODUCCIÓN — bloque 51-B.
 *
 * =============================================================================
 *  POR QUÉ EXISTE
 * =============================================================================
 *  Hoy, para avisar que una cámara del Tren 1 no ve, el Ing. Cañasas tiene que
 *  llenar el mismo formulario que un técnico de red: categoría, prioridad,
 *  sesiones concurrentes del NVR, cámaras aguas abajo. Nada de eso lo sabe, y
 *  no tiene por qué saberlo. El resultado conocido es que no lo llena: avisa
 *  por radio, el aviso se pierde, y el sistema nunca se entera de que la línea
 *  estuvo ocho horas sin visión.
 *
 *  Producción reporta TRES cosas: qué cámara, la zona si la sabe, y una foto
 *  del púlpito si puede. Todo lo demás lo deriva el sistema o lo pone el
 *  técnico después.
 *
 * =============================================================================
 *  QUÉ DECIDE ESTE MÓDULO
 * =============================================================================
 *  Una sola cosa, pero la que importa: si el aviso ABRE una incidencia nueva o
 *  SE SUMA a una que ya está abierta.
 *
 *  En ITIL varios avisos del mismo síntoma sobre el mismo elemento son UN solo
 *  incidente. Abrir cinco incidencias porque cinco personas vieron la misma
 *  cámara apagada le da al técnico cinco cosas que cerrar y cero información
 *  nueva. Sumarlas le da una sola cosa que hacer y un dato que antes no tenía:
 *  cuánta gente se quedó sin ver.
 *
 * =============================================================================
 *  LO QUE NO HACE
 * =============================================================================
 *  No inventa prioridad. La deriva de la criticidad declarada de la zona, y si
 *  esa criticidad NO está declarada lo dice en voz alta y deja MEDIA — no
 *  supone que es baja sólo porque nadie la llenó.
 *
 *  No sube la prioridad solo. Cuando el mismo problema se reporta tres veces lo
 *  SUGIERE; la decisión sigue siendo de una persona.
 *
 *  Es puro: no toca la base, no conoce Prisma, no genera códigos. Por eso se
 *  puede probar entero sin levantar nada.
 */

/** Criticidad productiva declarada de la zona. `null` = nadie la declaró. */
export type Criticidad = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA' | null;

export type Prioridad = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';

/**
 * Los estados en los que una incidencia SIGUE VIVA. Mientras esté en uno de
 * ellos, un aviso nuevo del mismo activo es el mismo problema.
 *
 * `RESUELTA` NO está en la lista, y es a propósito: si el técnico la dio por
 * resuelta y Producción sigue sin ver, eso no es «el mismo aviso otra vez», es
 * una reparación que no funcionó. Merece incidencia propia para que quede
 * contada.
 */
export const ESTADOS_VIVOS = ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'];

/** Minutos dentro de los cuales una reaparición cuenta como reparación fallida. */
const VENTANA_REAPARICION_MIN = 24 * 60;

/** A partir de cuántos avisos se sugiere subir la prioridad. */
const AVISOS_PARA_SUGERIR_SUBIDA = 3;

export interface IncidenciaDelActivo {
  id: string;
  code: string;
  estado: string;
  reportadaEn: Date;
  /** Cuándo se marcó resuelta, si lo está. Sirve para detectar reaparición. */
  resueltaEn?: Date | null;
  prioridad: Prioridad;
  /** Quiénes ya avisaron de esta incidencia, incluido quien la abrió. */
  yaAvisaronIds: string[];
}

export interface EntradaDeReporte {
  activoCodigo: string;
  /** Nombre de planta, si lo tiene. «Cámara del lecho de enfriamiento». */
  activoNombre?: string | null;
  /** La zona que escribió Producción. Opcional: si no la sabe, no la pone. */
  zonaEscrita: string | null;
  quienReportaId: string;
  quienReportaNombre: string;
  /** El tren, derivado del árbol. Nunca lo teclea Producción. */
  trenNombre: string | null;
  /** Criticidad declarada de la zona del activo. `null` = sin declarar. */
  criticidadZona: Criticidad;
  /** Incidencias del MISMO activo, vivas o recién resueltas. */
  incidenciasDelActivo: IncidenciaDelActivo[];
  ahora: Date;
}

export type Decision = 'NUEVA' | 'SE_SUMA' | 'YA_LO_REPORTASTE';

export interface Reporte {
  decision: Decision;
  /** La incidencia a la que se sumó. `null` cuando hay que crear una nueva. */
  incidenciaId: string | null;
  incidenciaCodigo: string | null;
  /** Cuántos avisos lleva el problema contando éste. */
  vecesReportada: number;
  /** Sólo tiene sentido cuando `decision === 'NUEVA'`. */
  titulo: string;
  prioridad: Prioridad;
  /** En castellano, de dónde salió esa prioridad. Nunca «porque sí». */
  prioridadPorque: string;
  /** La cámara volvió a caer poco después de darse por reparada. */
  reaparecio: boolean;
  reaparecioTrasMin: number | null;
  /** Se propone subir la prioridad; NO se sube sola. */
  sugiereSubirPrioridad: boolean;
  /** Lo que se le contesta a quien reportó, en su idioma. */
  respuesta: string;
}

/**
 * La criticidad de la zona manda sobre la prioridad, con un tope: una zona
 * CRÍTICA sin visión entra como ALTA, no como CRÍTICA. CRÍTICA despierta gente
 * de madrugada y esa decisión la toma una persona mirando la planta, no una
 * tabla.
 */
function prioridadDe(c: Criticidad): { prioridad: Prioridad; porque: string } {
  switch (c) {
    case 'CRITICA':
      return {
        prioridad: 'ALTA',
        porque: 'La zona está declarada CRÍTICA. Entra como ALTA; subirla a CRÍTICA lo decide una persona.',
      };
    case 'ALTA':
      return { prioridad: 'ALTA', porque: 'La zona está declarada de criticidad ALTA.' };
    case 'MEDIA':
      return { prioridad: 'MEDIA', porque: 'La zona está declarada de criticidad MEDIA.' };
    case 'BAJA':
      return { prioridad: 'BAJA', porque: 'La zona está declarada de criticidad BAJA.' };
    default:
      /* Sin datos, nunca cero. No se supone BAJA sólo porque el campo esté
         vacío: se deja en el medio y se dice que falta declararla. */
      return {
        prioridad: 'MEDIA',
        porque: 'Nadie declaró la criticidad de esta zona. Queda en MEDIA hasta que se declare.',
      };
  }
}

/** «hace 12 minutos», «hace 3 horas», «hace 2 días». Sin decimales raros. */
function hace(desde: Date, ahora: Date): string {
  const min = Math.max(0, Math.round((ahora.getTime() - desde.getTime()) / 60000));
  if (min < 1) return 'hace un momento';
  if (min === 1) return 'hace 1 minuto';
  if (min < 60) return `hace ${min} minutos`;
  const h = Math.round(min / 60);
  if (h === 1) return 'hace 1 hora';
  if (h < 24) return `hace ${h} horas`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

export function reporteDeProduccion(e: EntradaDeReporte): Reporte {
  const viva = e.incidenciasDelActivo.find((i) => ESTADOS_VIVOS.includes(i.estado));

  /* ------------------------------------------------------------------
     REAPARICIÓN. Se mira aunque haya una viva: si la anterior se dio por
     resuelta hace poco y el problema sigue, el técnico tiene que saberlo.
     ------------------------------------------------------------------ */
  let reaparecio = false;
  let reaparecioTrasMin: number | null = null;
  const resueltas = e.incidenciasDelActivo
    .filter((i) => !ESTADOS_VIVOS.includes(i.estado) && i.resueltaEn)
    .sort((a, b) => b.resueltaEn!.getTime() - a.resueltaEn!.getTime());
  if (!viva && resueltas.length) {
    const min = Math.round((e.ahora.getTime() - resueltas[0].resueltaEn!.getTime()) / 60000);
    if (min >= 0 && min <= VENTANA_REAPARICION_MIN) {
      reaparecio = true;
      reaparecioTrasMin = min;
    }
  }

  const zona = (e.zonaEscrita || '').trim() || null;
  const nombre = (e.activoNombre || '').trim() || null;
  const titulo = `Sin visión: ${e.activoCodigo}${zona ? ` — ${zona}` : nombre ? ` — ${nombre}` : ''}`;
  const { prioridad, porque } = prioridadDe(e.criticidadZona);

  // ----------------------------------------------------- no hay nada abierto
  if (!viva) {
    return {
      decision: 'NUEVA',
      incidenciaId: null,
      incidenciaCodigo: null,
      vecesReportada: 1,
      titulo,
      prioridad,
      prioridadPorque: porque,
      reaparecio,
      reaparecioTrasMin,
      sugiereSubirPrioridad: false,
      respuesta: reaparecio
        ? 'Registrado. Esta cámara se había dado por reparada hace poco: se avisa al técnico de que volvió a caer.'
        : 'Registrado. El técnico de turno ya lo tiene en su bandeja.',
    };
  }

  // -------------------------------------------------- ya hay una viva
  const yaAviso = viva.yaAvisaronIds.includes(e.quienReportaId);
  const veces = yaAviso ? viva.yaAvisaronIds.length : viva.yaAvisaronIds.length + 1;

  /* El mismo dedo dos veces no es más gente sin ver. En el púlpito, con el
     celular y mala señal, tocar «enviar» dos veces es lo normal; contarlo
     como dos avisos falsearía el único número nuevo que aporta esto. */
  if (yaAviso) {
    return {
      decision: 'YA_LO_REPORTASTE',
      incidenciaId: viva.id,
      incidenciaCodigo: viva.code,
      vecesReportada: veces,
      titulo,
      prioridad: viva.prioridad,
      prioridadPorque: 'Se mantiene la prioridad de la incidencia que ya está abierta.',
      reaparecio: false,
      reaparecioTrasMin: null,
      sugiereSubirPrioridad: false,
      respuesta: `Ya lo reportaste ${hace(viva.reportadaEn, e.ahora)} (${viva.code}). Sigue abierta.`,
    };
  }

  const sugiere = veces >= AVISOS_PARA_SUGERIR_SUBIDA
    && (viva.prioridad === 'BAJA' || viva.prioridad === 'MEDIA');

  return {
    decision: 'SE_SUMA',
    incidenciaId: viva.id,
    incidenciaCodigo: viva.code,
    vecesReportada: veces,
    titulo,
    prioridad: viva.prioridad,
    prioridadPorque: 'Se mantiene la prioridad de la incidencia que ya está abierta.',
    reaparecio: false,
    reaparecioTrasMin: null,
    sugiereSubirPrioridad: sugiere,
    respuesta: `Ya estaba reportada ${hace(viva.reportadaEn, e.ahora)} (${viva.code}). `
      + `Se sumó tu aviso: van ${veces}.`,
  };
}

/**
 * La firma que ve el técnico en su bandeja. Producción no la escribe: sale de
 * quién inició sesión y del árbol de planta.
 *
 * Que diga QUIÉN y de QUÉ TREN no es adorno. Es lo que convierte «hay una
 * cámara caída» en «el Ing. Cañasas, del Tren 1, no está viendo» — y eso es lo
 * que hace que alguien se mueva.
 */
export function firmaDeQuienReporta(nombre: string, tren: string | null): string {
  return tren ? `Reportó ${nombre} · ${tren}` : `Reportó ${nombre}`;
}
