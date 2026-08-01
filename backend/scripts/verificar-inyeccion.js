#!/usr/bin/env node
/**
 * VERIFICADOR DE INYECCIÓN DE DEPENDENCIAS
 *
 * POR QUÉ EXISTE
 * El 01/08 el arranque en producción se cayó entero con este mensaje:
 *
 *   Nest can't resolve dependencies of the DashboardController
 *   (DashboardService, ?). BandejaService at index [1] is not available.
 *
 * La causa: DashboardController pedía BandejaService por constructor y el
 * módulo no lo declaraba en providers.
 *
 * LO PEOR DE ESTE FALLO ES QUE NO LO VE NADIE ANTES DE TIEMPO:
 *   - `npm run build` pasa: TypeScript ve la clase importada y se queda
 *     tranquilo. La declaración en el módulo es un dato en tiempo de
 *     ejecución, no un tipo.
 *   - `npm test` pasa: las pruebas unitarias construyen los servicios a mano.
 *   - Solo revienta al LEVANTAR la aplicación. Es decir, en producción.
 *
 * Esto lo caza antes, en un segundo, sin levantar nada. Recorre cada
 * *.module.ts, mira qué inyectan por constructor sus controladores y
 * proveedores, y comprueba que cada clase esté disponible: declarada en el
 * módulo, exportada por un módulo importado, o proveniente de un @Global.
 *
 * Uso:  node scripts/verificar-inyeccion.js
 * Sale con código 1 si falta algo, para que la CI lo corte.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function archivos(dir, filtro, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, filtro, acc);
    else if (filtro.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Contenido sin comentarios ni cadenas: evita falsos positivos. */
function limpio(txt) {
  return txt
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

/** Lee un array del decorador @Module: providers, controllers, imports, exports. */
function lista(txt, clave) {
  const m = new RegExp(clave + '\\s*:\\s*\\[([\\s\\S]*?)\\]').exec(txt);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    // forRoot(), useFactory, objetos de configuración: no son clases sueltas
    .map((s) => (/^[A-Z][A-Za-z0-9_]*$/.test(s) ? s : null))
    .filter(Boolean);
}

/** Tipos que pide el constructor de una clase. */
function inyecta(txt) {
  const m = /constructor\s*\(([\s\S]*?)\)\s*\{/.exec(txt);
  if (!m) return [];
  const tipos = [];
  for (const p of m[1].split(',')) {
    // private readonly x: Tipo   |   @Inject(X) private y: Tipo
    const t = /:\s*([A-Z][A-Za-z0-9_]*)/.exec(p);
    if (t) tipos.push(t[1]);
  }
  return tipos;
}

// --- 1. Mapa clase -> archivo, para poder abrir el fuente de cada clase ---
const fuentes = archivos(SRC, /\.ts$/).filter((f) => !/\.spec\.ts$/.test(f));
const claseEnArchivo = new Map();
for (const f of fuentes) {
  const txt = limpio(fs.readFileSync(f, 'utf8'));
  for (const m of txt.matchAll(/export\s+class\s+([A-Za-z0-9_]+)/g)) {
    claseEnArchivo.set(m[1], f);
  }
}

// --- 2. Módulos: qué declaran, qué exportan, cuáles son globales ---
const modulos = new Map();
const globales = new Set();
for (const f of fuentes.filter((f) => /\.module\.ts$/.test(f))) {
  const txt = limpio(fs.readFileSync(f, 'utf8'));
  const nombre = (/export\s+class\s+([A-Za-z0-9_]+)/.exec(txt) || [])[1];
  if (!nombre) continue;
  const info = {
    archivo: f,
    providers: lista(txt, 'providers'),
    controllers: lista(txt, 'controllers'),
    imports: lista(txt, 'imports'),
    exports: lista(txt, 'exports'),
    global: /@Global\s*\(\s*\)/.test(txt),
  };
  modulos.set(nombre, info);
  if (info.global) info.exports.forEach((e) => globales.add(e));
}

// Nest resuelve solo estos sin declararlos
const DE_NEST = new Set([
  'JwtService', 'ConfigService', 'HttpService', 'Reflector', 'ModuleRef',
  'EventEmitter2', 'SchedulerRegistry', 'Logger',
]);

// --- 3. Comprobación ---
let fallos = 0;
for (const [nombre, m] of modulos) {
  const disponibles = new Set([...m.providers, ...globales, ...DE_NEST]);
  // lo que exportan los módulos que este importa
  for (const imp of m.imports) {
    const otro = modulos.get(imp);
    if (otro) otro.exports.forEach((e) => disponibles.add(e));
  }
  for (const clase of [...m.controllers, ...m.providers]) {
    const f = claseEnArchivo.get(clase);
    if (!f) continue;
    const pedidos = inyecta(limpio(fs.readFileSync(f, 'utf8')));
    for (const dep of pedidos) {
      // Solo interesan clases del proyecto que sean inyectables
      if (!claseEnArchivo.has(dep)) continue;
      if (disponibles.has(dep)) continue;
      fallos++;
      console.error(
        `\n  FALTA  ${dep}\n` +
        `    lo pide : ${clase}  (${path.relative(SRC, f)})\n` +
        `    módulo  : ${nombre}  (${path.relative(SRC, m.archivo)})\n` +
        `    arreglo : añade ${dep} a providers de ${nombre}, o importa el\n` +
        `              módulo que lo exporta.`,
      );
    }
  }
}

if (fallos) {
  console.error(`\n${fallos} dependencia(s) sin declarar. La aplicación NO va a arrancar.\n`);
  process.exit(1);
}
console.log(`Inyección verificada: ${modulos.size} módulos, todo declarado.`);
