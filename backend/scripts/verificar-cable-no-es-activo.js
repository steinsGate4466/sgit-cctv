/* =============================================================================
   VERIFICADOR 12 (backend) — UN CABLE NO ES UN ACTIVO
   -----------------------------------------------------------------------------
   DE DÓNDE SALE

   Bloque 74. Palabras del usuario: «el cableado no es un activo que se
   considere, por favor revisa bien, un cableado NO ES UN ACTIVO».

   Y tenía razón, pero además tenía razón contra el código: `FIBER` estaba en
   la lista de tipos que se ofrecen al dar de alta un equipo, tanto en Activos
   como en Instalaciones. O sea que se podía crear una fibra como si fuera un
   aparato, con su ficha, su QR y su historial de mantenimiento.

   -----------------------------------------------------------------------------
   LA REGLA, que es la 1 del estándar de activos

       UN ACTIVO es un aparato que se mantiene, se avería y se reemplaza por
       otro igual: tiene marca, modelo y serie, se le hace una rutina, y se
       pide como repuesto con un código.

       UN CABLE es lo que CONECTA dos activos. Se compra por metro, no tiene
       serie y no se le hace mantenimiento. Se declara en «Conexiones».

   Cuando un tramo se corta, la orden NO se abre sobre el cable: se abre sobre
   el equipo que se quedó sin comunicación. Eso es lo que se hace en planta y
   es lo que el sistema tiene que reflejar.

   -----------------------------------------------------------------------------
   POR QUÉ NO SE BORRA `FIBER` DE LA BASE Y SÓLO SE PROHÍBE SU USO

   Los valores de un enum de PostgreSQL **sólo se pueden AÑADIR**, nunca quitar
   ni renombrar — está escrito en CLAUDE.md desde el principio, y es una de las
   trampas que ya mordió. Si hubiera un solo activo cargado como fibra,
   quitarlo del enum rompería la tabla entera.

   Así que se prohíbe donde se CREA. El valor sigue existiendo para que los
   registros viejos no se caigan, y este verificador impide que alguien lo
   vuelva a ofrecer sin darse cuenta.

   -----------------------------------------------------------------------------
   PROBADO REINTRODUCIENDO EL FALLO: se vuelve a poner 'FIBER' en la lista de
   Activos y sale con código 1 diciendo el archivo y la línea.
============================================================================= */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');

/* Los sitios donde se ELIGE el tipo al crear un equipo. No se barre todo el
   proyecto a propósito: `FIBER` es legítimo en las tablas de traducción —hay
   que poder pintar «Fibra» si existe un registro viejo— y marcarlas sería un
   falso positivo. Lo que se prohíbe es OFRECERLO al dar de alta. */
const DONDE_SE_CREA = [
  {
    archivo: 'frontend/src/pages/Assets.tsx',
    que: 'la lista de tipos del formulario de alta',
    patron: /const TYPES\s*=\s*\[([^\]]*)\]/,
  },
  {
    archivo: 'backend/src/modules/instalacion/dto/instalacion.dto.ts',
    que: 'los tipos que puede pedir una instalación',
    patron: /'UPS',[\s\S]{0,400}?'OTHER',/,
  },
];

/** Todo lo que es cable y no aparato. Si mañana aparece otro, va aquí. */
const NO_SON_ACTIVOS = ['FIBER'];

const hallazgos = [];

for (const sitio of DONDE_SE_CREA) {
  const ruta = path.join(RAIZ, sitio.archivo);
  if (!fs.existsSync(ruta)) {
    /* Si el archivo se movió, se avisa y NO se da luz verde en silencio: un
       verificador que no encuentra lo que vigila es un verificador apagado. */
    hallazgos.push({
      archivo: sitio.archivo,
      linea: 0,
      texto: 'No se encuentra el archivo. ¿Se movió? Actualiza este verificador.',
    });
    continue;
  }

  const src = fs.readFileSync(ruta, 'utf8');
  /* Se limpian los comentarios: este mismo archivo explica por qué `FIBER` no
     va, y esas menciones no son código. */
  const codigo = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '');

  const m = codigo.match(sitio.patron);
  if (!m) {
    hallazgos.push({
      archivo: sitio.archivo,
      linea: 0,
      texto: `No se encuentra ${sitio.que}. Actualiza este verificador.`,
    });
    continue;
  }

  for (const prohibido of NO_SON_ACTIVOS) {
    if (m[0].includes(`'${prohibido}'`)) {
      hallazgos.push({
        archivo: sitio.archivo,
        linea: codigo.slice(0, codigo.indexOf(m[0])).split('\n').length,
        texto: `${prohibido} está en ${sitio.que}.`,
      });
    }
  }
}

if (!hallazgos.length) {
  console.log('Cable: ningún tipo de cableado se ofrece como activo al dar de alta.');
  process.exit(0);
}

console.log(`Cable: ${hallazgos.length} sitio(s) donde un cable se puede crear como activo.\n`);
for (const h of hallazgos) console.log(`   ${h.archivo}:${h.linea}\n      ${h.texto}`);
console.log(`
UN CABLE NO ES UN ACTIVO: es lo que CONECTA dos activos. No tiene serie, no
se le hace rutina y no se pide como repuesto con codigo. Va en «Conexiones».

Cuando un tramo se corta, la orden se abre sobre el EQUIPO que se quedo sin
comunicacion, no sobre el cable.`);
process.exit(1);
