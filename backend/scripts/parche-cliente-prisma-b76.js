/* =============================================================================
   PARCHE DEL CLIENTE DE PRISMA — sólo para poder hacer typecheck aquí
   =============================================================================

   POR QUÉ EXISTE

   `npx prisma generate` NO SE PUEDE CORRER en el entorno del agente: el dominio
   desde el que Prisma descarga sus binarios está bloqueado. Y `src/generated/`
   está en el `.gitignore`, así que el cliente que hay aquí es el que quedó de
   la última generación en la máquina del usuario.

   Sin parchearlo, los campos nuevos del bloque 76 no existen para TypeScript y
   el typecheck falla con errores que NO son del código: son de un cliente
   viejo. Entregar sin typecheck diciendo «ya se arreglará al generar» es
   exactamente lo que hizo que un P1012 apareciera en la máquina del usuario
   con 22 archivos ya escritos (bloque 16.1).

   EN LA MÁQUINA DEL USUARIO ESTE PARCHE NO HACE FALTA Y NO MOLESTA: el
   `prisma generate` del script de entrega vuelve a escribir la carpeta entera
   y se lo lleva por delante.

   -----------------------------------------------------------------------------
   POR QUÉ ES REVERSIBLE POR CONSTRUCCIÓN

   Sólo INSERTA líneas, y todas las que inserta contienen un nombre que antes no
   existía en el archivo. Deshacerlo es borrar toda línea que contenga esos
   nombres — no hay que acordarse de nada ni guardar una copia.

   La lección es del bloque 75: allí un parche «cuidadoso» rompió el cliente y
   sólo se pudo deshacer exacto porque cumplía esta propiedad. Un parche
   reversible por construcción vale más que uno cuidadoso.

       node scripts/parche-cliente-prisma-b76.js          aplica
       node scripts/parche-cliente-prisma-b76.js --deshacer
============================================================================= */
const fs = require('fs');
const path = require('path');

const GEN = path.join(__dirname, '..', 'src', 'generated', 'prisma');

/**
 * Cada campo nuevo se copia de uno EXISTENTE del mismo modelo cuyo tipo tenga
 * la misma forma, y se le aplican los cambios de tipo. Copiar en vez de
 * escribir a mano garantiza que aparezca en los 200 sitios donde Prisma lo
 * declara (filtros, order by, select, aggregate…) sin tener que conocerlos.
 */
const CAMPOS = [
  // archivo,         campo nuevo,               se copia de,        sustituciones
  ['Asset.ts', 'impactoOperacional', 'alturaMetros', [['Float', 'Int']]],
  ['Asset.ts', 'riesgoPersonas', 'alturaMetros', [['Float', 'Bool'], ['number', 'boolean']]],
  ['Asset.ts', 'criticidadDeclaradaPorId', 'accesoDeclaradoPorId', []],
  ['Asset.ts', 'criticidadDeclaradaEn', 'accesoDeclaradoEn', []],
  ['Location.ts', 'riesgoPersonas', 'porQueEsVital', [['String', 'Bool'], ['string', 'boolean']]],
  ['Location.ts', 'riesgoPersonasMotivo', 'porQueEsVital', []],
];

/** Los nombres que este parche introduce. Sirven para deshacerlo. */
const NOMBRES = [
  ...new Set(CAMPOS.map((c) => c[1])),
  'parametrosCriticidad',
  // Bloque 78: el modelo del evento de falla.
  'failureEvent',
];

function deshacer() {
  let tocados = 0;
  const archivos = [
    ...new Set(CAMPOS.map((c) => path.join(GEN, 'models', c[0]))),
    path.join(GEN, 'internal', 'class.ts'),
  ];
  for (const f of archivos) {
    if (!fs.existsSync(f)) continue;
    const antes = fs.readFileSync(f, 'utf8');
    const despues = antes
      .split('\n')
      .filter((l) => !NOMBRES.some((n) => l.includes(n)))
      .join('\n');
    if (antes !== despues) { fs.writeFileSync(f, despues); tocados++; }
  }
  console.log(`Parche deshecho en ${tocados} archivo(s).`);
}

function aplicar() {
  for (const [archivo, nuevo, copiaDe, subs] of CAMPOS) {
    const f = path.join(GEN, 'models', archivo);
    if (!fs.existsSync(f)) {
      console.log(`  [AVISO] No existe ${archivo}. ¿Cambió la ruta del cliente generado?`);
      continue;
    }
    const original = fs.readFileSync(f, 'utf8');
    if (original.includes(nuevo)) {
      console.log(`  [YA ESTÁ] ${archivo} · ${nuevo}`);
      continue;
    }
    const lineas = original.split('\n');
    const salida = [];
    let copiadas = 0;
    for (const l of lineas) {
      salida.push(l);
      // Sólo las líneas donde el campo aparece como CLAVE, no dentro de otra
      // palabra: `alturaMetros` y `alturaMetrosAlgo` son campos distintos.
      const re = new RegExp(`(^|[^A-Za-z0-9_])${copiaDe}([^A-Za-z0-9_]|$)`);
      if (re.test(l)) {
        let copia = l.split(copiaDe).join(nuevo);
        for (const [de, a] of subs) copia = copia.split(de).join(a);
        salida.push(copia);
        copiadas++;
      }
    }
    fs.writeFileSync(f, salida.join('\n'));
    console.log(`  [OK] ${archivo} · ${nuevo} — ${copiadas} línea(s) copiadas de ${copiaDe}`);
  }

  /* EL MODELO ENTERO VA DISTINTO.
     Duplicar líneas sirve para un CAMPO; para un MODELO nuevo rompió el cliente
     en el bloque 75. Lo correcto son los accesores a mano en `internal/class.ts`.
     `PrismaClient` es un ALIAS de tipo, no una interfaz, así que `declare module`
     tampoco vale. */
  const cls = path.join(GEN, 'internal', 'class.ts');
  const src = fs.readFileSync(cls, 'utf8');
  if (src.includes('parametrosCriticidad')) {
    console.log('  [YA ESTÁ] class.ts · parametrosCriticidad');
  } else {
    const ancla = '  get hojaDeRuta(): Prisma.HojaDeRutaDelegate<ExtArgs, { omit: OmitOpts }>;';
    if (!src.includes(ancla)) {
      console.log('  [AVISO] No encuentro el accesor de hojaDeRuta en class.ts. No se añadió nada.');
      return;
    }
    fs.writeFileSync(cls, src.replace(
      ancla,
      `${ancla}\n\n  /** Bloques 76 y 78 — parche del agente, se pisa al regenerar. */`
      + `\n  get parametrosCriticidad(): any;`
      + `\n  get failureEvent(): any;`,
    ));
    console.log('  [OK] class.ts · parametrosCriticidad · failureEvent');
  }
}

if (process.argv.includes('--deshacer')) deshacer();
else aplicar();
