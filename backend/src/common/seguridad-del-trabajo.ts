/* =============================================================================
   LA SEGURIDAD DEL TRABAJO SALE DE LO DECLARADO, NO DEL CRITERIO DE CADA UNO
   — bloque 168
   -----------------------------------------------------------------------------
   Revisión de Cristhian: «hay formularios, como los de seguridad, que no se
   autocompletan o dejan a criterio técnico realizarlos. Eso no debe ser así».

   Tenía razón. El sistema YA SABÍA casi todo lo que hace falta para preparar
   un trabajo seguro —a qué altura está el equipo y cómo se llega (bloque 41),
   cómo se interviene la zona y quién lo firmó (bloque 28), si en el sitio
   puede herirse alguien (bloque 76), el ambiente de la etapa, el tablero que
   lo alimenta y si pide permiso— y luego le pedía al técnico que escribiera
   a mano «riesgos», «EPP», «impacto en producción», y que decidiera él si
   llevaba acompañante. Cada técnico lo escribía distinto, y el que tenía
   prisa no lo escribía.

   AQUÍ SE DECIDE UNA SOLA VEZ, CON REGLAS QUE SE PUEDEN LEER:

     · EN ALTURA si el punto está a 1,80 m o más (estándar SSOMA), si se
       llega en manlift / andamio / grúa / línea de vida, si la zona firmó
       «con permiso de altura», o —cuando el equipo no lo tiene declarado—
       si la zona dice que exige subir. Lo no declarado se dice: no se supone.
     · BLOQUEO ELÉCTRICO si la zona firmó «con permiso eléctrico», si el
       tablero del que cuelga (o que lo alimenta) pide permiso, o si el
       equipo ES un tablero o una UPS.
     · PARADA si la zona exige parada o NO está firmada (sin firma, parada:
       regla del bloque 28 — la propuesta sugiere, sólo la firma autoriza).
     · DOS PERSONAS si hay altura o bloqueo eléctrico.

   De ahí salen los REQUISITOS (lo que hay que marcar antes de empezar), el
   EPP y los RIESGOS. Lo que la persona declaró de su zona (el motivo del
   riesgo para personas, los riesgos del tablero) se copia tal cual: es
   información de planta y no se reescribe.

   EL EPP Y LOS RIESGOS GENÉRICOS son conocimiento estándar de seguridad
   industrial (trabajo en altura, riesgo eléctrico, calor), no datos
   inventados de la planta. SSOMA puede ampliarlos; el técnico no puede
   QUITAR lo obligatorio.

   Puro (sin base de datos): `test/seguridad-del-trabajo.spec.ts`.
============================================================================= */

export type Medio = 'A_PIE' | 'ESCALERA' | 'ANDAMIO' | 'MANLIFT' | 'GRUA' | 'LINEA_VIDA' | 'OTRO';
export type Nivel = 'EN_MARCHA' | 'CON_PERMISO_ELECTRICO' | 'CON_PERMISO_ALTURA' | 'EXIGE_PARADA' | 'SIN_CLASIFICAR';

/** Desde aquí es trabajo en altura (estándar SSOMA en Perú). */
export const ALTURA_SSOMA_M = 1.8;
const MEDIOS_DE_ALTURA: Medio[] = ['MANLIFT', 'ANDAMIO', 'GRUA', 'LINEA_VIDA'];

export interface DatosDeSeguridad {
  tipoEquipo?: string | null;
  alturaM?: number | null;
  medioAcceso?: Medio | null;
  accesoNota?: string | null;
  /** Alguna ubicación de la rama dice que para llegar hay que subir. */
  zonaRequiereAltura?: boolean;
  /** Cómo llegar a la zona (`Location.howToGet`, la más cercana que lo tenga). */
  comoLlegarZona?: string | null;
  /** Lo que se APLICA (firmado, o EXIGE_PARADA si nadie firmó). */
  intervencionAplica?: Nivel | null;
  intervencionFirmada?: boolean;
  intervencionMotivo?: string | null;
  ambiente?: string | null;
  impactoSiSeCae?: string | null;
  /** Equipo o, si no lo dice, su zona. null = nadie lo declaró. */
  riesgoPersonas?: boolean | null;
  riesgoPersonasMotivo?: string | null;
  tablero?: { codigo: string; requierePermiso: boolean; riesgos?: string | null } | null;
  /** Bloque 176 · áreas de riesgo DIBUJADAS en el mapa que contienen al equipo. */
  zonasDeRiesgo?: ZonaDeRiesgoDelMapa[];
}

export interface ZonaDeRiesgoDelMapa {
  nivel: 'ALTO_RIESGO' | 'ALTURA' | 'ELECTRICO' | 'CALOR' | 'VITAL';
  nombre: string;
  motivo: string;
}

export interface Requisito {
  clave: string;
  texto: string;
  /** Por qué se pide, en una frase: lo que se le explica al técnico. */
  porque: string;
}

export interface PerfilDeSeguridad {
  enAltura: boolean;
  bloqueoElectrico: boolean;
  parada: boolean;
  personasMinimas: number;
  /** El medio declarado o, si falta, el que propone la zona (con su origen). */
  medio: Medio | null;
  medioOrigen: 'equipo' | 'zona' | null;
  alturaM: number | null;
  comoLlegar: string | null;
  /** Lo que hay que marcar, sin excepción, antes de empezar. */
  requisitos: Requisito[];
  epp: string[];
  riesgos: string[];
  /** Qué significa para Producción, en una frase. */
  impactoProduccion: string;
  /** Lo que nadie ha declarado y por eso el perfil puede quedarse corto. */
  faltaDeclarar: string[];
  /** De paso, para los formularios que lo piden (visita de instalación). */
  ambiente: string | null;
  intervencion: Nivel;
}

const EPP_BASICO = ['Casco con barbiquejo', 'Lentes de seguridad', 'Zapatos de seguridad', 'Guantes de trabajo', 'Ropa de trabajo con reflectivos'];
const EPP_ALTURA = ['Arnés de cuerpo entero', 'Línea de vida doble con absorbedor de impacto', 'Punto de anclaje verificado'];
const EPP_ELECTRICO = ['Guantes dieléctricos', 'Herramienta aislada', 'Candado y tarjeta de bloqueo personal'];
const EPP_AMBIENTE: Record<string, string[]> = {
  CALOR_RADIANTE: ['Ropa ignífuga / aluminizada', 'Careta de protección térmica'],
  VAPOR_AGUA: ['Botas antideslizantes', 'Ropa impermeable'],
  POLVO_METALICO: ['Respirador con filtro para partículas', 'Lentes herméticos'],
  EMI_ALTA: ['Ropa ignífuga (arco eléctrico)'],
  INTEMPERIE_SALINA: ['Protector solar y cortavientos'],
};
const RIESGO_AMBIENTE: Record<string, string> = {
  CALOR_RADIANTE: 'Quemadura por radiación o contacto con material caliente',
  VAPOR_AGUA: 'Superficies resbaladizas y vapor caliente',
  POLVO_METALICO: 'Proyección de partículas (cascarilla, polvo metálico)',
  EMI_ALTA: 'Arco eléctrico en tableros energizados cercanos',
  INTEMPERIE_SALINA: 'Exposición a viento y sol; estructuras corroídas',
};

const sinRepetir = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => (x || '').trim()).filter(Boolean))];

export function perfilDeSeguridad(d: DatosDeSeguridad): PerfilDeSeguridad {
  const nivel: Nivel = d.intervencionAplica || 'SIN_CLASIFICAR';
  const alturaM = d.alturaM ?? null;
  const declaroAcceso = alturaM != null || d.medioAcceso != null;

  const medio: Medio | null = d.medioAcceso ?? (d.zonaRequiereAltura ? 'MANLIFT' : null);
  const medioOrigen = d.medioAcceso ? 'equipo' : medio ? 'zona' : null;

  /* Bloque 176 · lo que dice el MAPA: un área dibujada por el Jefe de
     Mantenimiento con su motivo. Sólo SUMA exigencias, nunca las quita. */
  const delMapa = d.zonasDeRiesgo ?? [];
  const mapa = (n: ZonaDeRiesgoDelMapa['nivel']) => delMapa.find((z) => z.nivel === n) ?? null;
  const altoRiesgo = mapa('ALTO_RIESGO');

  const enAltura = !!mapa('ALTURA') || (alturaM != null && alturaM >= ALTURA_SSOMA_M)
    || (!!d.medioAcceso && MEDIOS_DE_ALTURA.includes(d.medioAcceso))
    || nivel === 'CON_PERMISO_ALTURA'
    || (!declaroAcceso && !!d.zonaRequiereAltura);
  const bloqueoElectrico = !!mapa('ELECTRICO') || nivel === 'CON_PERMISO_ELECTRICO'
    || !!d.tablero?.requierePermiso
    || d.tipoEquipo === 'TABLERO_ELECTRICO' || d.tipoEquipo === 'UPS';
  const parada = nivel === 'EXIGE_PARADA' || nivel === 'SIN_CLASIFICAR';
  const personasMinimas = enAltura || bloqueoElectrico || altoRiesgo ? 2 : 1;

  const requisitos: Requisito[] = [
    { clave: 'ATS', texto: 'ATS del día firmado por la cuadrilla', porque: 'Todo trabajo en planta empieza con su Análisis de Trabajo Seguro.' },
    { clave: 'EPP_BASICO', texto: `EPP básico completo: ${EPP_BASICO.join(', ').toLowerCase()}`, porque: 'Obligatorio para entrar a cualquier zona de planta.' },
  ];
  if (enAltura) {
    requisitos.push({
      clave: 'PETAR_ALTURA', texto: 'PETAR de trabajo en altura aprobado',
      porque: mapa('ALTURA') ? `Está dentro de «${mapa('ALTURA')!.nombre}», marcada en el mapa como trabajo en altura.`
        : alturaM != null && alturaM >= ALTURA_SSOMA_M
        ? `El equipo está a ${alturaM} m (desde ${ALTURA_SSOMA_M} m es trabajo en altura).`
        : medio && MEDIOS_DE_ALTURA.includes(medio) ? `Se llega en ${medio.toLowerCase().replace('_', ' ')}.` : 'La zona exige subir para llegar al equipo.',
    });
    requisitos.push({ clave: 'EPP_ALTURA', texto: `EPP de altura: ${EPP_ALTURA.join(', ').toLowerCase()}`, porque: 'Trabajo en altura.' });
  }
  if (medio === 'MANLIFT') {
    requisitos.push({ clave: 'MANLIFT', texto: 'Manlift inspeccionado (checklist del día) y operador acreditado', porque: 'Se llega en manlift.' });
  }
  if (medio === 'GRUA') {
    requisitos.push({ clave: 'GRUA', texto: 'Grúa detenida, bloqueada y coordinada con su operador', porque: 'El equipo está en una grúa: se sube con ella parada.' });
  }
  if (bloqueoElectrico) {
    requisitos.push({
      clave: 'BLOQUEO_LOTO', texto: 'Bloqueo y etiquetado (LOTO) con verificación de energía cero',
      porque: mapa('ELECTRICO') ? `Está dentro de «${mapa('ELECTRICO')!.nombre}», marcada en el mapa con riesgo eléctrico.`
        : d.tablero?.requierePermiso ? `Lo alimenta o lo contiene ${d.tablero.codigo}, que pide permiso.`
        : nivel === 'CON_PERMISO_ELECTRICO' ? 'La zona se interviene con permiso eléctrico.' : 'El equipo está energizado (tablero o UPS).',
    });
    requisitos.push({ clave: 'EPP_ELECTRICO', texto: `EPP eléctrico: ${EPP_ELECTRICO.join(', ').toLowerCase()}`, porque: 'Riesgo eléctrico.' });
  }
  if (parada) {
    requisitos.push({
      clave: 'PARADA', texto: 'Tren detenido y confirmado por radio con Producción',
      porque: nivel === 'SIN_CLASIFICAR' || !d.intervencionFirmada
        ? 'Nadie ha firmado cómo se interviene esta zona: sin firma se trabaja con parada.'
        : 'La zona exige parada para intervenir.',
    });
  }
  if (altoRiesgo) {
    requisitos.push({
      clave: 'ZONA_ALTO_RIESGO', texto: `Ingreso a «${altoRiesgo.nombre}» coordinado con el supervisor de la zona`,
      porque: `Marcada en el mapa como zona de alto riesgo: ${altoRiesgo.motivo}`,
    });
  }
  if (personasMinimas >= 2) {
    requisitos.push({ clave: 'ACOMPANANTE', texto: 'Segunda persona en campo (acompañante)', porque: 'En altura, con bloqueo eléctrico o en zona de alto riesgo nunca se trabaja solo.' });
  }
  const calor = mapa('CALOR');
  if (calor && d.ambiente !== 'CALOR_RADIANTE') {
    requisitos.push({ clave: 'EPP_CALOR', texto: `EPP de calor: ${EPP_AMBIENTE.CALOR_RADIANTE.join(', ').toLowerCase()}`, porque: `Dentro de «${calor.nombre}»: ${calor.motivo}` });
  }
  if (d.ambiente && EPP_AMBIENTE[d.ambiente]) {
    requisitos.push({ clave: 'EPP_AMBIENTE', texto: `EPP del ambiente: ${EPP_AMBIENTE[d.ambiente].join(', ').toLowerCase()}`, porque: `Ambiente de la etapa: ${d.ambiente.toLowerCase().replace(/_/g, ' ')}.` });
  }

  const epp = sinRepetir([
    ...EPP_BASICO,
    ...(enAltura ? EPP_ALTURA : []),
    ...(bloqueoElectrico ? EPP_ELECTRICO : []),
    ...(d.ambiente ? EPP_AMBIENTE[d.ambiente] ?? [] : []),
    ...(calor ? EPP_AMBIENTE.CALOR_RADIANTE : []),
  ]);

  const riesgos = sinRepetir([
    // Lo que escribió quien dibujó el área, tal cual: es información de planta.
    ...delMapa.filter((z) => z.nivel !== 'VITAL').map((z) => `${z.nombre}: ${z.motivo}`),
    d.riesgoPersonas ? d.riesgoPersonasMotivo || 'Zona declarada con riesgo para personas' : null,
    d.tablero?.riesgos,
    enAltura ? 'Caída a distinto nivel' : null,
    enAltura ? 'Caída de herramientas u objetos' : null,
    bloqueoElectrico ? 'Contacto eléctrico directo o indirecto' : null,
    nivel === 'EXIGE_PARADA' ? 'Atrapamiento con rodillos o partes móviles si el tren no está detenido' : null,
    medio === 'GRUA' ? 'Movimiento inesperado de la grúa' : null,
    d.ambiente ? RIESGO_AMBIENTE[d.ambiente] : null,
  ]);

  const vital = mapa('VITAL');
  const impactoBase = parada
    ? `Requiere parar el tren o esperar una ventana de parada.${d.impactoSiSeCae ? ` Si este punto queda sin vista: ${d.impactoSiSeCae}` : ''}`
    : nivel === 'EN_MARCHA' ? 'Se trabaja con el tren en marcha; coordinar el ingreso con el púlpito.'
    : nivel === 'CON_PERMISO_ELECTRICO' ? 'Sin parada de tren, con permiso y bloqueo eléctrico.'
    : 'Sin parada de tren, con permiso de altura.';
  const impactoProduccion = vital
    ? `${impactoBase} Zona vital de Producción («${vital.nombre}»): avisar al púlpito antes de entrar.`
    : impactoBase;

  const faltaDeclarar: string[] = [];
  if (!declaroAcceso) faltaDeclarar.push('Cómo se llega al equipo (altura y medio de acceso)');
  if (!d.intervencionFirmada) faltaDeclarar.push('Cómo se interviene la zona (firma de Mantenimiento y Tercería)');
  if (d.riesgoPersonas == null) faltaDeclarar.push('Si en la zona puede resultar herida una persona');

  return {
    enAltura, bloqueoElectrico, parada, personasMinimas,
    medio, medioOrigen, alturaM,
    comoLlegar: d.accesoNota || d.comoLlegarZona || null,
    requisitos, epp, riesgos, impactoProduccion, faltaDeclarar,
    ambiente: d.ambiente ?? null, intervencion: nivel,
  };
}

/** Las claves que faltan por marcar. Lo usa el servidor al abrir la orden. */
export function requisitosSinMarcar(perfil: PerfilDeSeguridad, marcados: string[] | null | undefined): Requisito[] {
  const hechos = new Set(marcados || []);
  return perfil.requisitos.filter((r) => !hechos.has(r.clave));
}
