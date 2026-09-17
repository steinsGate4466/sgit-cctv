#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR 19 (backend) · LAS TABLAS QUE CRECEN CON EL USO LLEVAN TECHO
   -----------------------------------------------------------------------------
   DE DÓNDE SALE (bloque 101). Se midieron las consultas de lista del backend:
   **231 `findMany`, 183 sin `take`**. Y el primer informe dijo «hay que ponerle
   tope a las 183».

   **Ese informe estaba mal, y el error es lo interesante:** poner `take` a las
   183 habría sido el PEOR arreglo posible, porque hay tres familias distintas y
   se tratan al revés.

   -----------------------------------------------------------------------------
   1 · TABLAS QUE NO CRECEN CON EL USO — este verificador NO las mira

   Roles (11), permisos (~60), etapas, catálogos, ubicaciones, gabinetes,
   subredes, hojas de ruta (una por tipo de equipo), colores de cable, modelos.
   Crecen con el tamaño de la PLANTA, no con los años. Un tope ahí no gana nada
   y sí puede esconder una fila — que es peor.

   2 · CÁLCULOS — un `take` aquí hace que el NÚMERO MIENTA

   El estado derivado de un activo, el MTTR, el cumplimiento del preventivo, el
   backlog, la cobertura por zona, los candidatos a purga.

   Un cumplimiento calculado sobre «las primeras mil órdenes» no es un
   cumplimiento: es una cifra inventada con pinta de medida, **y va a un
   comité**. Estas consultas se acotan por FECHA —que es lo que ya hacen— nunca
   por cantidad. Van EXENTAS a propósito y para siempre.

   3 · LISTAS Y ARCHIVOS QUE LEE UNA PERSONA — aquí sí hay techo

   Y aquí estaba el caso que dolía: `hojaOrdenes` y `hojaIncidencias` de la
   exportación **no tenían `where` NI `take`**. Se traían todas las filas que
   existen para armar un Excel en memoria.

   -----------------------------------------------------------------------------
   Y LA REGLA QUE MANDA SOBRE TODO LO DEMÁS

   > **Un recorte que no se dice es una mentira.** Un Excel con las últimas
   > veinte mil órdenes entregado como «todas las órdenes» es PEOR que un Excel
   > lento: quien lo abre cuenta filas, saca un total y lo lleva a una reunión.

   Por eso el tope nunca va solo: va con el `count`, y con una frase dentro del
   propio archivo diciendo qué falta.

   -----------------------------------------------------------------------------
   QUÉ COMPRUEBA ESTE VERIFICADOR

     1. Todo `findMany` sobre una tabla de la lista `CRECEN` tiene `take`, o
        está declarado en `EXENTOS` con su categoría y su motivo.
     2. **El número de consultas de cada exención CUADRA.** Si alguien añade un
        `findMany` sin tope en un archivo ya exento, la cuenta no da y falla —
        sin esto, una exención sería una barra libre para ese archivo.
     3. **La categoría DEUDA sólo puede ENCOGER.** Si la lista declara más
        deuda de la que existe, también falla: sin esa mitad, la deuda se
        «arregla» en el papel y nadie se entera. Es exactamente el diseño de
        `verificar:dto` del bloque 85.
     4. El tope de la exportación sigue puesto, y sigue acompañado de su
        `count` y de su aviso. Un tope sin aviso es el recorte silencioso que
        este bloque viene a cerrar.

   Probado reintroduciendo el fallo: quitando el `take` de la exportación,
   quitando su `count`, añadiendo un `findMany` sin tope en un archivo exento y
   dejando en la lista una deuda que ya no existe.
============================================================================= */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const SRC = path.join(RAIZ, 'src');

const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const verde = (t) => `\x1b[32m${t}\x1b[0m`;

const hallazgos = [];
const apunta = (t) => hallazgos.push(t);

/* -----------------------------------------------------------------------------
   LAS TABLAS QUE CRECEN CON EL USO.

   El criterio para entrar aquí es UNO: ¿esta tabla es más grande dentro de tres
   años aunque la planta sea exactamente igual de grande? Si la respuesta es sí,
   entra. Las órdenes, las incidencias, los avances, la auditoría y los
   movimientos de almacén crecen aunque no se instale ni una cámara más.
----------------------------------------------------------------------------- */
const CRECEN = new Set([
  'workOrder', 'incident', 'workOrderProgress', 'assetObservation', 'assetPhoto',
  'failureEvent', 'accessRequest', 'mejoraProcedimiento', 'notaDeCampo',
  'workOrderEvidence', 'incidentEvidence', 'campanaMapeo', 'auditLog',
  'workOrderMaterial', 'workOrderChecklist', 'workOrderTool', 'workOrderSwap',
  'stockMovement', 'assetHistory', 'sesion', 'intentoAcceso',
  'notificacionSaliente', 'medicionElectrica', 'inspeccionGrua', 'instalacion',
]);

/* -----------------------------------------------------------------------------
   LAS EXENCIONES. Cada una con su CATEGORÍA, su MOTIVO y CUÁNTAS son.

   CALCULO  · Un `take` haría que el número mienta. Permanente.
   HIJO     · Acotado por el registro padre (las fotos de UN activo, los
              materiales de UNA orden). No crece sin freno. Permanente.
   DEUDA    · Alimenta una pantalla sin techo y sin paginador. Esto SÍ hay que
              cerrarlo, y para cerrarlo bien hace falta que la pantalla DIGA
              que va recortada — o sea, cambiar la forma de la respuesta.
              **Esta lista sólo puede encoger.**
----------------------------------------------------------------------------- */
const EXENTOS = {
  /* ---- HIJO: acotadas por su padre --------------------------------------- */
  'modules/preventive/preventive.service.ts::workOrder': { n: 1, cat: 'HIJO',
    motivo: 'Bloque 105. Pregunta "¿cuáles de ESTOS activos ya tienen preventiva abierta?" con un `in` de los ids vencidos: está acotada por ese conjunto, no por la tabla. Sustituye a la consulta que antes se hacía UNA POR ACTIVO dentro del bucle. Un `take` aquí haría que algunos activos recibieran una segunda orden preventiva duplicada — que es justo lo que esta consulta existe para evitar.' },

  /* ---- CÁLCULOS ---------------------------------------------------------- */
  'common/asset-status.ts::workOrder': { n: 2, cat: 'CALCULO',
    motivo: 'El estado efectivo de un activo se DERIVA de sus órdenes abiertas. Con un tope, un equipo con trabajo en curso saldría OPERATIVO.' },
  'common/asset-status.ts::incident': { n: 2, cat: 'CALCULO',
    motivo: 'Igual que el anterior, por el lado de las incidencias.' },
  'modules/dashboard/activos-por-tren.service.ts::workOrder': { n: 1, cat: 'CALCULO',
    motivo: 'Cuenta el estado de la planta por tren. Recortado diría que hay menos trabajo del que hay.' },
  'modules/dashboard/activos-por-tren.service.ts::incident': { n: 1, cat: 'CALCULO',
    motivo: 'Idem.' },
  'modules/dashboard/camaras-caidas.service.ts::incident': { n: 1, cat: 'CALCULO',
    motivo: 'Qué cámaras están caídas AHORA. Un tope escondería cámaras caídas, que es el peor resultado posible de esta pantalla.' },
  'modules/dashboard/camaras-caidas.service.ts::assetObservation': { n: 1, cat: 'CALCULO',
    motivo: 'Lo que reporta el agente de monitoreo por equipo.' },
  'modules/dashboard/camaras-caidas.service.ts::assetPhoto': { n: 1, cat: 'CALCULO',
    motivo: 'La última foto de cada equipo caído.' },
  'modules/dashboard/dashboard.service.ts::incident': { n: 1, cat: 'CALCULO',
    motivo: 'El reparto de causas raíz. Con un tope los porcentajes dejan de sumar sobre el total real.' },
  'modules/dashboard/infra.service.ts::workOrder': { n: 1, cat: 'CALCULO',
    motivo: 'Agregados de infraestructura por tren.' },
  'modules/dashboard/infra.service.ts::incident': { n: 1, cat: 'CALCULO',
    motivo: 'Idem.' },
  'modules/dashboard/infra.service.ts::accessRequest': { n: 2, cat: 'CALCULO',
    motivo: 'Cuántos permisos de acceso hay abiertos por tren.' },
  'modules/indicadores/indicadores.service.ts::workOrder': { n: 3, cat: 'CALCULO',
    motivo: 'MTTR, cumplimiento del preventivo y tendencia. ESTOS NÚMEROS VAN A UN COMITÉ: recortarlos es inventar la cifra. Se acotan por FECHA, que es lo correcto.' },
  'modules/indicadores/indicadores.service.ts::failureEvent': { n: 1, cat: 'CALCULO',
    motivo: 'MTBF. Acotado por fecha, nunca por cantidad.' },
  'modules/predictive/predictive.service.ts::workOrder': { n: 1, cat: 'CALCULO',
    motivo: 'Riesgo por equipo: cuenta el historial completo de intervenciones.' },
  'modules/troubleshooting/troubleshooting.service.ts::incident': { n: 1, cat: 'CALCULO',
    motivo: 'Métricas de diagnóstico. Un tope cambiaría el veredicto LOCAL/COMPARTIDO.' },
  'modules/zonas/cobertura.service.ts::incident': { n: 1, cat: 'CALCULO',
    motivo: 'Cobertura por zona. Recortada diría que hay zonas sin problemas.' },
  'modules/purga/purga.service.ts::workOrder': { n: 1, cat: 'CALCULO',
    motivo: 'Candidatos a purga. Una lista recortada haría creer que ya no queda basura de pruebas.' },

  /* ---- ACOTADOS POR SU PADRE -------------------------------------------- */
  'modules/assets/assets.service.ts::assetPhoto': { n: 1, cat: 'HIJO',
    motivo: 'Las fotos de UN activo.' },
  'modules/cabinets/cabinets.service.ts::workOrder': { n: 1, cat: 'HIJO',
    motivo: 'Las órdenes abiertas de UN gabinete, para su ficha rápida.' },
  'modules/checklist/checklist.service.ts::workOrderChecklist': { n: 1, cat: 'HIJO',
    motivo: 'Los puntos de control de UNA orden.' },
  'modules/incidents/incidents.service.ts::incidentEvidence': { n: 1, cat: 'HIJO',
    motivo: 'Las evidencias de UNA incidencia.' },
  'modules/maintenance/maintenance.service.ts::workOrderProgress': { n: 1, cat: 'HIJO',
    motivo: 'Los avances de UNA orden.' },
  'modules/maintenance/maintenance.service.ts::workOrderEvidence': { n: 1, cat: 'HIJO',
    motivo: 'Las evidencias de UNA orden.' },
  'modules/maintenance/preparacion.service.ts::workOrderMaterial': { n: 3, cat: 'HIJO',
    motivo: 'Los materiales de UNA orden.' },
  'modules/maintenance/preparacion.service.ts::workOrderTool': { n: 1, cat: 'HIJO',
    motivo: 'Las herramientas de UNA orden.' },
  'modules/maintenance/preparacion.service.ts::workOrderSwap': { n: 1, cat: 'HIJO',
    motivo: 'Los reemplazos de UNA orden.' },
  'modules/monitoreo/monitoreo.service.ts::assetObservation': { n: 3, cat: 'HIJO',
    motivo: 'Lo observado de UN activo, y el resumen del último sondeo.' },
  'modules/procedimientos/procedimientos.service.ts::workOrder': { n: 1, cat: 'HIJO',
    motivo: 'El contexto de campo de UN activo.' },
  'modules/procedimientos/procedimientos.service.ts::notaDeCampo': { n: 1, cat: 'HIJO',
    motivo: 'Las notas de campo de UN activo (la entrega de turno).' },

  /* ---- DEUDA DECLARADA · SÓLO PUEDE ENCOGER ----------------------------- */
  'modules/access/access.service.ts::accessRequest': { n: 2, cat: 'DEUDA',
    motivo: 'DEUDA · `findAll` alimenta la pantalla de permisos de acceso, que NO tiene paginador ni total: devuelve un array plano y la pantalla pinta lo que llegue. Poner un tope aquí sin decirlo sería el recorte silencioso que este bloque cierra, y decirlo exige cambiar la forma de la respuesta y las DOS llamadas de Access.tsx. Bloque propio, no una nota al pie de éste. (`summary` del mismo archivo sí es un cálculo.)' },
  'modules/campanas/campanas.service.ts::campanaMapeo': { n: 1, cat: 'DEUDA',
    motivo: 'DEUDA · La lista de campañas de mapeo. Crece despacio —una campaña no es un evento diario— pero crece. Mismo motivo que la anterior: el tope exige que la pantalla lo diga.' },
  'modules/procedimientos/procedimientos.service.ts::mejoraProcedimiento': { n: 1, cat: 'DEUDA',
    motivo: 'DEUDA · Las mejoras propuestas por los técnicos, pendientes de decisión. Crece con el uso. Se cierra con su pantalla.' },
};

/* -----------------------------------------------------------------------------
   Limpieza. Sin comentarios: un `findMany` mencionado en una explicación no es
   una consulta. Y sin cadenas para lo mismo. La lección del bloque 100 es que
   hay que decir CUÁL de las dos hace falta en cada pregunta, y aquí se busca
   CÓDIGO, así que se van las dos.
----------------------------------------------------------------------------- */
function limpiar(txt, { cadenas = true } = {}) {
  let salida = '';
  let i = 0;
  while (i < txt.length) {
    const dos = txt.slice(i, i + 2);
    if (dos === '//') {
      while (i < txt.length && txt[i] !== '\n') i++;
      continue;
    }
    if (dos === '/*') {
      i += 2;
      while (i < txt.length && txt.slice(i, i + 2) !== '*/') i++;
      i += 2;
      continue;
    }
    const c = txt[i];
    if (cadenas && (c === '"' || c === "'" || c === '`')) {
      const cierre = c;
      i++;
      while (i < txt.length && txt[i] !== cierre) {
        if (txt[i] === '\\') i++;
        i++;
      }
      i++;
      salida += '""';
      continue;
    }
    salida += c;
    i++;
  }
  return salida;
}

/**
 * El bloque de argumentos de la llamada, contando PARÉNTESIS.
 *
 * No una ventana de N caracteres: con una ventana fija se lee el `take` de la
 * llamada SIGUIENTE y la consulta sin tope pasa en verde. Es el error del
 * verificador 9 y ya ha vuelto cuatro veces con otras caras.
 */
function argumentos(txt, desde) {
  const i = txt.indexOf('(', desde);
  if (i < 0) return null;
  let prof = 0;
  for (let j = i; j < txt.length; j++) {
    if (txt[j] === '(') prof++;
    else if (txt[j] === ')') {
      prof--;
      if (prof === 0) return txt.slice(i, j + 1);
    }
  }
  return null;
}

function recorrer(dir, encontrados = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'generated' || e.name === 'node_modules') continue;
      recorrer(completo, encontrados);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
      encontrados.push(completo);
    }
  }
  return encontrados;
}

/* ── 1 · contar las consultas sin tope sobre tablas que crecen ────────────── */
const halladas = new Map();
for (const archivo of recorrer(SRC)) {
  const rel = path.relative(SRC, archivo).split(path.sep).join('/');
  const limpio = limpiar(fs.readFileSync(archivo, 'utf8'));
  const re = /(?:this\.)?(?:prisma|tx|db)\.(\w+)\.findMany/g;
  let m;
  while ((m = re.exec(limpio)) !== null) {
    const modelo = m[1];
    if (!CRECEN.has(modelo)) continue;
    const args = argumentos(limpio, m.index + m[0].length);
    if (args === null) continue;
    if (/\btake\s*:/.test(args)) continue;
    const clave = `${rel}::${modelo}`;
    halladas.set(clave, (halladas.get(clave) ?? 0) + 1);
  }
}

/* ── 2 · toda la que aparece está declarada, y la cuenta cuadra ───────────── */
for (const [clave, n] of [...halladas].sort()) {
  const ex = EXENTOS[clave];
  if (!ex) {
    apunta(
      `\`${clave}\` hace ${n} consulta(s) SIN TOPE sobre una tabla que crece con el uso.\n`
      + '     Pon `take:` si es una lista o un archivo, o decláralo en EXENTOS con su\n'
      + '     categoría y su motivo. Y si es un CÁLCULO, NO le pongas tope: un `take`\n'
      + '     sobre un cálculo no lo hace más rápido, hace que el número MIENTA.',
    );
    continue;
  }
  if (ex.n !== n) {
    apunta(
      `\`${clave}\` está exento por ${ex.n} consulta(s) y ahora hay ${n}.\n`
      + '     Una exención no es barra libre para el archivo: si el número no cuadra,\n'
      + '     alguien añadió una consulta sin tope al amparo de una exención vieja.\n'
      + `     Categoría declarada: ${ex.cat}.`,
    );
  }
}

/* ── 3 · la DEUDA sólo puede encoger ─────────────────────────────────────── */
for (const [clave, ex] of Object.entries(EXENTOS)) {
  if (halladas.has(clave)) continue;
  if (ex.cat === 'DEUDA') {
    apunta(
      `\`${clave}\` sigue en la lista de DEUDA y ya NO existe. Bórralo de EXENTOS.\n`
      + '     Sin esta comprobación la deuda se «arregla» en el papel: la lista dice\n'
      + '     que quedan tres y hace meses que quedan dos.',
    );
  } else {
    apunta(
      `\`${clave}\` está declarado exento (${ex.cat}) y ya no aparece. Bórralo de EXENTOS\n`
      + '     o comprueba que la consulta no se movió a otro archivo sin declararla.',
    );
  }
}

/* ── 4 · la exportación tiene tope Y LO DICE ─────────────────────────────── */
const EXPORTA = path.join(SRC, 'modules', 'exportacion', 'exportacion.service.ts');
if (!fs.existsSync(EXPORTA)) {
  console.error(rojo('\n  No se encuentra exportacion.service.ts. Actualiza este verificador.\n'));
  process.exit(1);
}
const exporta = limpiar(fs.readFileSync(EXPORTA, 'utf8'), { cadenas: false });
/* LAS AGUJAS DE FUNCIÓN VAN CON PARÉNTESIS, y esto lo aprendí probándolo:
   la primera versión buscaba `avisoDeRecorte` a secas y **no cazó el fallo**
   —quité la llamada y siguió en verde— porque el nombre seguía en la línea del
   `import`. Un verificador que se conforma con que algo esté IMPORTADO no
   comprueba que se USE, y eso es exactamente el «modelo + endpoint ≠ función»
   de este proyecto aplicado a una función. */
const exigidas = [
  ['TOPE_FILAS_EXCEL', 'el tope de filas'],
  ['workOrder.count(', 'el recuento real de órdenes (sin él no se puede saber si se recortó)'],
  ['incident.count(', 'el recuento real de incidencias'],
  ['medirRecorte(', 'la comparación entre lo traído y lo que hay'],
  ['avisoDeRecorte(', 'el aviso DENTRO de la hoja'],
  ['lineaDePortada(', 'el aviso en la portada del libro completo'],
];
for (const [aguja, que] of exigidas) {
  if (!exporta.includes(aguja)) {
    apunta(
      `La exportación ya no usa \`${aguja}\` — falta ${que}.\n`
      + '     **Un recorte que no se dice es una mentira.** Un Excel con las últimas\n'
      + '     veinte mil órdenes entregado como «todas» es PEOR que uno lento: quien lo\n'
      + '     abre cuenta filas, saca un total y lo lleva a una reunión.',
    );
  }
}

/* ── Informe ─────────────────────────────────────────────────────────────── */
if (hallazgos.length) {
  console.error(rojo('\n  CONSULTAS SIN TECHO SOBRE TABLAS QUE CRECEN:\n'));
  for (const h of hallazgos) console.error(`   · ${h}\n`);
  process.exit(1);
}

const porCat = { CALCULO: 0, HIJO: 0, DEUDA: 0 };
for (const clave of halladas.keys()) porCat[EXENTOS[clave].cat] += halladas.get(clave);
console.log(verde(
  `Topes: ${CRECEN.size} tablas vigiladas · ${porCat.CALCULO} cálculos exentos `
  + `(un tope los haría mentir) · ${porCat.HIJO} acotadas por su padre · `
  + `${porCat.DEUDA} de deuda declarada. La exportación tiene tope y lo dice.`,
));
