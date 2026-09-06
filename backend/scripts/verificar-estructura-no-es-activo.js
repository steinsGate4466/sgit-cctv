#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR 14 (backend) · UN GABINETE NO ES UN ACTIVO
   -----------------------------------------------------------------------------
   DE DÓNDE SALE. El usuario lo vio en pantalla: en el desplegable de «Tipo» al
   dar de alta un activo salían GABINETE y TABLERO ELÉCTRICO. Los dos son
   ESTRUCTURA y los dos tienen YA su propio modelo y su propia pantalla:

       Cabinet            → «Gabinetes»
       TableroElectrico   → «Electricidad»

   O sea: el mismo gabinete se podía crear por dos caminos. Dos verdades, y la
   segunda se queda vieja. Es el error del bloque 74 con la fibra, con otra
   cara — y por eso este verificador tiene la misma forma que aquél.

   -----------------------------------------------------------------------------
   LO QUE **NO** HACE, Y ES DELIBERADO

   No prohíbe la palabra CABINET en todo el proyecto. Sería un falso positivo
   garantizado: la estructura SÍ lleva hoja de ruta —el Excel del ingeniero
   trae una hoja «FORMATO GABINETE» con quince pasos—, y además hay registros
   viejos que hay que poder PINTAR y FILTRAR.

   Se vigilan sólo los sitios donde se ELIGE el tipo AL CREAR UN ACTIVO, más
   la lista maestra que los reparte por familia.

   -----------------------------------------------------------------------------
   Probado reintroduciendo el fallo: se devuelve CABINET a la lista de alta y
   sale con código 1, archivo y línea.
============================================================================= */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const verde = (t) => `\x1b[32m${t}\x1b[0m`;

/** Lo que es ESTRUCTURA y por tanto no se crea como activo. */
const ESTRUCTURA = ['CABINET', 'TABLERO_ELECTRICO'];

const hallazgos = [];
const apunta = (archivo, linea, texto) => hallazgos.push({ archivo, linea, texto });

/** Quita comentarios para no leer las explicaciones como si fueran código. */
const sinComentarios = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^\s*\/\/.*$/gm, '');

const leer = (rel) => {
  const ruta = path.join(RAIZ, rel);
  if (!fs.existsSync(ruta)) {
    /* Si el archivo se movió se AVISA en vez de dar luz verde: un verificador
       que no encuentra lo que vigila es un verificador apagado. */
    apunta(rel, 0, 'No se encuentra el archivo. ¿Se movió? Actualiza este verificador.');
    return null;
  }
  return sinComentarios(fs.readFileSync(ruta, 'utf8'));
};

/* ── 1 · LA LISTA MAESTRA los reparte por familia ────────────────────────────
   Las dos copias —backend y frontend— tienen que decir lo mismo. Si una
   marcara el gabinete como ACTIVO, el formulario ofrecería un tipo que el
   servidor rechaza; y al revés es peor, porque se guardaría algo que la
   pantalla no sabe pintar. */
for (const rel of [
  'backend/src/common/tipos-de-equipo.ts',
  'frontend/src/tipos-de-equipo.ts',
]) {
  const src = leer(rel);
  if (!src) continue;
  for (const tipo of ESTRUCTURA) {
    const re = new RegExp(`valor:\\s*'${tipo}'[^}]*familia:\\s*'([A-Z]+)'`);
    const m = src.match(re);
    if (!m) {
      apunta(rel, 0, `${tipo} no aparece en la lista maestra. Tiene que estar, marcado como ESTRUCTURA: si desaparece, los registros viejos se pintan con el código en crudo.`);
    } else if (m[1] !== 'ESTRUCTURA') {
      apunta(rel, src.slice(0, src.indexOf(m[0])).split('\n').length,
        `${tipo} está marcado como ${m[1]} y es ESTRUCTURA: tiene su propio modelo y su propia pantalla.`);
    }
  }
}

/* ── 2 · DONDE SE ELIGE EL TIPO AL CREAR, la lista sale de TIPOS_ACTIVO ──────
   Se comprueba que la lista se DERIVA y no está escrita a mano. Una lista
   literal vuelve a desincronizarse en cuanto alguien añada un tipo. */
const DONDE_SE_CREA = [
  {
    archivo: 'frontend/src/pages/Assets.tsx',
    que: 'el desplegable de «Tipo» del alta de activos',
    debeUsar: /const TYPES\s*=\s*TIPOS_ACTIVO\.map/,
  },
  {
    archivo: 'frontend/src/pages/Instalaciones.tsx',
    que: 'el desplegable de equipo al pedir una instalación',
    debeUsar: /TIPOS_ACTIVO\.map/,
  },
];

for (const sitio of DONDE_SE_CREA) {
  const src = leer(sitio.archivo);
  if (!src) continue;
  if (!sitio.debeUsar.test(src)) {
    apunta(sitio.archivo, 0,
      `${sitio.que} ya no se deriva de TIPOS_ACTIVO. Escrita a mano vuelve a desincronizarse: es como entraron GABINETE y TABLERO ELÉCTRICO.`);
    continue;
  }
  for (const tipo of ESTRUCTURA) {
    /* Un literal suelto del tipo en ese archivo sólo es fallo si está DENTRO
       de una lista de opciones de alta. Se busca el patrón que de verdad
       duele: el valor entre comillas dentro de un array. */
    const re = new RegExp(`\\[[^\\]]*'${tipo}'[^\\]]*\\]`);
    const m = src.match(re);
    if (m) {
      apunta(sitio.archivo, src.slice(0, src.indexOf(m[0])).split('\n').length,
        `${tipo} vuelve a estar en una lista de ${sitio.que}.`);
    }
  }
}

/* ── 3 · EL SERVIDOR TAMBIÉN LO COMPRUEBA ────────────────────────────────────
   Si sólo lo supiera el formulario, una petición hecha a mano seguiría
   creando gabinetes como activos y nadie sabría por dónde entraron. Es la
   lección del bloque 16: la fuente de verdad la usan LOS DOS lados. */
const servicio = leer('backend/src/modules/assets/assets.service.ts');
if (servicio && !/motivoParaNoCrearComoActivo\s*\(/.test(servicio)) {
  apunta('backend/src/modules/assets/assets.service.ts', 0,
    'El alta de activos ya no llama a `motivoParaNoCrearComoActivo`. Sin esa guarda, la comprobación vive sólo en el desplegable.');
}

/* ── Informe ─────────────────────────────────────────────────────────────── */
if (hallazgos.length) {
  console.error(rojo('\n  UN GABINETE NO ES UN ACTIVO — hallazgos:\n'));
  for (const h of hallazgos) {
    console.error(`   ${h.archivo}${h.linea ? `:${h.linea}` : ''}`);
    console.error(`      ${h.texto}\n`);
  }
  console.error(rojo('  La estructura se da de alta en su propia pantalla («Gabinetes», «Electricidad»).'));
  console.error(rojo('  Sí lleva hoja de ruta — eso vive en «Hojas de ruta», en su grupo aparte.\n'));
  process.exit(1);
}

console.log(verde('Activo y estructura, separados: el alta sólo ofrece activos y el servidor lo comprueba.'));
