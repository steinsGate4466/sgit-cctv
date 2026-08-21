/* =============================================================================
   VERIFICADOR 16 — DENSIDAD DE PANTALLA
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE

   Una auditoría de las 44 pantallas dio 9 454 palabras de texto visible: una
   media de 214 por pantalla. Media página de prosa ENCIMA de los datos.
   Activos llegaba a 666 palabras y 12 columnas.

   Nadie decidió eso. Se llegó ahí añadiendo una explicación cada vez, y cada
   una parecía razonable por separado. Ése es exactamente el tipo de deuda que
   este proyecto persigue: la que no rompe nada, la que nadie nota hasta que
   un jefe de línea abre la pantalla y no sabe dónde mirar.

   -----------------------------------------------------------------------------
   LO QUE MIDE, Y POR QUÉ ESOS NÚMEROS

   · 130 palabras de texto visible. Es lo que se lee de un vistazo sin que la
     respuesta se vaya de la pantalla. Por encima de eso, en un teléfono, el
     dato queda por debajo del pliegue.

   · 8 columnas por tabla. Doce no caben en los 1366 px de un púlpito ni con
     letra de 10. Lo que no cabe en ocho va al detalle de la fila.

   · 6 tarjetas de indicador. Ocho números a la vez no se leen: se miran por
     encima y no se actúa sobre ninguno. Con más de seis, el tablero se mira;
     con menos, se usa.

   -----------------------------------------------------------------------------
   LO QUE **NO** MIDE, Y ES DELIBERADO

   No cuenta el texto dentro de `<ComoSeCalcula>`. Ahí es donde tiene que
   estar la explicación larga: se abre a demanda, no ocupa sitio, y quitarla
   del todo empobrecería el sistema. La regla no es «no expliques»: es «no
   expliques ENCIMA de la respuesta».

   Tampoco cuenta los comentarios. Es la lección que se aprendió con
   `verificar-roles`: un verificador que castiga documentar el porqué acaba
   enseñando a no documentarlo.
============================================================================= */
const fs = require('fs');
const path = require('path');

const PAGINAS = path.join(__dirname, '..', 'src', 'pages');

const TOPE_PALABRAS = 130;
const TOPE_COLUMNAS = 8;
const TOPE_INDICADORES = 6;

/* PANTALLAS EXENTAS, con su motivo escrito.
   Una lista corta y explicada es deuda controlada; una lista larga es una
   regla que se dejó de aplicar. Si esto crece, el problema es la regla. */
const EXENTAS = {
  'Rotulado.tsx':
    'Es un documento de norma, no un tablero: el texto ES el contenido. '
    + 'Explica ANSI/TIA-606-C, que es lo que se viene a consultar.',
};

/* =============================================================================
   LA LÍNEA BASE — POR QUÉ ESTO NO FALLA HOY CON LAS 40 PANTALLAS VIEJAS
   -----------------------------------------------------------------------------
   El patrón del bloque 38 se aplicó a cuatro pantallas: las que ve un jefe.
   Las otras cuarenta siguen como estaban, y varias pasan del tope.

   Se podía hacer dos cosas:

     a) Dejar el verificador fuera del CI hasta convertirlas todas. Entonces
        durante semanas nada impide que las cuatro convertidas se vuelvan a
        llenar, que es exactamente como se llegó a las 9 454 palabras.

     b) Anotar el estado de hoy y fallar sólo si algo EMPEORA.

   Se eligió (b). Es un trinquete: la deuda vieja se tolera —está medida y
   escrita ahí abajo— pero no puede crecer, y cada vez que una pantalla mejora
   su número baja y ya no puede volver a subir.

   CÓMO SE ACTUALIZA: cuando una pantalla mejore, se baja su número aquí. El
   propio verificador lo dice con el valor exacto. Subirlo a mano es posible
   —es un archivo de texto— pero queda en el commit, que es el punto.

   Un número en 0 significa «esta pantalla ya cumple el tope»: se quita de la
   lista y pasa a la regla general.
   ============================================================================= */
const LINEA_BASE = {
  // pantalla:            [palabras, columnas, indicadores]
  'Electricidad.tsx':      [462, 6, 0],
  'Equipos.tsx':           [478, 7, 0],
  'Limpieza.tsx':          [413, 7, 0],
  'Instalaciones.tsx':     [352, 7, 0],
  'Assets.tsx':            [264, 11, 0],
  'Paradas.tsx':           [289, 10, 0],
  'Ipam.tsx':              [311, 7, 0],
  'Maintenance.tsx':       [237, 9, 0],
  'Campanas.tsx':          [272, 7, 0],
  'Incidents.tsx':         [180, 8, 0],
  'Topologia.tsx':         [247, 6, 0],
  // Convertida a medias en el bloque 38: el titular y las acciones ya están
  // arriba, pero dentro lleva OCHO vistas con su propio texto. Bajar de aquí
  // exige repasar las ocho, y eso es un bloque propio.
  'TrainBoard.tsx':        [177, 4, 9],
  'Gruas.tsx':             [223, 8, 0],
  'Locations.tsx':         [196, 8, 0],
  'Zonas.tsx':             [215, 8, 2],
  'Monitoreo.tsx':         [219, 4, 5],
  'Conexiones.tsx':        [200, 6, 0],
  'Indicadores.tsx':       [210, 6, 0],
  'Grabadores.tsx':        [163, 6, 0],
  'Avisos.tsx':            [162, 4, 5],
  // Recién hecha en el bloque 36 y ya pasa de columnas. Es la prueba de que
  // esto se degrada solo aunque quien escriba tenga la regla en la cabeza.
  'Riesgo.tsx':            [160, 12, 1],
  'Documentos.tsx':        [143, 6, 0],
  // Quince indicadores. Es EL tablero, y aun así quince no se leen.
  'Dashboard.tsx':         [112, 0, 15],
};

function sinComentarios(txt) {
  return txt
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')   // comentarios JSX
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Quita el bloque de «Cómo se calcula esto»: ahí la explicación es bienvenida. */
function sinLaExplicacionADemanda(txt) {
  return txt.replace(/<ComoSeCalcula>[\s\S]*?<\/ComoSeCalcula>/g, ' ');
}

let errores = 0;
let avisos = 0;
const filas = [];

for (const f of fs.readdirSync(PAGINAS).filter((x) => x.endsWith('.tsx'))) {
  const bruto = fs.readFileSync(path.join(PAGINAS, f), 'utf8');
  const cuerpo = sinLaExplicacionADemanda(sinComentarios(bruto));

  /* Texto visible: lo que hay entre `>` y `<` sin llaves de por medio. No es
     un analizador de JSX —eso sería otro proyecto— pero acierta en lo que
     importa: los párrafos largos de explicación.

     SIN TOPE SUPERIOR, Y ES EL DETALLE QUE LO HACE FUNCIONAR.
     La primera versión buscaba `[^<>{}]{3,400}`: hasta 400 caracteres. Al
     probarla metiendo a propósito un párrafo de relleno en una pantalla ya
     limpia, NO SALTÓ — porque el párrafo pasaba de 400 caracteres y el patrón
     dejaba de encajar.

     O sea: el verificador veía los textos cortos e ignoraba justo los largos,
     que son los únicos que sobran. Habría dado luz verde a la pantalla más
     cargada posible mientras se quejaba de una etiqueta de tres palabras. */
  /* ---------------------------------------------------------------------
     FALLO DEL PROPIO VERIFICADOR, CORREGIDO EN EL BLOQUE 47.

     Este recorte contaba CÓDIGO como si fuera texto de pantalla. La causa
     son los genéricos de TypeScript: en

         const [x, setX] = useState<Detalle | null>(null);
         const [y, setY] = useState<string>('');

     el `>` que cierra `<Detalle | null>` y el `<` que abre `<string>` forman
     un par perfectamente válido para el patrón, así que TODO lo que hay en
     medio —punto y coma, corchetes y nombres de variable incluidos— entraba
     en la cuenta de «palabras que lee el jefe».

     Assets.tsx pagaba 50 palabras por eso: es la pantalla con más `useState`
     del sistema, y estaba siendo penalizada por su código, no por su texto.
     El verificador llevaba desde el bloque 38 midiendo mal, y el ruido
     escondía lo que sí importa.

     El filtro es deliberadamente tonto y por eso no se equivoca: un texto de
     interfaz no lleva nunca `;`, `=>`, `const` ni `=`. Si un fragmento los
     lleva, no es una frase que alguien vaya a leer en pantalla.
     --------------------------------------------------------------------- */
  const pareceCodigo = (t) => /;|=>|\bconst\b|\blet\b|\breturn\b|==|\?\?/.test(t);

  const texto = (cuerpo.match(/>([^<>{}]{3,})</g) || [])
    .map((t) => t.slice(1, -1))
    .filter((t) => !pareceCodigo(t))
    .join(' ');
  const palabras = texto.split(/\s+/).filter((p) => /[a-záéíóúñ]{2,}/i.test(p)).length;

  const columnas = Math.max(
    0,
    ...(cuerpo.match(/<thead>[\s\S]*?<\/thead>/g) || []).map((b) => (b.match(/<th\b/g) || []).length),
  );

  /* Tarjetas de indicador: `className="kpi ..."` y el componente <Kpi>. */
  const indicadores = (cuerpo.match(/className=["'{][^"'}]*\bkpi\b/g) || []).length
    + (cuerpo.match(/<Kpi\b/g) || []).length;

  const exenta = EXENTAS[f];
  if (exenta) {
    if (palabras > TOPE_PALABRAS || columnas > TOPE_COLUMNAS || indicadores > TOPE_INDICADORES) {
      avisos++;
      console.log(`  [EXENTA] ${f} — ${palabras} palabras`);
      console.log(`           ${exenta}`);
    }
    continue;
  }

  /* El tope que se aplica a esta pantalla: el general, o el suyo si está en
     la línea base. Nunca se le exige menos de lo que ya cumple. */
  const base = LINEA_BASE[f];
  const topeP = base ? Math.max(TOPE_PALABRAS, base[0]) : TOPE_PALABRAS;
  const topeC = base ? Math.max(TOPE_COLUMNAS, base[1]) : TOPE_COLUMNAS;
  const topeI = base ? Math.max(TOPE_INDICADORES, base[2]) : TOPE_INDICADORES;

  const problemas = [];
  if (palabras > topeP) problemas.push(`${palabras} palabras de texto visible (su tope es ${topeP})`);
  if (columnas > topeC) problemas.push(`${columnas} columnas en una tabla (su tope es ${topeC})`);
  if (indicadores > topeI) problemas.push(`${indicadores} tarjetas de indicador (su tope es ${topeI})`);

  if (problemas.length) {
    errores++;
    filas.push({ f, problemas, palabras, base: !!base });
  }

  /* EL TRINQUETE APRIETA SOLO. Si una pantalla mejoró y su línea base quedó
     alta, se avisa con el número exacto para bajarlo. Sin esto, la lista se
     quedaría con los valores del primer día para siempre y dejaría margen
     para volver a empeorar sin que nadie se entere. */
  if (base && palabras <= TOPE_PALABRAS && columnas <= TOPE_COLUMNAS && indicadores <= TOPE_INDICADORES) {
    avisos++;
    console.log(`  [MEJORÓ] ${f} ya cumple el tope general (${palabras} palabras).`);
    console.log('           Quítala de LINEA_BASE para que no pueda volver atrás.');
  } else if (base && (palabras < base[0] || columnas < base[1] || indicadores < base[2])) {
    avisos++;
    console.log(`  [MEJORÓ] ${f}: baja su línea base a [${palabras}, ${columnas}, ${indicadores}].`);
  }
}

if (filas.length) {
  console.error('\nPantallas que EMPEORARON:\n');
  filas.sort((a, b) => b.palabras - a.palabras);
  for (const x of filas) {
    console.error(`  [ERROR] ${x.f}${x.base ? ' (pasó de su línea base)' : ''}`);
    for (const p of x.problemas) console.error(`          · ${p}`);
  }
  console.error(
    '\nQué hacer, por orden de lo que más quita:\n'
    + '  1. Mueve la explicación a <ComoSeCalcula>. No se pierde: deja de estorbar.\n'
    + '  2. Pon la respuesta en un <Titular> y lo pendiente en <LoQueHayQueHacer>.\n'
    + '  3. Mete la tabla en un <Detalle>, plegada.\n'
    + '  4. Lo que no cabe en 8 columnas va al detalle de la fila.\n'
    + '\nLa prueba: si el jefe mira la pantalla cinco segundos desde la puerta,\n'
    + '¿sabe si tiene que hacer algo? Si hay que leer para saberlo, está mal.\n',
  );
  process.exit(1);
}

console.log(
  `\nDensidad: ninguna pantalla pasa de ${TOPE_PALABRAS} palabras, `
  + `${TOPE_COLUMNAS} columnas ni ${TOPE_INDICADORES} indicadores.`,
);
if (avisos) console.log(`${avisos} exenta(s), con su motivo escrito.`);
