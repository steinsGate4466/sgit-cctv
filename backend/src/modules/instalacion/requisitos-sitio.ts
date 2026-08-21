/**
 * QUÉ HAY QUE PREGUNTAR EN CADA TIPO DE SITIO
 * =============================================================================
 *
 * Ésta es la pieza central del módulo, y merece explicación.
 *
 * Instalar una cámara en un PÚLPITO y en una GRÚA no se parecen en nada:
 *
 *   PÚLPITO  → ¿hay falso techo por donde pasar el cable? ¿canaleta? ¿está
 *              climatizado? ¿qué pantalla hay ya? ¿quién autoriza entrar en
 *              turno? No hay altura, no hay manlift, no hay LOTO.
 *   GRÚA     → ¿se puede detener la grúa? ¿se llega con manlift o hay que
 *              subir? ¿va por la cadena portacables o por antena? Si es
 *              antena, ¿hay línea de vista y a cuántos metros?
 *
 * Si el formulario fuera el mismo para los dos, tendría cuarenta campos y el
 * técnico rellenaría cuatro. Y peor: los cuatro que importan de la grúa
 * quedarían enterrados entre treinta que no aplican.
 *
 * ASÍ QUE ESTA TABLA ES LA FUENTE DE VERDAD, Y LA USAN LOS DOS LADOS:
 *   · el frontend, para enseñar sólo los campos que aplican;
 *   · el servicio, para exigir los que ese sitio necesita antes de dar la
 *     evaluación por completa.
 *
 * Una sola tabla para las dos cosas. Si estuvieran duplicadas, el día que se
 * añada un campo alguien actualizaría una y no la otra, y el formulario
 * pediría algo que el servidor no valida — o al revés, que es peor: el
 * técnico no puede guardar y no sabe por qué.
 *
 * NADA DE ESTO ES UN DATO DE PLANTA INVENTADO. Son las preguntas que hay que
 * hacer para poder cotizar y ejecutar; los VALORES los pone quien va al sitio.
 */

export interface GrupoCampos {
  titulo: string;
  ayuda?: string;
  campos: string[];
}

export interface PerfilSitio {
  nombre: string;
  /** Una línea que explique de qué va este sitio. Sale en la pantalla. */
  resumen: string;
  /** Grupos de campos que se enseñan, en orden. */
  grupos: GrupoCampos[];
  /** Sin estos, la evaluación NO se puede dar por hecha. */
  obligatoriosAlEvaluar: string[];
  /** Avisos fijos que se enseñan al elegir este sitio. */
  avisos: string[];
}

const ENERGIA_Y_RED: GrupoCampos = {
  titulo: 'Energía y red',
  ayuda: 'Esto se mide en el sitio, no se supone desde la oficina. Es lo que decide si el trabajo son dos horas o dos días.',
  campos: ['hayEnergia', 'tipoEnergia', 'hayPuntoRed', 'gabineteCercano', 'metrosCable', 'rutaCable', 'necesitaPoe', 'switchDestinoId', 'nvrDestinoId', 'canalNvr'],
};

/**
 * MATERIALES SÍ. DINERO NO — bloque 47.
 *
 * Este grupo se llamaba «Materiales y costo» y pedía un importe y una moneda.
 * Se han quitado los dos, y no por simplificar: por una regla del proyecto.
 *
 * El sistema NUNCA pone precio a nada. Cuenta metros, equipos y subidas de
 * manlift; el dinero lo pone quien tiene la tarifa, que no es Mantenimiento.
 * Un «costo estimado» escrito por el técnico que va a hacer el trabajo se
 * convierte, tres reuniones después, en el presupuesto contra el que se le
 * mide — y a partir de ahí nadie vuelve a escribir un número sincero.
 *
 * Además desvía la conversación: en cuanto Producción ve una cifra en soles,
 * la reunión deja de tratar de disponibilidad. La lista de materiales, que es
 * lo que de verdad hace falta para comprar, se queda.
 *
 * Las columnas `costoEstimado` y `moneda` siguen en la base a propósito: si
 * algún día se cargaron datos, borrar la columna los perdería. Simplemente ya
 * no se piden, ni se guardan, ni se enseñan.
 */
const MATERIALES: GrupoCampos = {
  titulo: 'Materiales',
  ayuda: 'Qué hay que comprar o sacar de almacén. Sin precios: el sistema cuenta materiales, no soles.',
  campos: ['materialesEstimados'],
};

export const PERFILES: Record<string, PerfilSitio> = {
  PULPITO: {
    nombre: 'Púlpito',
    resumen: 'Cabina de operación del tren. Hay gente trabajando y no se puede interrumpir el turno sin avisar.',
    grupos: [
      {
        titulo: 'El sitio',
        ayuda: 'El púlpito está ocupado a toda hora: quién autoriza entrar es tan importante como el cable.',
        campos: ['hayFalsoTecho', 'hayCanaleta', 'esClimatizado', 'pantallaExistente', 'puestoOperador', 'quienAutoriza'],
      },
      ENERGIA_Y_RED,
      { titulo: 'Riesgos', campos: ['riesgos', 'necesitaParada'] },
      MATERIALES,
    ],
    obligatoriosAlEvaluar: ['hayEnergia', 'hayPuntoRed', 'metrosCable', 'quienAutoriza'],
    avisos: [
      'El púlpito no se interviene sin avisar al operador del turno: si se le tapa una pantalla en medio de la colada, el trabajo se para solo.',
    ],
  },

  OFICINA: {
    nombre: 'Oficina',
    resumen: 'Ambiente limpio y climatizado. El trabajo suele ser sencillo; lo que falla es el permiso para entrar.',
    grupos: [
      { titulo: 'El sitio', campos: ['hayFalsoTecho', 'hayCanaleta', 'esClimatizado', 'pantallaExistente', 'puestoOperador', 'quienAutoriza'] },
      ENERGIA_Y_RED,
      MATERIALES,
    ],
    obligatoriosAlEvaluar: ['hayEnergia', 'hayPuntoRed', 'metrosCable'],
    avisos: [],
  },

  GRUA: {
    nombre: 'Grúa puente',
    resumen: 'La cámara se mueve con la grúa. El cable se fatiga en la cadena portacables y la antena se desalinea con la vibración.',
    grupos: [
      {
        titulo: 'La grúa',
        ayuda: 'Sin detener la grúa no se sube. Y el trabajo depende de si el enlace va por cable o por radio: son dos instalaciones distintas.',
        campos: ['gruaNombre', 'gruaSeDetiene', 'porCadenaPortacables', 'porAntena', 'antenaModelo', 'distanciaEnlaceM', 'hayLineaVista'],
      },
      {
        titulo: 'Acceso y altura',
        ayuda: 'Si hace falta manlift, hay que reservarlo con antelación: es lo que más retrasa este tipo de trabajo.',
        campos: ['alturaMetros', 'necesitaManlift', 'necesitaAndamio', 'necesitaPermisoAltura', 'necesitaLoto', 'necesitaParada', 'quienAutoriza', 'riesgos'],
      },
      ENERGIA_Y_RED,
      MATERIALES,
    ],
    obligatoriosAlEvaluar: ['alturaMetros', 'necesitaManlift', 'gruaSeDetiene', 'hayEnergia'],
    avisos: [
      'Trabajo en altura: exige permiso SSOMA y bloqueo de la grúa (LOTO). No se sube con la grúa energizada.',
      'Si el enlace va por ANTENA hay que comprobar la línea de vista: una antena sin visión directa funciona en la prueba y se cae con la nave llena.',
      'Si va por la CADENA PORTACABLES, el cable se fatiga. Es la causa número uno de fallo intermitente en cámaras de grúa.',
    ],
  },

  SALA_ELECTRICA: {
    nombre: 'Sala eléctrica / MCC',
    resumen: 'Tableros energizados. El riesgo aquí no es la altura: es el arco eléctrico.',
    grupos: [
      {
        titulo: 'Seguridad eléctrica',
        ayuda: 'Nada se toca sin permiso eléctrico y bloqueo. Aquí el que improvisa no vuelve a casa.',
        campos: ['necesitaLoto', 'necesitaPermisoCaliente', 'necesitaParada', 'quienAutoriza', 'riesgos'],
      },
      ENERGIA_Y_RED,
      { titulo: 'Ambiente', ayuda: 'La interferencia electromagnética de un MCC degrada el cobre sin blindaje.', campos: ['ambiente', 'necesitaGabineteEstanco'] },
      MATERIALES,
    ],
    obligatoriosAlEvaluar: ['necesitaLoto', 'quienAutoriza', 'hayEnergia'],
    avisos: [
      'Interferencia electromagnética alta: el cable UTP sin blindaje da errores que parecen fallo de cámara. Si el tramo pasa junto a fuerza, va apantallado o va por fibra.',
    ],
  },

  PATIO: {
    nombre: 'Patio / intemperie',
    resumen: 'Sol, lluvia y sal. Lo que se instala aquí se degrada aunque nadie lo toque.',
    grupos: [
      { titulo: 'Intemperie', ayuda: 'Un gabinete que no cierra bien es una avería con fecha, no un riesgo.', campos: ['ambiente', 'necesitaGabineteEstanco', 'gradoIpRequerido', 'alturaMetros', 'necesitaManlift'] },
      ENERGIA_Y_RED,
      { titulo: 'Riesgos', campos: ['riesgos', 'quienAutoriza'] },
      MATERIALES,
    ],
    obligatoriosAlEvaluar: ['necesitaGabineteEstanco', 'hayEnergia', 'metrosCable'],
    avisos: [
      'Pisco es zona salina: la intemperie se come los conectores. El grado IP y el prensaestopa no son opcionales.',
    ],
  },

  NAVE: {
    nombre: 'Nave de laminación',
    resumen: 'Calor radiante, vapor, cascarilla y vibración. El sitio más duro de la planta.',
    grupos: [
      { titulo: 'Ambiente y acceso', campos: ['ambiente', 'alturaMetros', 'necesitaManlift', 'necesitaAndamio', 'necesitaPermisoAltura', 'necesitaParada', 'necesitaGabineteEstanco', 'gradoIpRequerido'] },
      ENERGIA_Y_RED,
      { titulo: 'Riesgos', campos: ['riesgos', 'quienAutoriza'] },
      MATERIALES,
    ],
    obligatoriosAlEvaluar: ['ambiente', 'alturaMetros', 'hayEnergia', 'metrosCable'],
    avisos: [
      'Con el tren en marcha no se trabaja a pie de línea. Comprueba si hace falta colgar esto de una ventana de parada.',
    ],
  },
};

/** Perfil por defecto para los sitios que no tienen uno propio. */
export const PERFIL_GENERICO: PerfilSitio = {
  nombre: 'Otro sitio',
  resumen: 'Sitio sin perfil propio. Se piden las condiciones básicas.',
  grupos: [
    { titulo: 'Acceso', campos: ['alturaMetros', 'necesitaManlift', 'necesitaParada', 'quienAutoriza', 'riesgos'] },
    ENERGIA_Y_RED,
    { titulo: 'Ambiente', campos: ['ambiente', 'necesitaGabineteEstanco', 'gradoIpRequerido'] },
    MATERIALES,
  ],
  obligatoriosAlEvaluar: ['hayEnergia', 'metrosCable'],
  avisos: [],
};

export function perfilDe(tipoSitio: string): PerfilSitio {
  return PERFILES[tipoSitio] ?? PERFIL_GENERICO;
}

/** Etiquetas legibles. Viven aquí para que la pantalla no las duplique. */
export const ETIQUETAS: Record<string, string> = {
  hayEnergia: '¿Hay corriente en el punto?',
  tipoEnergia: '¿De qué tipo? (220V, PoE, 24VDC, tablero…)',
  hayPuntoRed: '¿Llega un punto de red?',
  gabineteCercano: 'Gabinete más cercano',
  metrosCable: 'Metros de cable estimados',
  rutaCable: 'Por dónde iría el cable',
  necesitaPoe: '¿Se alimenta por PoE?',
  switchDestinoId: 'Switch al que se conecta',
  nvrDestinoId: 'Grabador (NVR) de destino',
  canalNvr: 'Canal del grabador',
  alturaMetros: 'Altura del punto (m)',
  necesitaManlift: '¿Hace falta manlift?',
  necesitaAndamio: '¿Hace falta andamio?',
  necesitaParada: '¿Hay que parar el tren?',
  necesitaLoto: '¿Hace falta bloqueo LOTO?',
  necesitaPermisoAltura: '¿Permiso de trabajo en altura?',
  necesitaPermisoCaliente: '¿Permiso de trabajo en caliente?',
  riesgos: 'Riesgos del sitio',
  quienAutoriza: '¿Quién autoriza entrar?',
  gruaNombre: '¿Qué grúa?',
  gruaSeDetiene: '¿Se puede detener la grúa?',
  porCadenaPortacables: '¿El cable va por la cadena portacables?',
  porAntena: '¿El enlace va por antena?',
  antenaModelo: 'Modelo de antena',
  distanciaEnlaceM: 'Distancia del enlace (m)',
  hayLineaVista: '¿Hay línea de vista directa?',
  hayFalsoTecho: '¿Hay falso techo?',
  hayCanaleta: '¿Hay canaleta disponible?',
  esClimatizado: '¿Está climatizado?',
  pantallaExistente: '¿Qué pantalla hay ya?',
  puestoOperador: 'Puesto del operador',
  ambiente: 'Ambiente de operación',
  necesitaGabineteEstanco: '¿Necesita gabinete estanco?',
  gradoIpRequerido: 'Grado IP requerido',
  materialesEstimados: 'Materiales estimados (uno por línea)',
};
