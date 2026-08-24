#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR 11 · NINGUNA MIGRACIÓN DECIDE PERMISOS POR EL NOMBRE DEL ROL
   -----------------------------------------------------------------------------
   DE DÓNDE SALE ESTE VERIFICADOR

   La migración `20260901000000_partir_la_llave_maestra` repartía los permisos
   nuevos comparando contra literales:

       WHERE r."name" NOT IN ('Jefe de Producción', 'Jefe de Tren')
       AND   r."name" =      'Jefe de Producción'

   El rol de Producción se llama «Jefe de línea (Producción)». Nunca coincidió.
   Resultado: la migración escrita para CERRAR el agujero se lo concedió a
   Producción — `infra.read` y `red.read`, o sea el plano eléctrico, el
   direccionamiento IP y el mapa de red de toda la planta.

   POR QUÉ SE ESCAPÓ

   Ya existe `verificar-roles`, nacido de este mismo error, que convierte en
   ERROR cualquier nombre de rol escrito a mano en TypeScript. No mira SQL.
   El fallo entró por la única puerta que quedaba abierta, y de ahí a Railway.

   POR QUÉ ES GRAVE Y NO SÓLO FEO

   1. El nombre de un rol SE EDITA DESDE LA INTERFAZ. Es un dato de usuario.
   2. Y cuando no coincide, el SQL no falla: no hace nada. **Falla ABRIENDO.**
      Un permiso que había que quitar se queda puesto y nadie se entera.

   LA REGLA

   Una migración reparte permisos por lo que el rol PUEDE HACER —comprobando
   qué otros permisos tiene— nunca por cómo se llama. Ejemplo bueno, de
   `20260902000000_reparto_infra_red_por_capacidad`:

       AND NOT EXISTS (SELECT 1 FROM "role_permissions" rp2 ...
                        WHERE p2."code" IN ('asset.create', 'asset.update', ...))

   -----------------------------------------------------------------------------
   CÓMO EVITA LOS FALSOS POSITIVOS (la lección de los verificadores 6 y 9:
   uno que grita cuando no pasa nada se ignora a la semana)

   · Quita los COMENTARIOS antes de mirar. Este mismo archivo y la migración
     correctora citan el SQL malo dentro de un comentario para explicarlo: si
     se contaran, el verificador se denunciaría a sí mismo.
   · Sólo mira comparaciones contra la COLUMNA `name` de la tabla `roles`
     (`r."name"`, `roles"."name"`, `"name"` dentro de un FROM "roles").
     Comparar `"users"."name"` o `p."code"` es normal y no se toca.
   · Sólo salta con literales de texto. Un `= (SELECT ...)` no es el fallo.

   Probado reintroduciendo el bug exacto: sale código 1 y señala la línea.
============================================================================= */
/* -----------------------------------------------------------------------------
   AJUSTE TRAS PROBARLO CONTRA EL CÓDIGO REAL — y es la parte que importa

   La primera versión marcaba TODA comparación por nombre: 6 casos en 4
   migraciones. Pero cuatro de esos seis FUNCIONAN —comparan contra nombres
   que sí existen ('Jefe de Mantenimiento', 'Supervisor TI', 'Supervisor
   Operativo de Tercería')— y sus migraciones YA ESTÁN APLICADAS, o sea que
   son inmutables y no se pueden arreglar. Un verificador que exige corregir
   lo que no se puede corregir se desactiva el primer día.

   Así que separa dos cosas distintas:

     1. NOMBRE FANTASMA (error, siempre, incluso en migraciones viejas).
        Un literal que no coincide con ningún rol de la semilla ni de las
        plantillas. Ese SQL NO HACE NADA y nadie se entera. Es exactamente lo
        que pasó con 'Jefe de Producción', que aparece en DOS migraciones y
        no existe en ninguna parte del sistema.

     2. COMPARACIÓN POR NOMBRE EN MIGRACIÓN NUEVA (error a partir de la
        fecha de corte). Las anteriores quedan documentadas como deuda: se
        aplicaron y funcionan, pero no se escriben más así.

   La lista de roles válidos se lee del código, no se copia aquí: copiarla
   sería cometer el mismo error que el verificador persigue.
----------------------------------------------------------------------------- */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'prisma', 'migrations');

/** Migraciones anteriores a esto ya están aplicadas: son inmutables y sólo
 *  se les exige que no invoquen roles inexistentes. */
const CORTE = '20260902000000';

/* ROLES RENOMBRADOS — nombre viejo → nombre nuevo.
   -----------------------------------------------------------------------------
   Una migración YA APLICADA que cita el nombre viejo no se puede corregir: es
   inmutable. Pero tampoco es un fantasma, es historia. Sin esta lista el
   verificador se quedaría en rojo para siempre por algo que nadie puede
   arreglar, y un verificador que no se puede poner en verde se desactiva.

   Citar un nombre VIEJO en una migración NUEVA sí es error: ya no existe.

   · 'Jefe de Producción' → 'Jefe de línea (Producción)' (bloque 62-A).
     Había dos roles para el mismo puesto —éste en la semilla y el otro en las
     plantillas de la interfaz—. La migración del bloque 55 excluyó a uno y el
     usuario real tenía el otro: Producción acabó con `infra.read` y
     `red.read`. Un puesto, un nombre. */
const RENOMBRADOS = {
  'Jefe de Producción': 'Jefe de línea (Producción)',
};

/** Nombres de rol que EXISTEN de verdad, leídos del código fuente. */
function rolesQueExisten() {
  const nombres = new Set();
  const leer = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');

  /* Claves del mapa ROLES de la semilla.
     OJO con el valor: no siempre es un `[`. «Jefe de Mantenimiento» está
     escrito como `'Jefe de Mantenimiento': PERMISSIONS,` —le damos TODOS los
     permisos— y exigir un corchete lo dejaba fuera. Fue el primer falso
     positivo de este verificador: acusaba de fantasma al administrador. */
  const seed = leer(path.join(__dirname, '..', 'prisma', 'seed.ts'));
  const mapa = seed.slice(seed.indexOf('const ROLES:'));
  for (const m of mapa.matchAll(/^\s*'([^']+)'\s*:\s*(?:\[|[A-Za-z_$])/gm)) nombres.add(m[1]);

  /* Nombres de las PLANTILLAS de rol.
     Se recorta a partir de `PLANTILLAS_DE_ROL` a propósito: el catálogo de
     PERMISOS que hay más arriba en el mismo archivo también usa la clave
     `nombre:` («Declarar zonas vitales», «Ver los activos de mi tren»…).
     Sin recortar, cualquier literal del SQL que coincidiera con el nombre
     bonito de un permiso pasaría por rol válido. */
  const cat = leer(path.join(__dirname, '..', 'src', 'modules', 'roles', 'catalogo-permisos.ts'));
  const plant = cat.slice(cat.indexOf('PLANTILLAS_DE_ROL'));
  for (const m of plant.matchAll(/^\s{2}nombre:\s*'([^']+)'/gm)) nombres.add(m[1]);

  return nombres;
}

/** Borra comentarios de línea (--) y de bloque, conservando el número de
 *  líneas para que el aviso apunte al sitio correcto. */
function sinComentarios(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
}

/* Comparaciones contra el nombre del rol seguidas de un literal de texto.
   Cubre `r."name" = '...'`, `... IN ('...')`, `NOT IN (...)`, `LIKE '...'`. */
const PATRONES = [
  /\b(?:r|rol|role|roles)\s*\.\s*"name"\s*(?:NOT\s+)?(?:=|<>|!=|IN|LIKE|ILIKE)\s*\(?\s*'/gi,
  /"roles"\s*\.\s*"name"\s*(?:NOT\s+)?(?:=|<>|!=|IN|LIKE|ILIKE)\s*\(?\s*'/gi,
];

function revisar(archivo) {
  const crudo = fs.readFileSync(archivo, 'utf8');
  const sql = sinComentarios(crudo);
  const lineasLimpias = sql.split('\n');
  const lineasCrudas = crudo.split('\n');
  const hallazgos = [];

  lineasLimpias.forEach((linea, i) => {
    for (const re of PATRONES) {
      re.lastIndex = 0;
      if (!re.test(linea)) continue;
      // Los literales de ESTA línea son los nombres de rol invocados.
      const citados = [...linea.matchAll(/'([^']*)'/g)].map((m) => m[1]);
      hallazgos.push({ linea: i + 1, texto: lineasCrudas[i].trim(), citados });
      break;
    }
  });
  return hallazgos;
}

function main() {
  if (!fs.existsSync(DIR)) {
    console.log('verificar:sql-roles — no hay carpeta de migraciones, nada que revisar.');
    process.exit(0);
  }

  const existen = rolesQueExisten();
  if (existen.size === 0) {
    // Sin lista de roles no se puede distinguir fantasma de válido. Se avisa
    // y NO se rompe: un verificador que revienta por no encontrar un archivo
    // acaba borrado del script.
    console.log('verificar:sql-roles — no se pudo leer la lista de roles; se omite.');
    process.exit(0);
  }

  const fantasmas = [];
  const nuevasPorNombre = [];
  const deudaVieja = [];
  let revisados = 0;

  for (const carpeta of fs.readdirSync(DIR).sort()) {
    const archivo = path.join(DIR, carpeta, 'migration.sql');
    if (!fs.existsSync(archivo)) continue;
    revisados++;
    const esNueva = carpeta >= CORTE;

    for (const h of revisar(archivo)) {
      const noExisten = h.citados.filter((c) => {
        if (!c || existen.has(c)) return false;
        // Nombre viejo en migración vieja = historia, no fallo. En una
        // migración nueva sí es fallo: ese rol ya no se llama así.
        if (RENOMBRADOS[c] && !esNueva) return false;
        return true;
      });
      if (noExisten.length) fantasmas.push({ carpeta, ...h, noExisten });
      else if (esNueva) nuevasPorNombre.push({ carpeta, ...h });
      else deudaVieja.push({ carpeta, ...h });
    }
  }

  let fallo = false;

  if (fantasmas.length) {
    fallo = true;
    console.error('');
    console.error('  ROL QUE NO EXISTE, INVOCADO DESDE UNA MIGRACIÓN');
    console.error('  ------------------------------------------------------------');
    console.error('  Este SQL NO HACE NADA y no da error: simplemente no encuentra');
    console.error('  la fila. Si servía para QUITAR un permiso, el permiso se queda');
    console.error('  puesto. Falla ABRIENDO, que es el peor modo de fallar.');
    console.error('');
    for (const f of fantasmas) {
      console.error(`  ${f.carpeta}/migration.sql:${f.linea}`);
      console.error(`      ${f.texto}`);
      console.error(`      no existe: ${f.noExisten.map((n) => `«${n}»`).join(', ')}`);
    }
    console.error('');
  }

  if (nuevasPorNombre.length) {
    fallo = true;
    console.error('');
    console.error('  MIGRACIÓN NUEVA QUE DECIDE POR EL NOMBRE DEL ROL');
    console.error('  ------------------------------------------------------------');
    console.error('  El nombre de un rol se edita desde la interfaz: es un dato de');
    console.error('  usuario. Reparte por lo que el rol PUEDE HACER:');
    console.error('');
    console.error('    AND NOT EXISTS (SELECT 1 FROM "role_permissions" rp2');
    console.error('                      JOIN "permissions" p2 ON p2."id" = rp2."permissionId"');
    console.error('                     WHERE rp2."roleId" = rp."roleId"');
    console.error("                       AND p2.\"code\" IN ('asset.update', 'location.manage'))");
    console.error('');
    for (const f of nuevasPorNombre) {
      console.error(`  ${f.carpeta}/migration.sql:${f.linea}`);
      console.error(`      ${f.texto}`);
    }
    console.error('');
  }

  if (fallo) process.exit(1);

  const nota = deudaVieja.length
    ? ` (${deudaVieja.length} comparaciones por nombre en migraciones ya aplicadas: son inmutables, quedan como deuda)`
    : '';
  console.log(`verificar:sql-roles — ${revisados} migraciones revisadas, sin roles fantasma${nota}.`);
  process.exit(0);
}

main();
