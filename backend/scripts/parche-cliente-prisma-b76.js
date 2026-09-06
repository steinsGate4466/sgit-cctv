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
  // Bloque 82: el contador que corta el acceso.
  ['User.ts', 'permisosVersion', 'active', [['Bool', 'Int'], ['boolean', 'number']]],
  /* Bloque 94: quién SOLICITÓ la orden. Hacen falta LOS DOS —la RELACIÓN y la
     clave— y en ESTE orden, no al revés:

     `aplicar()` se salta una entrada si el archivo ya contiene el nombre
     nuevo, y `createdById` CONTIENE `createdBy`. Puestas al revés, la segunda
     saldría como «[YA ESTÁ]» y la relación no se añadiría nunca — el typecheck
     fallaría con «'createdBy' does not exist in type WorkOrderInclude», que es
     el error que un include inválido produce, y que además invalida el tipo
     del resultado ENTERO (la lección del `name` del bloque 6). */
  ['WorkOrder.ts', 'createdBy', 'openedBy', []],
  ['WorkOrder.ts', 'createdById', 'openedById', []],
];

/**
 * Los nombres que este parche introduce EN LOS ARCHIVOS DE MODELO.
 *
 * ------------------------------------------------------------------------
 * FALLO GRAVE QUE COMETÍ AQUÍ, Y LA REGLA QUE DEJA (bloque 82)
 *
 * Esta lista llevaba también `parametrosCriticidad` y `failureEvent` —los dos
 * MODELOS nuevos— porque el parche añade sus accesores en `class.ts`.
 *
 * Pero `deshacer()` borra TODA línea que contenga uno de estos nombres, EN
 * TODOS los archivos de la lista. Y el cliente generado ya conocía esos
 * modelos: `User.ts` tenía su propio bloque `User$parametrosCriticidadArgs`,
 * legítimo, escrito por Prisma.
 *
 * Al deshacer, se llevó por delante ese bloque y **rompió `User.ts` con veinte
 * errores de sintaxis** que no mencionaban el nombre por ningún lado. Hubo que
 * reconstruirlo a mano.
 *
 * > **REGLA: un parche reversible por construcción sólo es seguro si los
 * > nombres que introduce NO EXISTÍAN ANTES en los archivos que toca.**
 * > Con los CAMPOS se cumple —son nuevos—. Con los MODELOS no, porque Prisma
 * > los usa en las relaciones de otros modelos.
 *
 * Por eso los nombres de modelo se deshacen SÓLO en `class.ts`, que es el
 * único archivo donde este parche los escribe.
 * ------------------------------------------------------------------------
 */
const NOMBRES = [...new Set(CAMPOS.map((c) => c[1]))];

/**
 * LA MARCA — bloque 95. Aquí está el arreglo de fondo.
 * ---------------------------------------------------------------------------
 * ESTO YA ROMPIÓ EL CLIENTE DOS VECES, y las dos por lo mismo: `deshacer()`
 * borraba toda línea que CONTUVIERA uno de los nombres, y Prisma escribe esos
 * mismos nombres en código legítimo suyo.
 *
 *   Bloque 82 · `parametrosCriticidad` es un MODELO, y `User.ts` tenía su
 *               propio bloque `User$parametrosCriticidadArgs`. El deshacer se
 *               lo llevó por delante.
 *   Bloque 94 · yo añadí `createdBy`, que es una RELACIÓN. Prisma genera en
 *               `WorkOrder.ts`:
 *
 *                   export type WorkOrder$createdByArgs<…> = {
 *                     select?: Prisma.UserSelect<ExtArgs> | null
 *                     …
 *                   }
 *
 *               El deshacer borró la línea de apertura —contiene `createdBy`—
 *               y dejó el cuerpo huérfano: cinco errores de sintaxis que NO
 *               mencionan `createdBy` por ningún lado.
 *
 * Escribí la regla en el 82 —«sólo es seguro si los nombres que introduce NO
 * EXISTÍAN ANTES»— y la rompí yo mismo en el 94. Una regla que hay que
 * acordarse de cumplir es un agujero con fecha.
 *
 * **Así que ya no se deshace por NOMBRE: se deshace por MARCA.** Cada línea
 * que este parche inserta lleva un comentario al final, y `deshacer()` borra
 * ÚNICAMENTE las líneas que lo llevan. Ahora sí es reversible por
 * construcción, diga lo que diga el nombre del campo.
 */
const MARCA = '// @parche-b76';

function deshacer() {
  let tocados = 0;
  let sinMarca = 0;
  const archivos = [
    ...new Set(CAMPOS.map((c) => path.join(GEN, 'models', c[0]))),
    path.join(GEN, 'internal', 'class.ts'),
  ];
  for (const f of archivos) {
    if (!fs.existsSync(f)) continue;
    const antes = fs.readFileSync(f, 'utf8');
    if (!antes.includes(MARCA)) { sinMarca++; continue; }
    const despues = antes
      .split('\n')
      .filter((l) => !l.includes(MARCA))
      .join('\n');
    if (antes !== despues) { fs.writeFileSync(f, despues); tocados++; }
  }
  console.log(`Parche deshecho en ${tocados} archivo(s).`);
  if (sinMarca) {
    console.log(`  ${sinMarca} archivo(s) sin marcas del parche: NO se tocan.`);
    console.log('  (Un cliente recién generado no lleva marcas. Deshacer sobre él');
    console.log('   no debe borrar nada — eso fue lo que rompió el cliente antes.)');
  }
}

function aplicar() {
  for (const [archivo, nuevo, copiaDe, subs] of CAMPOS) {
    const f = path.join(GEN, 'models', archivo);
    if (!fs.existsSync(f)) {
      console.log(`  [AVISO] No existe ${archivo}. ¿Cambió la ruta del cliente generado?`);
      continue;
    }
    const original = fs.readFileSync(f, 'utf8');
    /* «YA ESTÁ» se decide por la MARCA, no por el nombre — la otra mitad del
       fallo del bloque 94. Prisma genera `WorkOrder$createdByArgs` en este
       mismo archivo, así que `original.includes('createdBy')` daba SIEMPRE
       cierto y el parche se saltaba las líneas que sí tenía que añadir. El
       typecheck fallaba con «'createdBy' does not exist in WorkOrderInclude»,
       que no menciona el parche por ningún lado. */
    const yaPuesto = original.split('\n').some((l) => l.includes(MARCA) && l.includes(nuevo));
    if (yaPuesto) {
      console.log(`  [YA ESTÁ] ${archivo} · ${nuevo}`);
      continue;
    }
    const lineas = original.split('\n');
    const salida = [];
    let copiadas = 0;
    for (const l of lineas) {
      salida.push(l);
      /* Sólo las líneas donde el campo es una CLAVE al principio de la línea:
         `  active: boolean`, `  active?: true`.

         La primera versión aceptaba el nombre en CUALQUIER posición, y con
         `active` eso incluyó una línea gigante de `UserOmit` donde el campo
         aparece dentro de una unión de literales de texto. Duplicarla rompió
         el archivo entero con veinte errores de sintaxis que NO mencionaban a
         `active` por ningún lado.

         Es el mismo error de las ventanas anchas del verificador 9: cuanto más
         permisivo es el patrón, más cosas que no son lo que busca acaba
         cazando. */
      const re = new RegExp(`^\\s*${copiaDe}\\??\\s*:`);
      if (re.test(l)) {
        let copia = l.split(copiaDe).join(nuevo);
        for (const [de, a] of subs) copia = copia.split(de).join(a);
        /* La marca es lo que hace el parche reversible por construcción. */
        salida.push(`${copia}  ${MARCA}`);
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
  if (src.includes(MARCA)) {
    console.log('  [YA ESTÁ] class.ts · parametrosCriticidad');
  } else {
    const ancla = '  get hojaDeRuta(): Prisma.HojaDeRutaDelegate<ExtArgs, { omit: OmitOpts }>;';
    if (!src.includes(ancla)) {
      console.log('  [AVISO] No encuentro el accesor de hojaDeRuta en class.ts. No se añadió nada.');
      return;
    }
    fs.writeFileSync(cls, src.replace(
      ancla,
      /* NI UNA LÍNEA EN BLANCO SIN MARCA: al deshacer se quedaba puesta y el
         archivo ya no volvía EXACTO al original. Se ve con un `diff`, y por
         eso la prueba compara byte a byte en vez de «parece igual». */
      `${ancla}`
      + `\n  get parametrosCriticidad(): any;  ${MARCA}`
      + `\n  get failureEvent(): any;  ${MARCA}`
      + `\n  get metaMantenimiento(): any;  ${MARCA}`,
    ));
    console.log('  [OK] class.ts · parametrosCriticidad · failureEvent · metaMantenimiento');
  }
}

if (process.argv.includes('--deshacer')) deshacer();
else aplicar();
