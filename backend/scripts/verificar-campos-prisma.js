#!/usr/bin/env node
/**
 * VERIFICADOR DE CAMPOS DE PRISMA
 * ================================
 *
 * DE DÓNDE SALE
 * El bloque 6 se escribió pidiendo `name` en un `select` del modelo Asset.
 * Asset NO tiene `name` — tiene `model`. TypeScript lo detecta, sí, pero
 * SÓLO al compilar, y cuando cae lo hace en cascada: un único campo mal
 * escrito produjo NUEVE errores, ocho de ellos falsos («la propiedad nvr no
 * existe»), porque al invalidarse el `select` TypeScript pierde el tipo del
 * resultado entero. Leer ese muro de errores para encontrar la palabra
 * `name` cuesta más que el fallo.
 *
 * Este verificador dice, en una línea:
 *     asset.select: el campo 'name' no existe en el modelo Asset.
 *
 * QUÉ COMPRUEBA
 * Las claves de primer nivel de cada `select: { ... }` que cuelga de un
 * `this.prisma.<modelo>.<operación>({ ... })`, contra los campos declarados
 * en schema.prisma.
 *
 * QUÉ NO COMPRUEBA, A PROPÓSITO
 *   · `where`, `orderBy` y `data`: admiten operadores (`AND`, `OR`, `NOT`,
 *     `contains`…) que no son campos, y distinguirlos bien exige entender la
 *     gramática de Prisma. Un verificador que se equivoca es peor que no
 *     tenerlo: ya nos pasó dos veces con falsos positivos.
 *   · Los `select` anidados dentro de una relación. Habría que seguir el
 *     tipo de la relación; se puede hacer, pero hoy no hace falta.
 *
 * Prefiere callarse antes que acusar en falso.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ESQUEMA = path.join(RAIZ, 'prisma', 'schema.prisma');
const FUENTE = path.join(RAIZ, 'src');

/* ---------- 1. Campos de cada modelo ---------- */
function leerModelos() {
  const txt = fs.readFileSync(ESQUEMA, 'utf8');
  const modelos = new Map();
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = re.exec(txt))) {
    const campos = new Set();
    for (const linea of m[2].split('\n')) {
      const l = linea.trim();
      if (!l || l.startsWith('//') || l.startsWith('@@') || l.startsWith('///')) continue;
      const c = l.match(/^(\w+)\s+/);
      if (c) campos.add(c[1]);
    }
    // El nombre del modelo en el cliente va en minúscula inicial:
    // model AssetCamera -> this.prisma.assetCamera
    modelos.set(m[1][0].toLowerCase() + m[1].slice(1), { nombre: m[1], campos });
  }
  return modelos;
}

/* ---------- 2. Quitar comentarios sin mover los renglones ---------- */
// Los verificadores anteriores fallaron por buscar dentro de comentarios.
// Se borran, pero conservando los saltos de línea para que el número de
// línea que se reporta siga siendo el de verdad.
function sinComentarios(src) {
  let out = '';
  let i = 0;
  let estado = 'codigo';
  let comilla = '';
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (estado === 'codigo') {
      if (c === '/' && d === '/') { estado = 'linea'; i += 2; continue; }
      if (c === '/' && d === '*') { estado = 'bloque'; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { estado = 'texto'; comilla = c; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (estado === 'linea') {
      if (c === '\n') { estado = 'codigo'; out += c; }
      i++; continue;
    }
    if (estado === 'bloque') {
      if (c === '*' && d === '/') { estado = 'codigo'; i += 2; continue; }
      if (c === '\n') out += c;
      i++; continue;
    }
    // texto
    if (c === '\\') { out += '  '; i += 2; continue; }
    if (c === comilla) { estado = 'codigo'; }
    out += (c === '\n' ? '\n' : c);
    i++;
  }
  return out;
}

/* ---------- 3. Recorrer el bloque equilibrando llaves ---------- */
function bloqueDesde(src, apertura) {
  let prof = 0;
  for (let i = apertura; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') {
      prof--;
      if (prof === 0) return src.slice(apertura + 1, i);
    }
  }
  return null;
}

/** Claves de primer nivel de un bloque de objeto. */
function clavesDeNivel1(cuerpo) {
  const claves = [];
  let prof = 0;
  let i = 0;
  let esperando = true;
  while (i < cuerpo.length) {
    const c = cuerpo[i];
    if (c === '{' || c === '[' || c === '(') { prof++; esperando = false; i++; continue; }
    if (c === '}' || c === ']' || c === ')') { prof--; i++; continue; }
    if (prof === 0) {
      if (c === ',') { esperando = true; i++; continue; }
      if (esperando && /[A-Za-z_]/.test(c)) {
        const m = cuerpo.slice(i).match(/^(\w+)\s*:/);
        if (m) {
          claves.push({ clave: m[1], pos: i });
          i += m[0].length;
          esperando = false;
          continue;
        }
      }
      if (!/\s/.test(c)) esperando = false;
    }
    i++;
  }
  return claves;
}

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, acc);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) acc.push(p);
  }
  return acc;
}

/**
 * Claves que Prisma acepta en un `select` y que NO son campos del modelo:
 * son agregados que calcula el propio Prisma. La primera versión de este
 * verificador las denunció como inexistentes — dos falsos positivos en el
 * primer intento, que es justo el error que ya cometí tres veces con los
 * verificadores anteriores. Se comprueba SIEMPRE contra el código real antes
 * de dar por bueno un verificador.
 */
const AGREGADOS = new Set(['_count', '_avg', '_sum', '_min', '_max']);

/* ---------- 4. Comprobar ---------- */
const modelos = leerModelos();
const fallos = [];
let revisados = 0;

for (const archivo of archivos(FUENTE)) {
  const limpio = sinComentarios(fs.readFileSync(archivo, 'utf8'));
  const re = /\bprisma\.(\w+)\s*\.\s*(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow)\s*\(\s*\{/g;
  let m;
  while ((m = re.exec(limpio))) {
    const modelo = modelos.get(m[1]);
    if (!modelo) continue; // no es un modelo conocido: no se opina

    const cuerpo = bloqueDesde(limpio, limpio.indexOf('{', m.index + m[0].length - 1));
    if (cuerpo == null) continue;

    for (const { clave, pos } of clavesDeNivel1(cuerpo)) {
      if (clave !== 'select') continue;
      const inicio = cuerpo.indexOf('{', pos);
      if (inicio < 0) continue;
      const dentro = bloqueDesde(cuerpo, inicio);
      if (dentro == null) continue;
      revisados++;
      for (const { clave: campo } of clavesDeNivel1(dentro)) {
        if (!modelo.campos.has(campo) && !AGREGADOS.has(campo)) {
          const hasta = limpio.indexOf(cuerpo) >= 0 ? m.index : 0;
          const linea = limpio.slice(0, hasta).split('\n').length;
          fallos.push(
            `${path.relative(RAIZ, archivo)}:${linea}  ${m[1]}.select: el campo '${campo}' ` +
            `no existe en el modelo ${modelo.nombre}.`,
          );
        }
      }
    }
  }
}

if (fallos.length) {
  console.error('CAMPOS DE PRISMA INEXISTENTES:\n');
  for (const f of fallos) console.error('  ' + f);
  console.error(
    '\nUn campo mal escrito en un `select` invalida el tipo del resultado ENTERO,\n' +
    'y el compilador acaba señalando media docena de sitios que están bien.\n' +
    'Corrige el nombre y los demás errores desaparecen solos.',
  );
  process.exit(1);
}

console.log(`Campos de Prisma verificados: ${revisados} bloques \`select\`, todos los campos existen.`);
