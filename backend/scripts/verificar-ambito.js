#!/usr/bin/env node
/**
 * VERIFICADOR 10 — RUTAS `:id` SIN ÁMBITO DECLARADO
 * =============================================================================
 * EL AGUJERO QUE VIGILA (bloque 12.3, OWASP A01)
 *
 * El filtro de tren se aplicaba en los listados pero no al pedir algo por su
 * identificador. Un usuario del Tren 2 escribía en la barra de direcciones
 * `/assets/<id-del-Tren-1>` y lo obtenía entero.
 *
 * Se cerró con el decorador `@AmbitoDe(...)`. Pero un decorador que hay que
 * acordarse de poner **es un agujero con fecha**: la ruta número 42 que
 * escriba alguien el mes que viene no lo va a llevar, y nadie se va a enterar
 * hasta que sea tarde.
 *
 * Este verificador convierte el olvido en un fallo de la entrega. Toda ruta
 * con un parámetro en el camino tiene que declarar UNA de las dos cosas:
 *
 *   @AmbitoDe('asset')   -> pertenece a un tren y se comprueba
 *   @SinAmbito()         -> NO pertenece a ningún tren, y aquí está el motivo
 *
 * `@SinAmbito()` no es una escapatoria: es una decisión que queda escrita al
 * lado de la ruta, con su comentario. Un catálogo global o el almacén de toda
 * la planta no tienen tren, y decirlo en voz alta vale más que dejarlo en
 * blanco.
 */
const fs = require('fs');
const path = require('path');
const { seIgnora } = require('./carpetas-ignoradas');

const raiz = path.join(__dirname, '..', 'src', 'modules');

function controladores(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    // Bloque 52: no se mira el codigo generado. Ver scripts/carpetas-ignoradas.js
    if (e.isDirectory()) {
      if (seIgnora(e.name)) continue;
      controladores(p, acc);
    }
    else if (e.name.endsWith('.controller.ts')) acc.push(p);
  }
  return acc;
}

const sinDeclarar = [];
let conAmbito = 0, sinAmbito = 0;

for (const archivo of controladores(raiz)) {
  const lineas = fs.readFileSync(archivo, 'utf8').split('\n');
  const rel = path.relative(path.join(__dirname, '..'), archivo);

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i].trim();
    // Ruta con parámetro: @Get(':id'), @Patch(':id/estado'), @Post(':woId/x')
    const m = l.match(/^@(Get|Post|Patch|Put|Delete)\('([^']*:[a-zA-Z]+[^']*)'\)/);
    if (!m) continue;

    // Se miran las líneas de decoradores justo por encima, hasta encontrar
    // algo que no sea un decorador ni un comentario.
    let declarado = null;
    for (let j = i - 1; j >= 0; j--) {
      const t = lineas[j].trim();
      if (t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      if (!t.startsWith('@')) break;
      if (t.startsWith('@AmbitoDe')) { declarado = 'con'; break; }
      if (t.startsWith('@SinAmbito')) { declarado = 'sin'; break; }
    }

    if (declarado === 'con') conAmbito++;
    else if (declarado === 'sin') sinAmbito++;
    else sinDeclarar.push({ archivo: rel, linea: i + 1, ruta: `${m[1]} ${m[2]}` });
  }
}

if (sinDeclarar.length > 0) {
  console.error('\n  RUTAS CON PARÁMETRO Y SIN ÁMBITO DECLARADO\n');
  for (const r of sinDeclarar) {
    console.error(`    ${r.archivo}:${r.linea}   ${r.ruta}`);
  }
  console.error('\n  Cada una tiene que llevar encima UNA de estas dos:\n');
  console.error("    @AmbitoDe('asset')          si el registro pertenece a un tren");
  console.error('    @SinAmbito()  // motivo     si no pertenece a ninguno\n');
  console.error('  Sin esto, un usuario restringido puede pedir por identificador algo');
  console.error('  de otro tren y obtenerlo. Es OWASP A01, el riesgo numero 1.\n');
  process.exit(1);
}

console.log(`Ámbito verificado: ${conAmbito + sinAmbito} rutas con parámetro (${conAmbito} con ámbito, ${sinAmbito} declaradas sin él).`);
