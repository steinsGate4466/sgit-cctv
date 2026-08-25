/* =============================================================================
   VERIFICADOR 14 (frontend) — UN BOTÓN APAGADO TIENE QUE DECIR QUÉ FALTA
   -----------------------------------------------------------------------------
   DE DÓNDE SALE

   Bloque 67. La amiga desarrolladora del usuario probó el software y apuntó
   que hay botones que no hacen nada y no explican por qué. El barrido
   encontró 80 botones que se apagan solos; en 32 el apagado no era «estoy
   guardando» sino «falta un dato», y ninguno decía cuál.

   Un `disabled` de verdad no se puede pulsar, no se puede enfocar y NO
   DISPARA NINGÚN EVENTO: no hay forma de preguntarle. El usuario mira el
   formulario, no encuentra la diferencia, y concluye que el software está
   roto. Que es exactamente lo que pasó en la exposición.

   -----------------------------------------------------------------------------
   QUÉ MIRA, Y POR QUÉ ASÍ Y NO DE OTRA MANERA

   Distinguir «apagado porque falta un dato» de «apagado porque está
   guardando» con una expresión regular es imposible en general: `ocupado`,
   `guardando`, `saving` y `enviando` se llaman de veinte formas.

   Así que no se intenta. Se busca UNA señal que no admite discusión:

       la condición de `disabled` COMPRUEBA EL CONTENIDO de un campo
       —`.trim()`, `.length`, `.includes(`—

   Un indicador de «estoy guardando» nunca llama a `.trim()`. Si la condición
   mira el contenido, entonces el botón está apagado porque falta algo, y
   entonces hay que decir qué.

   Esto deja fuera casos legítimos que también deberían avisar (`!elegida`,
   `!medio`). Es a propósito: **prefiero que se me escapen tres antes que
   inventarme uno.** Un verificador que grita cuando no pasa nada se ignora a
   la semana, y entonces no sirve el día que grita de verdad. Esa regla ya
   está escrita en CLAUDE.md tres veces.

   -----------------------------------------------------------------------------
   CÓMO SE PASA

   Con `<BotonConMotivo falta={...}>`, que se puede pulsar y contesta. O, si
   de verdad hace falta un `disabled`, poniéndole un `title` que lo explique.

   PROBADO REINTRODUCIENDO EL FALLO: se convierte un `BotonConMotivo` en un
   `<button disabled={x.trim().length < 3}>` y sale con código 1 señalando el
   archivo y la línea.
============================================================================= */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');

/** Comprobar el CONTENIDO de un campo. Un «estoy guardando» no hace esto. */
const MIRA_CONTENIDO = /\.trim\s*\(|\.length|\.includes\s*\(/;

function recorrer(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p, salida);
    else if (e.name.endsWith('.tsx')) salida.push(p);
  }
  return salida;
}

/* Se limpian comentarios antes de mirar. Un ejemplo dentro de un comentario
   no es código, y contarlo fue la causa de falsos positivos en el
   verificador 9. */
function sinComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Devuelve la etiqueta `<button ...>` completa desde `i`, contando llaves. */
function etiquetaDesde(s, i) {
  let llaves = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '{') llaves++;
    else if (c === '}') llaves--;
    else if (c === '>' && llaves === 0) return s.slice(i, k + 1);
  }
  return null;
}

const hallazgos = [];

for (const archivo of recorrer(RAIZ)) {
  /* El propio componente es la solución, no el problema. */
  if (archivo.endsWith('BotonConMotivo.tsx')) continue;

  const bruto = fs.readFileSync(archivo, 'utf8');
  const s = sinComentarios(bruto);

  let desde = 0;
  for (;;) {
    const i = s.indexOf('<button', desde);
    if (i === -1) break;
    desde = i + 7;

    const et = etiquetaDesde(s, i);
    if (!et) continue;

    const m = et.match(/disabled=\{([\s\S]*)\}/);
    if (!m) continue;
    if (!MIRA_CONTENIDO.test(m[1])) continue;      // es un «estoy guardando»
    if (/\btitle=/.test(et)) continue;             // ya explica por qué

    hallazgos.push({
      archivo: path.relative(RAIZ, archivo),
      linea: s.slice(0, i).split('\n').length,
      cond: m[1].replace(/\s+/g, ' ').trim().slice(0, 80),
    });
  }
}

if (!hallazgos.length) {
  console.log('Botones: ninguno se apaga por falta de dato sin decir cuál.');
  process.exit(0);
}

console.log(`Botones: ${hallazgos.length} se apagan por falta de un dato y no dicen cuál.\n`);
for (const h of hallazgos) {
  console.log(`   ${h.archivo}:${h.linea}`);
  console.log(`      disabled={${h.cond}}`);
}
console.log(`
Un boton apagado no dispara ningun evento: no hay forma de preguntarle
por que. Usa <BotonConMotivo falta={...}>, que se puede pulsar y contesta.
Si de verdad tiene que ir apagado, ponle un title que lo explique.`);
process.exit(1);
