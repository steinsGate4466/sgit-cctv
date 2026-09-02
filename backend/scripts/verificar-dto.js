/* =============================================================================
   VERIFICADOR 13 (backend) · NINGÚN ENDPOINT NUEVO SIN VALIDAR
   =============================================================================

   EL PROBLEMA, que es el hallazgo S-05 de la auditoría OWASP:

     > Con `@Body() dto: any` **el ValidationPipe no valida NADA**.

   Y ahí está lo traicionero, porque a primera vista parece que sí: el pipe
   corre con `whitelist` **y** `forbidNonWhitelisted`, que es la configuración
   correcta. Pero esas dos opciones actúan sobre los METADATOS de una clase
   DTO. Sin clase, no hay metadatos que aplicar: **el objeto entra tal cual,
   con los campos que traiga y del tamaño que traiga.**

   Ya está escrito en CLAUDE.md desde la auditoría del bloque 16:

     > `data: {...dto}` es seguro SI HAY CLASE DTO. Con `@Body(): any` no hay
     > metadatos y no valida nada: ahí sí es un agujero.

   -----------------------------------------------------------------------------
   POR QUÉ ESTE VERIFICADOR TIENE UNA LISTA QUE SÓLO PUEDE ENCOGER

   Eran 53. Escribir 53 clases DTO de golpe es la clase de cambio que rompe
   producción sin que nadie lo vea: con `forbidNonWhitelisted`, un DTO al que
   se le olvide UN campo **rechaza peticiones válidas con un 400**, y el
   formulario deja de guardar sin decir por qué.

   Así que la deuda se CONGELA y se drena por módulos:

     · Los que están en `DEUDA` se toleran, y su número es el techo.
     · Cualquiera que NO esté en la lista es un ERROR.
     · Y si la lista tiene MÁS entradas de las que quedan en el código,
       también es un error: significa que alguien arregló uno y no lo quitó
       de aquí, y la lista dejaría de reflejar la realidad.

   Esa última comprobación es la que hace que la lista encoja de verdad. Sin
   ella, la deuda se «arregla» sola en el papel y nadie se entera.
============================================================================= */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');

/** `@Body() loQueSea: any` — con o sin nombre de propiedad delante. */
const SIN_VALIDAR = /@Body\(\s*\)\s*[a-zA-Z_$][\w$]*\s*:\s*any\b/;

/* =============================================================================
   DEUDA DECLARADA — bloque 85
   -----------------------------------------------------------------------------
   Esta lista SÓLO PUEDE ENCOGER. Al cerrar un módulo, se baja su número aquí.
   Si alguien lo sube, el cambio se ve en la revisión y hay que justificarlo.

   Orden de drenaje elegido, y no es por tamaño: **por lo que la acción
   AFIRMA.** Es la misma regla que decide los permisos en este proyecto.

     HECHO   auth, users, roles  →  reparten poder y cortan accesos
     1º      criticidad          →  reordena el mantenimiento de la planta
     2º      maintenance         →  órdenes: firma, materiales, cierre
     3º      inventory, acceso   →  tocan almacén y permisos de acceso
     el resto, por volumen
============================================================================= */
const DEUDA = {
  'modules/electricidad/electricidad.controller.ts': 6,
  'modules/checklist/checklist.controller.ts': 5,
  'modules/procedimientos/procedimientos.controller.ts': 4,
  'modules/maintenance/preparacion.controller.ts': 4,
  'modules/maintenance/maintenance.controller.ts': 3,
  'modules/criticidad/criticidad.controller.ts': 3,
  'modules/campanas/campanas.controller.ts': 3,
  'modules/zonas/zonas.controller.ts': 2,
  /* TRES, no dos. Mi medición a mano decía dos: el `grep` con el que conté
     usaba `[a-zA-Z]*` para el nombre del parámetro y NO casaba `_b`, que
     lleva guion bajo (`@Body() _b: any`, línea 126).

     Lo cazó este verificador al primer intento, y es justo para lo que sirve:
     **una medición a ojo se equivoca, un verificador no.** La deuda real eran
     54, no 53. */
  'modules/notificaciones/notificaciones.controller.ts': 3,
  'modules/monitoreo/monitoreo.controller.ts': 2,
  'modules/ipam/ipam.controller.ts': 2,
  'modules/inventory/inventory.controller.ts': 2,
  'modules/catalogos/catalogos.controller.ts': 2,
  'modules/acceso/acceso.controller.ts': 2,
  'modules/network/network.controller.ts': 1,
  'modules/hojas-ruta/hojas-ruta.controller.ts': 1,
};

function sinComentarios(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '');
}

function recorrer(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p, salida);
    else if (e.name.endsWith('.controller.ts')) salida.push(p);
  }
  return salida;
}

function main() {
  const controladores = recorrer(RAIZ);
  if (!controladores.length) {
    /* Si no encuentra lo que vigila, AVISA en vez de dar luz verde. */
    console.error('[verificar:dto] No encontré ningún .controller.ts. No se comprobó nada.');
    process.exit(2);
  }

  const encontrados = {};
  for (const abs of controladores) {
    const rel = path.relative(RAIZ, abs).replace(/\\/g, '/');
    const lineas = sinComentarios(fs.readFileSync(abs, 'utf8')).split('\n');
    const suyas = [];
    lineas.forEach((l, i) => { if (SIN_VALIDAR.test(l)) suyas.push(i + 1); });
    if (suyas.length) encontrados[rel] = suyas;
  }

  const nuevos = [];
  const arreglados = [];

  for (const [rel, lineas] of Object.entries(encontrados)) {
    const tope = DEUDA[rel] ?? 0;
    if (lineas.length > tope) {
      nuevos.push({ rel, tope, hay: lineas.length, lineas });
    }
  }
  /* La otra mitad: los que se arreglaron y siguen en la lista. Sin esto, la
     deuda se «arregla» en el papel y nadie se entera. */
  for (const [rel, tope] of Object.entries(DEUDA)) {
    const hay = (encontrados[rel] || []).length;
    if (hay < tope) arreglados.push({ rel, tope, hay });
  }

  if (nuevos.length) {
    console.error('\n[verificar:dto] Endpoints SIN VALIDAR que no estaban declarados:\n');
    for (const n of nuevos) {
      console.error(`  src/${n.rel}  —  hay ${n.hay}, el tope declarado es ${n.tope}`);
      console.error(`      líneas: ${n.lineas.join(', ')}\n`);
    }
    console.error(
      '  Con `@Body() dto: any` el ValidationPipe NO VALIDA NADA: sin clase\n'
      + '  DTO no hay metadatos que aplicar, y el objeto entra tal cual.\n\n'
      + '  Arreglo: escribe la clase DTO mirando QUÉ LEE EL SERVICIO, no lo que\n'
      + '  parezca. Un campo que falte hace que `forbidNonWhitelisted` rechace\n'
      + '  peticiones válidas con un 400, y el formulario deja de guardar sin\n'
      + '  decir por qué.\n',
    );
    process.exit(1);
  }

  if (arreglados.length) {
    console.error('\n[verificar:dto] La lista de deuda está desfasada — bájala:\n');
    for (const a of arreglados) {
      console.error(`  src/${a.rel}: declara ${a.tope} y ya sólo quedan ${a.hay}.`);
    }
    console.error(
      '\n  Se arreglaron y no se anotó. Baja el número en DEUDA (o quita la\n'
      + '  línea si ya es cero): una lista que no encoge deja de significar nada.\n',
    );
    process.exit(1);
  }

  const total = Object.values(encontrados).reduce((s, l) => s + l.length, 0);
  console.log(
    `DTO: ${controladores.length} controladores · ${total} endpoints sin validar, `
    + 'todos declarados como deuda. Ninguno nuevo.',
  );
}

main();
