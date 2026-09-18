/* eslint-disable no-console */
/**
 * VERIFICADOR 18 (backend) — EL ESQUEMA SE REVISA AQUÍ, PORQUE `prisma validate`
 * NO SIEMPRE SE PUEDE CORRER.
 *
 * =============================================================================
 *  DE QUÉ FALLO REAL NACE
 * =============================================================================
 *  Bloque 105. Se declaró `@@index([assetId, createdAt])` sobre `StockMovement`,
 *  un modelo que NO tiene `assetId` —el movimiento cuelga del repuesto—.
 *
 *  Lo aceptaron el typecheck, `verificar:campos`, `verificar:migraciones` y el
 *  verificador de índices. Reventó contra la BASE DE DATOS del usuario:
 *
 *      P3018 · ERROR: column "assetId" does not exist
 *
 *  `npx prisma validate` lo habría cazado en un segundo. Pero ese comando
 *  descarga un motor y no siempre hay red: en el entorno donde se escribe este
 *  código, no la hay. Y un control que no se puede ejecutar es un control que
 *  no existe (bloques 9, 85, 89 y 99).
 *
 *  Así que se comprueba aquí, leyendo el texto del esquema, sin red y sin base.
 *  NO sustituye a `prisma validate` —que valida muchas más cosas— pero sí cubre
 *  la familia de error que ya costó una migración fallida: **nombrar un campo
 *  que no existe.**
 *
 * =============================================================================
 *  QUÉ COMPRUEBA
 * =============================================================================
 *   1. Todo campo citado en `@@index([...])` existe en su modelo.
 *   2. Todo campo citado en `@@unique([...])` existe en su modelo.
 *   3. Todo campo citado en `@relation(fields: [...])` existe en su modelo.
 *   4. Todo tipo de una relación (`x  Otro?`) es un modelo o un enum declarado.
 */
const fs = require('fs');
const path = require('path');

const ESQUEMA = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const bruto = fs.readFileSync(ESQUEMA, 'utf8');

/* Se quitan los comentarios ANTES de analizar. Sin esto, una línea de
   comentario que empiece por una palabra suelta se lee como un campo — es
   exactamente lo que le pasó a `verificar:migraciones` en el bloque 105, que
   leyó «por» como una columna. */
const texto = bruto
  .split('\n')
  .map((l) => {
    const sinTripe = l.replace(/^\s*\/\/\/.*$/, '');
    return sinTripe.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/.*$/, '');
  })
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Tipos primitivos que Prisma conoce sin declararlos. */
const PRIMITIVOS = new Set([
  'String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal',
  'DateTime', 'Json', 'Bytes', 'Unsupported',
]);

function bloques(clase) {
  const re = new RegExp(`^${clase}\\s+(\\w+)\\s*\\{([\\s\\S]*?)^\\}`, 'gm');
  const salida = new Map();
  let m;
  while ((m = re.exec(texto)) !== null) salida.set(m[1], m[2]);
  return salida;
}

const modelos = bloques('model');
const enums = bloques('enum');
const declarados = new Set([...modelos.keys(), ...enums.keys()]);

/** Los campos de un modelo: el primer identificador de cada línea útil. */
function camposDe(cuerpo) {
  const campos = new Map();
  for (const linea of cuerpo.split('\n')) {
    const l = linea.trim();
    if (!l || l.startsWith('@@') || l.startsWith('@')) continue;
    const m = /^(\w+)\s+(\w+)(\[\])?(\?)?/.exec(l);
    if (m) campos.set(m[1], m[2]);
  }
  return campos;
}

const fallos = [];

for (const [modelo, cuerpo] of modelos) {
  const campos = camposDe(cuerpo);

  const revisarLista = (etiqueta, lista, linea) => {
    for (const bruta of lista.split(',')) {
      const campo = bruta.trim().replace(/\(.*\)$/, '');
      if (!campo) continue;
      if (!campos.has(campo)) {
        fallos.push(
          `${modelo}: ${etiqueta} nombra el campo «${campo}», que NO está declarado en el modelo.\n`
          + `       ${linea.trim()}\n`
          + '       Esto compila, pasa el typecheck y REVIENTA al migrar contra la base.',
        );
      }
    }
  };

  // 1 y 2 · índices y claves únicas
  for (const m of cuerpo.matchAll(/@@(index|unique)\(\s*\[([^\]]+)\]/g)) {
    revisarLista(`@@${m[1]}`, m[2], m[0]);
  }

  // 3 · relaciones
  for (const m of cuerpo.matchAll(/@relation\([^)]*fields:\s*\[([^\]]+)\]/g)) {
    revisarLista('@relation(fields:)', m[1], m[0]);
  }

  // 4 · el tipo de cada campo existe
  for (const [campo, tipo] of campos) {
    if (PRIMITIVOS.has(tipo) || declarados.has(tipo)) continue;
    fallos.push(
      `${modelo}.${campo}: el tipo «${tipo}» no es primitivo ni hay un model/enum con ese nombre.`,
    );
  }
}

if (!modelos.size) {
  fallos.push('No se encontró ningún modelo en schema.prisma. Revisa este verificador antes de darlo por bueno: '
    + 'un verificador que no encuentra lo que vigila es un verificador apagado.');
}

if (fallos.length) {
  console.error('\n  EL ESQUEMA NOMBRA CAMPOS QUE NO EXISTEN\n');
  for (const f of fallos) console.error(`   · ${f}\n`);
  console.error('  Esto es lo que `npx prisma validate` caza, y aquí no hay red para correrlo.\n');
  process.exit(1);
}
console.log(`[verificar:esquema] OK — ${modelos.size} modelos, ${enums.size} enums: todo campo citado existe.`);
