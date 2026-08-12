#!/usr/bin/env node
/**
 * VERIFICADOR — SINTAXIS REAL DE TODO EL FRONTEND
 * =============================================================================
 * EL FALLO QUE ESTE VERIFICADOR EXISTE PARA CAZAR
 *
 * Al generar `Equipos.tsx` usé `re.sub` de Python con un reemplazo que
 * contenía `\n`. **`re.sub` interpreta los escapes del texto de reemplazo**,
 * así que ese `\n` se convirtió en un SALTO DE LÍNEA REAL dentro de una
 * cadena de comillas simples:
 *
 *     window.prompt('¿Cómo se llama este aparato?
 *
 *     Ej: «PC púlpito T2».', d.nombre)      <- cadena rota en tres trozos
 *
 * En JavaScript una cadena con comilla simple o doble **no puede** contener
 * un salto de línea. Sólo las plantillas con acento grave. Resultado:
 * `Unterminated string literal` en el build, en la máquina del usuario,
 * después de escribir 19 archivos y pasar los 8 verificadores del backend.
 *
 * =============================================================================
 *  POR QUÉ ESTO USA UN ANALIZADOR Y NO CUENTA COMILLAS
 * =============================================================================
 *  La primera versión contaba comillas por línea. Dio **5 falsos positivos**
 *  al primer intento, todos legítimos:
 *
 *    · `'http://localhost:3000'`  — el `//` de la URL parecía un comentario
 *    · texto JSX con comillas repartido en dos líneas
 *    · expresiones regulares que llevan `"` dentro
 *
 *  Un verificador que grita cuando no pasa nada se ignora a la semana. Así
 *  que esto no adivina: le pasa el archivo a **esbuild**, que es el mismo
 *  analizador que usa Vite para construir. Si esbuild lo acepta, es válido.
 *  Si no, dice exactamente qué línea y por qué.
 *
 *  NO es un `tsc`: no comprueba tipos, sólo que el archivo se pueda analizar.
 *  Eso es justo lo que faltaba — los errores de tipo ya los caza el build, y
 *  los de sintaxis rompían antes de llegar ahí.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

let esbuild;
try {
  esbuild = require('esbuild');
} catch {
  // Si no está instalado, NO se falla: el build de Vite lo cazará igual, y
  // un verificador que revienta por falta de una dependencia sólo consigue
  // que alguien lo borre del script de entrega.
  console.log('Sintaxis: esbuild no disponible aquí, lo comprobará `npm run build`.');
  process.exit(0);
}

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const lista = archivos(SRC);
const problemas = [];

for (const archivo of lista) {
  const rel = path.relative(path.join(__dirname, '..'), archivo);
  const texto = fs.readFileSync(archivo, 'utf8');
  try {
    esbuild.transformSync(texto, {
      loader: archivo.endsWith('.tsx') ? 'tsx' : 'ts',
      sourcefile: rel,
    });
  } catch (e) {
    for (const err of e.errors || [{ text: e.message }]) {
      problemas.push({
        archivo: rel,
        linea: err.location?.line,
        texto: err.text,
        linea_texto: err.location?.lineText?.trim(),
      });
    }
  }
}

if (problemas.length > 0) {
  console.error('\n  ERRORES DE SINTAXIS EN EL FRONTEND\n');
  for (const p of problemas) {
    console.error(`    ${p.archivo}${p.linea ? ':' + p.linea : ''}`);
    console.error(`      ${p.texto}`);
    if (p.linea_texto) console.error(`      ${p.linea_texto.slice(0, 100)}`);
    console.error('');
  }
  console.error('  Recordatorio: una cadena con comilla simple o doble NO puede');
  console.error('  contener un salto de línea. Usa \\n dentro, o pásala a plantilla');
  console.error('  con acento grave.\n');
  process.exit(1);
}

console.log(`Sintaxis verificada: ${lista.length} archivos del frontend, todos se analizan bien.`);
