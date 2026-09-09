#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR 18 (backend) · TODA TAREA PROGRAMADA PASA POR EL CANDADO
   -----------------------------------------------------------------------------
   DE DÓNDE SALE (bloque 100). Había tres `setInterval` en el backend y los tres
   se protegían de la ejecución doble con una marca DENTRO DEL PROCESO. Con dos
   réplicas en Railway eso no vale para nada: cada proceso tiene su copia.

       preventivo   →  generaba el plan entero DOS VECES
       despachador  →  mandaba cada aviso de Telegram DOS VECES
       resumen      →  dos resúmenes cada mañana

   Se cerró con `common/candado-de-instancia.ts`. **Y el arreglo se puede
   deshacer sin querer**: el que escriba el cuarto planificador dentro de tres
   meses copiará uno de los que ya hay… y copiará el `setInterval` sin el
   candado, porque el candado no salta a la vista.

   > Una regla que hay que acordarse de cumplir es un agujero con fecha.
   > Este proyecto lo tiene escrito desde el bloque 12.3 con el decorador de
   > ámbito. Aquí es exactamente lo mismo.

   -----------------------------------------------------------------------------
   QUÉ COMPRUEBA

     1. Todo archivo de `src/` con un `setInterval(` REAL importa el candado,
        o está en `EXENTOS` con su motivo escrito.
     2. Las claves de `CANDADO` son NÚMEROS y son ÚNICAS. Dos tareas con el
        mismo número se bloquean entre sí sin tener nada que ver, y el síntoma
        —«esta tarea a veces no corre»— no lleva a ninguna parte.
     3. Toda `CANDADO.LOQUESEA` que se use está declarada.
     4. El candado sigue siendo `pg_try_advisory_XACT_lock`. Si alguien lo
        cambia al de SESIÓN, con el pool de Prisma el `unlock` puede salir por
        otra conexión, el candado se queda tomado para siempre y la tarea no
        vuelve a ejecutarse NUNCA — sin un solo error en el registro.

   -----------------------------------------------------------------------------
   POR QUÉ LIMPIA COMENTARIOS Y CADENAS ANTES DE BUSCAR

   Porque `candado-de-instancia.ts` menciona `setInterval` en su propia
   cabecera, y este mismo archivo también. Un verificador que se caza a sí
   mismo en un comentario es un falso positivo el día uno — y un verificador
   que grita cuando no pasa nada se ignora a la semana (bloque 9).

   Probado en los dos sentidos: quitando el import del candado en cada uno de
   los tres planificadores (sale código 1 y lo nombra), duplicando un número de
   `CANDADO`, y cambiando `xact` por el candado de sesión.
============================================================================= */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const SRC = path.join(RAIZ, 'src');
const CANDADO_TS = path.join(SRC, 'common', 'candado-de-instancia.ts');

const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const verde = (t) => `\x1b[32m${t}\x1b[0m`;

const hallazgos = [];
const apunta = (t) => hallazgos.push(t);

/* -----------------------------------------------------------------------------
   EXENTOS · cada uno con su motivo ESCRITO.
   Una excepción sin motivo es un olvido con permiso.
----------------------------------------------------------------------------- */
const EXENTOS = {
  'common/candado-de-instancia.ts':
    'Es el candado. No puede usarse a sí mismo.',
};

/* -----------------------------------------------------------------------------
   Limpieza: fuera comentarios y cadenas, para no leer un `setInterval` que
   está dentro de una explicación.

   Recorre carácter a carácter en vez de usar expresiones regulares porque una
   cadena de texto puede llevar dentro la marca de cierre de comentario, y un
   comentario puede llevar comillas: con expresiones sueltas eso se desmonta.
   Es el mismo error de las ventanas anchas del verificador 9.

   (Y lo digo con la marca escrita en palabras a propósito: la primera versión
   de esta cabecera la puso tal cual, cerró el comentario cuatro líneas antes
   de tiempo y el archivo entero dejó de ser válido. Node lo cazó al instante,
   pero es el mismo tropiezo del bloque 18.1 con otra cara.)

   -----------------------------------------------------------------------------
   DOS LIMPIEZAS, PORQUE SON DOS PREGUNTAS DISTINTAS

   La primera versión de este verificador borraba comentarios Y cadenas para
   todo, y se dio TRES falsos positivos a sí mismo en su primera ejecución.
   El motivo: la prueba que buscaba **vive dentro de una cadena**.

       import ... from '../../common/candado-de-instancia';   ← una cadena
       SELECT pg_try_advisory_xact_lock(...)                  ← una plantilla

   Al borrarlas, los tres planificadores que SÍ usan el candado salían como si
   no lo usaran. Así que:

       ¿hay un `setInterval` de verdad?   → sin comentarios y SIN cadenas
                                            (una mención en una explicación no
                                            es un temporizador)
       ¿usa el candado? ¿sigue el SQL?    → sin comentarios pero CON cadenas
                                            (ahí es donde está la prueba)

   Es la firma de este proyecto por décima vez, esta vez del otro lado: un
   patrón más RÍGIDO de lo necesario también acaba leyendo otra cosa.
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

/** Sin comentarios ni cadenas: para saber si algo es CÓDIGO de verdad. */
const soloCodigo = (txt) => limpiar(txt, { cadenas: true });
/** Sin comentarios pero con cadenas: para buscar imports y SQL. */
const sinComentarios = (txt) => limpiar(txt, { cadenas: false });

function recorrer(dir, encontrados = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      /* El cliente de Prisma es código generado: no es nuestro y no se toca. */
      if (entrada.name === 'generated' || entrada.name === 'node_modules') continue;
      recorrer(completo, encontrados);
    } else if (entrada.name.endsWith('.ts') && !entrada.name.endsWith('.spec.ts')) {
      encontrados.push(completo);
    }
  }
  return encontrados;
}

/* ── 0 · el candado tiene que existir ─────────────────────────────────────── */
if (!fs.existsSync(CANDADO_TS)) {
  /* Se AVISA en vez de dar luz verde: un verificador que no encuentra lo que
     vigila es un verificador apagado (bloque 74). */
  console.error(rojo('\n  No se encuentra src/common/candado-de-instancia.ts. Actualiza este verificador.\n'));
  process.exit(1);
}
const fuenteCandado = fs.readFileSync(CANDADO_TS, 'utf8');
/* CON cadenas: el SQL del candado y la constante viven en plantillas. */
const candadoLimpio = sinComentarios(fuenteCandado);

/* ── 1 · todo setInterval real pasa por el candado ────────────────────────── */
for (const archivo of recorrer(SRC)) {
  const relativo = path.relative(SRC, archivo).split(path.sep).join('/');
  const fuente = fs.readFileSync(archivo, 'utf8');

  /* ¿Es un temporizador de VERDAD? Sin cadenas: una mención dentro de un
     texto no programa nada. */
  if (!/\bsetInterval\s*\(/.test(soloCodigo(fuente))) continue;

  if (EXENTOS[relativo]) continue;

  /* ¿Usa el candado? CON cadenas: la ruta del import ES una cadena. */
  if (!/candado-de-instancia/.test(sinComentarios(fuente))) {
    apunta(
      `src/${relativo} programa un \`setInterval\` y NO usa el candado.\n`
      + '     Con dos réplicas en Railway esa tarea se ejecuta DOS VECES, y no\n'
      + '     falla nada: sale duplicado y ya. Envuelve el trabajo en\n'
      + '     `conCandado(this.prisma, CANDADO.LO_QUE_SEA, ...)` —incluida la\n'
      + '     comprobación de «¿ya se hizo?»— o decláralo en EXENTOS con su motivo.',
    );
  }
}

/* ── 2 · las claves son números y son únicas ──────────────────────────────── */
const bloque = candadoLimpio.slice(
  candadoLimpio.indexOf('export const CANDADO'),
  candadoLimpio.indexOf('} as const'),
);
const declaradas = new Map();
for (const m of bloque.matchAll(/^\s*([A-Z_][A-Z0-9_]*)\s*:\s*([0-9_]+)\s*,/gm)) {
  const nombre = m[1];
  const numero = Number(m[2].replace(/_/g, ''));
  if (!Number.isInteger(numero)) {
    apunta(`La clave CANDADO.${nombre} no es un número entero.`);
    continue;
  }
  for (const [otro, n] of declaradas) {
    if (n === numero) {
      apunta(
        `CANDADO.${nombre} y CANDADO.${otro} valen los dos ${numero}.\n`
        + '     Los candados de PostgreSQL comparten un solo espacio de nombres:\n'
        + '     dos tareas SIN relación se bloquearían entre sí, y el síntoma\n'
        + '     («a veces no corre») no lleva a ninguna parte.',
      );
    }
  }
  declaradas.set(nombre, numero);
}
if (declaradas.size === 0) {
  apunta('No se pudo leer ninguna clave de `CANDADO`. ¿Cambió la forma de la constante?');
}

/* ── 3 · toda clave usada está declarada ──────────────────────────────────── */
for (const archivo of recorrer(SRC)) {
  const relativo = path.relative(SRC, archivo).split(path.sep).join('/');
  if (relativo === 'common/candado-de-instancia.ts') continue;
  const limpio = soloCodigo(fs.readFileSync(archivo, 'utf8'));
  for (const m of limpio.matchAll(/CANDADO\.([A-Z_][A-Z0-9_]*)/g)) {
    if (!declaradas.has(m[1])) {
      apunta(`src/${relativo} usa CANDADO.${m[1]}, que no está declarada en candado-de-instancia.ts.`);
    }
  }
}

/* ── 4 · sigue siendo el candado de TRANSACCIÓN ───────────────────────────── */
if (!/pg_try_advisory_xact_lock/.test(candadoLimpio)) {
  apunta(
    'El candado ya no usa `pg_try_advisory_xact_lock`.\n'
    + '     Con el candado de SESIÓN y el pool de Prisma, el `unlock` puede salir\n'
    + '     por otra conexión: no suelta nada, el candado se queda tomado y la\n'
    + '     tarea NO VUELVE A EJECUTARSE — sin un solo error en el registro.',
  );
}
if (!/\$transaction/.test(candadoLimpio)) {
  apunta(
    'El candado ya no toma el lock dentro de `$transaction`.\n'
    + '     Es lo que obliga a Prisma a usar UNA sola conexión; sin eso el lock\n'
    + '     y el trabajo pueden viajar por conexiones distintas.',
  );
}

/* ── Informe ─────────────────────────────────────────────────────────────── */
if (hallazgos.length) {
  console.error(rojo('\n  TAREAS PROGRAMADAS SIN CANDADO:\n'));
  for (const h of hallazgos) console.error(`   · ${h}\n`);
  console.error(rojo('  Con dos instancias, una tarea sin candado se ejecuta dos veces.\n'));
  process.exit(1);
}

console.log(
  verde(`Planificadores: todo \`setInterval\` pasa por el candado; ${declaradas.size} claves únicas.`),
);
