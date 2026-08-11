#!/usr/bin/env node
/**
 * VERIFICADOR 8 — RELACIONES DE PRISMA CON UN SOLO LADO
 * =============================================================================
 * EL FALLO QUE ESTE VERIFICADOR EXISTE PARA CAZAR
 *
 * En el bloque 16 declaré en `Instalacion`:
 *
 *     workOrderId  String?
 *     workOrder    WorkOrder? @relation(fields: [workOrderId], references: [id])
 *
 * ...y me olvidé de poner `instalaciones Instalacion[]` en `WorkOrder`.
 *
 * Prisma EXIGE el campo en los dos modelos, aunque sólo uno lleve la clave
 * foránea. El resultado fue un P1012 al generar el cliente, en la máquina del
 * usuario, después de haber escrito los 22 archivos.
 *
 * Lo peor no es el error: es CUÁNDO aparece. Ninguno de los 7 verificadores
 * lo detectaba, así que el paquete salió "verificado" y reventó en el paso 5
 * del script. Este verificador lo mueve a donde tiene que estar: aquí, antes
 * de empaquetar.
 *
 * CÓMO FUNCIONA
 * Por cada campo con `@relation(fields: [...])` —el lado que lleva la clave—
 * busca en el modelo apuntado al menos un campo cuyo tipo sea el modelo de
 * origen. Si no lo encuentra, avisa.
 */
const fs = require('fs');
const path = require('path');

const ruta = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const texto = fs.readFileSync(ruta, 'utf8');

// Trocear en modelos. Se ignoran enum, generator, datasource y comentarios.
const modelos = {};
const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
let m;
while ((m = re.exec(texto)) !== null) modelos[m[1]] = m[2];

const nombres = new Set(Object.keys(modelos));
const problemas = [];

for (const [modelo, cuerpo] of Object.entries(modelos)) {
  const lineas = cuerpo.split('\n');
  for (const linea of lineas) {
    const l = linea.trim();
    if (!l || l.startsWith('//') || l.startsWith('///') || l.startsWith('@@')) continue;
    // Sólo el lado que declara la clave foránea.
    if (!/@relation\s*\(/.test(l) || !/fields\s*:/.test(l)) continue;

    // `campo  Modelo?  @relation(...)`  ->  Modelo
    const partes = l.split(/\s+/);
    if (partes.length < 2) continue;
    const destino = partes[1].replace(/[?[\]]/g, '');
    if (!nombres.has(destino)) continue;

    // ¿Cómo se llama esta relación? Dos modelos pueden estar unidos por
    // varias relaciones y hay que emparejar la correcta por su nombre.
    const conNombre = l.match(/@relation\s*\(\s*"([^"]+)"/);
    const nombreRel = conNombre ? conNombre[1] : null;

    const cuerpoDestino = modelos[destino];
    const vuelta = cuerpoDestino.split('\n').some((ld) => {
      const t = ld.trim();
      if (!t || t.startsWith('//') || t.startsWith('@@')) return false;
      const p = t.split(/\s+/);
      if (p.length < 2) return false;
      const tipo = p[1].replace(/[?[\]]/g, '');
      if (tipo !== modelo) return false;
      if (!nombreRel) return true;            // relación sin nombre: basta el tipo
      return t.includes(`"${nombreRel}"`);    // con nombre: tiene que coincidir
    });

    if (!vuelta) {
      problemas.push({
        modelo,
        campo: partes[0],
        destino,
        relacion: nombreRel,
      });
    }
  }
}

if (problemas.length > 0) {
  console.error('\n  RELACIONES SIN EL LADO INVERSO\n');
  for (const p of problemas) {
    console.error(`    ${p.modelo}.${p.campo} apunta a ${p.destino}${p.relacion ? ` (relación "${p.relacion}")` : ''}`);
    console.error(`      falta en el modelo ${p.destino}:`);
    console.error(`        ${p.modelo.charAt(0).toLowerCase() + p.modelo.slice(1)}s  ${p.modelo}[]${p.relacion ? ` @relation("${p.relacion}")` : ''}\n`);
  }
  console.error('  Prisma exige el campo en los DOS modelos, aunque sólo uno lleve la');
  console.error('  clave foránea. Sin esto, `prisma generate` falla con P1012.\n');
  process.exit(1);
}

const conClave = (texto.match(/@relation\s*\([^)]*fields\s*:/g) || []).length;
console.log(`Relaciones verificadas: ${conClave} claves foráneas, todas con su lado inverso.`);
