/* eslint-disable no-console */
/**
 * QUÉ PERMISOS TIENE CADA ROL DE VERDAD, EN LA BASE.
 *
 * =============================================================================
 *  POR QUÉ HACE FALTA ESTO
 * =============================================================================
 *  `verificar-roles.js` compara la SEMILLA, el BACKEND y el FRONTEND, y hace
 *  bien: son tres sitios que dicen lo mismo y nadie los obliga a coincidir.
 *
 *  Pero hay un cuarto sitio que ninguno de los tres mira: LA BASE DE DATOS QUE
 *  ESTÁ CORRIENDO. Desde el bloque 33 la semilla ya no se ejecuta en cada
 *  arranque —a propósito, porque revocaba permisos al correr—, así que un
 *  permiso añadido a la semilla en agosto NO está en una base sembrada en
 *  julio. El código dice una cosa y la base dice otra, y nada avisa.
 *
 *  Eso es lo que tumbó la migración `permiso_purga_definitiva`: exige que
 *  alguien reúna asset.delete + user.manage + role.manage, y en una base vieja
 *  el Jefe de Mantenimiento no tiene el tercero.
 *
 * =============================================================================
 *  ESTO NO CAMBIA NADA. SÓLO MIRA.
 * =============================================================================
 *  No escribe una sola fila. Es un diagnóstico para poder decidir con datos en
 *  vez de suponer, que es justo lo que hay que hacer antes de tocar permisos.
 *
 *      node scripts/diagnostico-roles.js
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/** Los tres que decide la migración del borrado definitivo. */
const LA_TERNA = ['asset.delete', 'user.manage', 'role.manage'];

/** Los que se añadieron tarde y por eso suelen faltar en bases viejas. */
const LOS_NUEVOS = ['purga.definitiva', 'om.mirar', 'zona.intervencion', 'procedimiento.manage'];

async function main() {
  const roles = await prisma.role.findMany({
    orderBy: { name: 'asc' },
    include: { permissions: { include: { permission: { select: { code: true } } } } },
  });

  if (!roles.length) {
    console.log('\n  La tabla de roles está VACÍA. Base recién creada: ejecuta la semilla.\n');
    return;
  }

  const existentes = new Set(
    (await prisma.permission.findMany({ select: { code: true } })).map((p) => p.code),
  );

  console.log('\n================ ROLES EN LA BASE ================\n');

  let conBorrado = 0;
  let conLaTerna = 0;

  for (const r of roles) {
    const suyos = new Set(r.permissions.map((rp) => rp.permission.code));
    const tiene = (c) => (suyos.has(c) ? 'SI' : '--');

    const terna = LA_TERNA.every((c) => suyos.has(c));
    if (suyos.has('asset.delete')) conBorrado++;
    if (terna) conLaTerna++;

    console.log(`  ${r.name}  (${suyos.size} permisos)`);
    console.log(`      asset.delete ${tiene('asset.delete')}   `
      + `user.manage ${tiene('user.manage')}   `
      + `role.manage ${tiene('role.manage')}`
      + (terna ? '   <-- reúne la terna' : ''));

    const faltan = LOS_NUEVOS.filter((c) => !suyos.has(c));
    if (faltan.length) console.log(`      le faltan de los nuevos: ${faltan.join(', ')}`);
    console.log('');
  }

  console.log('================ PERMISOS QUE NO EXISTEN EN LA BASE ================\n');
  const noEstan = [...LA_TERNA, ...LOS_NUEVOS].filter((c) => !existentes.has(c));
  console.log(noEstan.length
    ? `  ${noEstan.join(', ')}`
    : '  Ninguno: los ocho permisos revisados existen en la tabla.');

  console.log('\n================ VEREDICTO ================\n');
  console.log(`  Roles que pueden borrar activos:            ${conBorrado}`);
  console.log(`  Roles que reúnen la terna de administrador: ${conLaTerna}`);
  console.log('');
  if (conBorrado > 0 && conLaTerna === 0) {
    console.log('  Ésta es la razón exacta de que la migración aborte: hay a quién');
    console.log('  darle la llave del borrado definitivo y no se la puede dar a nadie.');
    console.log('  La base está por detrás de la semilla.');
  } else if (conLaTerna > 0) {
    console.log('  La migración debería pasar. Si aborta igual, es otra cosa.');
  }
  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
