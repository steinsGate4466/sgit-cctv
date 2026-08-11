#!/usr/bin/env node
/**
 * VERIFICADOR 9 — CAMPOS EN LAS ESCRITURAS (`data: { ... }`)
 * =============================================================================
 * LOS DOS FALLOS QUE ESTE VERIFICADOR EXISTE PARA CAZAR
 *
 *  1. ESCRIBIR UN CAMPO QUE NO EXISTE. En el bloque 16 puse
 *     `environment: i.ambiente` al crear un Asset. `Asset` no tiene ese campo
 *     —el ambiente se deduce del árbol de ubicaciones— y el build cayó con
 *     TS2353 en la máquina del usuario.
 *     El verificador 6 sólo mira los bloques `select`. Las ESCRITURAS no las
 *     miraba nadie, y son las peligrosas: un `select` malo devuelve de menos,
 *     un `data` malo no compila.
 *
 *  2. `_count` FUERA DE SU SITIO. No es una opción de primer nivel: va dentro
 *     de `select` o de `include`. A pelo, TypeScript lo tipa como `never` y
 *     revienta TODAS las llamadas que lo usan de golpe.
 *
 * =============================================================================
 *  POR QUÉ ESTE ARCHIVO ESTÁ ESCRITO CON UN ANALIZADOR DE LLAVES Y NO CON
 *  EXPRESIONES REGULARES
 * =============================================================================
 *  La primera versión usaba `regex` con una ventana de 3.000 caracteres y dio
 *  **45 falsos positivos**: se comía el `data:` de la siguiente llamada, leía
 *  claves dentro de objetos anidados y confundía `null` con un campo.
 *
 *  Un verificador que grita cuando no pasa nada se ignora a la semana, y
 *  entonces no sirve para nada el día que grita de verdad. Así que esto
 *  localiza el paréntesis de la llamada, recorre el objeto contando llaves, y
 *  sólo mira las claves que están **exactamente a un nivel** de profundidad.
 *
 *  LO QUE **NO** COMPRUEBA, A PROPÓSITO
 *   · `data: variable` — no se puede leer de forma estática.
 *   · Claves dentro de `create:`, `connect:`, `set:`, `push:` u otros objetos
 *     anidados: ahí el modelo ya no es el mismo.
 *   · Objetos con `...spread`: se revisan las claves explícitas y se ignora
 *     lo que traiga el spread.
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const schema = fs.readFileSync(path.join(raiz, 'prisma', 'schema.prisma'), 'utf8');

// ---------- Campos declarados por modelo ----------
const campos = {};
const reModelo = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
let m;
while ((m = reModelo.exec(schema)) !== null) {
  const set = new Set();
  for (const linea of m[2].split('\n')) {
    const t = linea.trim();
    if (!t || t.startsWith('//') || t.startsWith('@@')) continue;
    const nombre = t.split(/\s+/)[0];
    if (/^[a-zA-Z_]\w*$/.test(nombre)) set.add(nombre);
  }
  campos[m[1]] = set;
}
const porPropiedad = {};
for (const n of Object.keys(campos)) porPropiedad[n.charAt(0).toLowerCase() + n.slice(1)] = n;

// ---------- Utilidades de recorrido ----------
/** Quita cadenas, plantillas y comentarios para que no confundan al contador. */
function limpiar(src) {
  let fuera = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') { fuera += ' '; i++; } continue; }
    if (c === '/' && src[i + 1] === '*') { const f = src.indexOf('*/', i + 2); const n = (f < 0 ? src.length : f + 2); fuera += src.slice(i, n).replace(/[^\n]/g, ' '); i = n; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const cierre = c; fuera += ' '; i++;
      while (i < src.length && src[i] !== cierre) { if (src[i] === '\\') { fuera += '  '; i += 2; continue; } fuera += src[i] === '\n' ? '\n' : ' '; i++; }
      fuera += ' '; i++; continue;
    }
    fuera += c; i++;
  }
  return fuera;
}

/** Índice del carácter que cierra el que empieza en `abre`. */
function cierreDe(src, abre) {
  const par = { '(': ')', '{': '}', '[': ']' }[src[abre]];
  let n = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === src[abre]) n++;
    else if (src[i] === par) { n--; if (n === 0) return i; }
  }
  return -1;
}

/**
 * Claves a UN nivel de profundidad de un objeto `{...}`.
 * Devuelve [{ clave, posValor, posClave }].
 */
function clavesNivel1(src, abre) {
  const fin = cierreDe(src, abre);
  if (fin < 0) return [];
  const salida = [];
  let prof = 0;
  for (let i = abre + 1; i < fin; i++) {
    const c = src[i];
    if (c === '{' || c === '[' || c === '(') { prof++; continue; }
    if (c === '}' || c === ']' || c === ')') { prof--; continue; }
    if (prof !== 0) continue;
    const resto = src.slice(i, i + 90);
    const k = resto.match(/^([a-zA-Z_]\w*)\s*:/);
    if (!k) continue;
    const antes = src.slice(0, i).replace(/\s+$/, '');
    const ultimo = antes[antes.length - 1];
    // Sólo si de verdad empieza una clave: tras `{`, tras `,` o al principio.
    if (ultimo !== undefined && ultimo !== '{' && ultimo !== ',') continue;
    salida.push({ clave: k[1], posClave: i, posValor: i + k[0].length });
  }
  return salida;
}

function archivosTs(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivosTs(p, acc);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) acc.push(p);
  }
  return acc;
}

const ESCRITURAS = new Set(['create', 'update', 'upsert', 'createMany', 'updateMany']);

/**
 * DÓNDE `_count` AL PRIMER NIVEL **SÍ** ES CORRECTO.
 *
 * En `groupBy` y en `aggregate`, `_count` es una opción legítima de primer
 * nivel: `groupBy({ by: ['estado'], _count: { _all: true } })`. Es lo que
 * pide el agregado.
 *
 * La primera versión de este verificador no lo distinguía y marcaba 13
 * llamadas correctas. Ese es exactamente el fallo que mata a un verificador:
 * gritar cuando no pasa nada, hasta que nadie le hace caso el día que grita
 * de verdad.
 */
const AGREGADOS = new Set(['groupBy', 'aggregate', 'count']);
const OPCIONES = new Set(['data', 'where', 'select', 'include', 'orderBy', 'skip', 'take',
  'cursor', 'distinct', 'by', 'having', 'create', 'update', 'skipDuplicates', 'omit', 'relationLoadStrategy']);

const problemas = [];
let nEscrituras = 0, nClaves = 0, nLlamadas = 0, nCount = 0;

/**
 * ¿ESTÁ ESTE `_count` EN SU SITIO?
 *
 * Se comprueba POR CONTEXTO y no dentro de la llamada, porque el caso que se
 * me escapó viajaba en un `...spread`:
 *
 *     private incluir = { _count: { select: { ... } } };   // <- mal
 *     ...
 *     findMany({ where, ...this.incluir })                 // el spread lo esconde
 *
 * Mirando sólo las llamadas, ese `_count` es invisible. Mirando el objeto
 * donde está escrito, se ve enseguida: su objeto contenedor no lo introduce
 * ni un `select:` ni un `include:`, así que está suelto.
 *
 * `_count` es válido en el primer nivel de `groupBy` y `aggregate`, y ahí sí
 * hay que dejarlo pasar.
 */
function countEnSuSitio(src, pos) {
  // Retroceder hasta la llave que abre el objeto que lo contiene.
  let prof = 0;
  let i = pos - 1;
  for (; i >= 0; i--) {
    const c = src[i];
    if (c === '}' || c === ')' || c === ']') prof++;
    else if (c === '{' || c === '(' || c === '[') {
      if (prof === 0) break;
      prof--;
    }
  }
  if (i < 0) return true; // no se pudo determinar: no se inventa un fallo
  if (src[i] !== '{') return true;

  const antes = src.slice(Math.max(0, i - 80), i);
  // Introducido por select: o include: -> correcto.
  if (/\b(select|include)\s*:\s*$/.test(antes)) return true;
  // `orderBy: { _count: { campo: 'desc' } }` y `having:` son la forma normal
  // de ordenar un groupBy por el conteo. Válidos.
  if (/\b(orderBy|having)\s*:\s*$/.test(antes)) return true;
  // Primer argumento de groupBy / aggregate / count -> correcto.
  if (/\.(groupBy|aggregate|count)\s*\(\s*$/.test(antes)) return true;
  return false;
}

for (const archivo of archivosTs(path.join(raiz, 'src'))) {
  const bruto = fs.readFileSync(archivo, 'utf8');
  const src = limpiar(bruto);
  const rel = path.relative(raiz, archivo);
  const lineaDe = (i) => bruto.slice(0, i).split('\n').length;

  // ---- `_count` suelto, mirando el objeto donde está escrito ----
  const reCount = /(?<![\w$])_count\s*:/g;
  let ct;
  while ((ct = reCount.exec(src)) !== null) {
    nCount++;
    if (!countEnSuSitio(src, ct.index)) {
      problemas.push({
        archivo: rel, linea: lineaDe(ct.index),
        que: '`_count` no está dentro de un `select` ni de un `include`',
        pista: 'Envuélvelo:  include: { _count: { select: { ... } } }  — suelto, TypeScript lo tipa como `never`',
      });
    }
  }

  const re = /prisma\.(\w+)\.(\w+)\s*\(/g;
  let l;
  while ((l = re.exec(src)) !== null) {
    const modelo = porPropiedad[l[1]];
    if (!modelo) continue;
    const metodo = l[2];

    const abrePar = l.index + l[0].length - 1;
    const cierraPar = cierreDe(src, abrePar);
    if (cierraPar < 0) continue;

    // El primer argumento tiene que ser un objeto literal.
    let j = abrePar + 1;
    while (j < cierraPar && /\s/.test(src[j])) j++;
    if (src[j] !== '{') continue;
    nLlamadas++;

    const nivel1 = clavesNivel1(src, j);

    // ---- claves de `data` contra el modelo ----
    if (!ESCRITURAS.has(metodo)) continue;
    const data = nivel1.find((k) => k.clave === 'data');
    if (!data) continue;
    let d = data.posValor;
    while (d < cierraPar && /\s/.test(src[d])) d++;
    if (src[d] !== '{') continue; // `data: variable` o `data: [ ... ]`

    nEscrituras++;
    for (const k of clavesNivel1(src, d)) {
      if (k.clave.startsWith('_')) continue;
      nClaves++;
      if (!campos[modelo].has(k.clave)) {
        const parecidos = [...campos[modelo]].filter((f) => f[0] === k.clave[0]).slice(0, 6);
        problemas.push({
          archivo: rel, linea: lineaDe(k.posClave),
          que: `\`${k.clave}\` no existe en el modelo ${modelo}`,
          pista: parecidos.length ? `¿Querías uno de estos? ${parecidos.join(', ')}` : 'Revisa el modelo en schema.prisma',
        });
      }
    }
  }
}

if (problemas.length > 0) {
  console.error('\n  ESCRITURAS CON PROBLEMAS\n');
  for (const p of problemas) {
    console.error(`    ${p.archivo}:${p.linea}`);
    console.error(`      ${p.que}`);
    console.error(`      ${p.pista}\n`);
  }
  process.exit(1);
}

console.log(`Escrituras verificadas: ${nLlamadas} llamadas, ${nEscrituras} bloques \`data\`, ${nClaves} campos y ${nCount} \`_count\`, todo en su sitio.`);
