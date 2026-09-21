/**
 * VERIFICADOR 27 · LA ZONA MUERTA DEL `const` — bloque 128.
 * ===========================================================================
 *
 *  DE DÓNDE SALE
 *  -------------
 *  En «Avance de órdenes» escribí esto:
 *
 *      function titular() { ... lee `r` ... }
 *      const tit = titular();     // <- la llamada
 *      const filas = d?.data;
 *      const r = d?.resumen;      // <- `r` se declara DESPUÉS
 *
 *  `function` sube; `const` NO. Al llamar a `titular()` antes de la línea de
 *  `r`, la lectura cae en la zona muerta temporal y lanza
 *  «Cannot access 'r' before initialization».
 *
 *  POR QUÉ NO LO VIO NADIE
 *  -----------------------
 *  TypeScript lo da por bueno: para el compilador `r` existe en el ámbito.
 *  El lint tampoco lo marca. En desarrollo la pantalla se veía. Sólo reventó
 *  en el build de producción y, con los nombres minificados, el mensaje decía
 *  «Cannot access 'B'», que no señala nada.
 *
 *  Una pantalla entera caída, en el peor momento posible, por el ORDEN DE DOS
 *  LÍNEAS. Eso es exactamente lo que tiene que cazar un verificador.
 *
 *  QUÉ COMPRUEBA
 *  -------------
 *  Por cada `function nombre()` declarada dentro de un componente:
 *  busca su llamada `nombre()` y comprueba que TODA constante del componente
 *  que esa función lee esté declarada ANTES de esa llamada.
 *
 *  Probado reintroduciendo el fallo: devolviendo las tres líneas de
 *  `TableroOm.tsx` a su orden anterior, este verificador falla.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');
const fallos = [];

function archivos(dir) {
  const salida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...archivos(p));
    else if (/\.tsx?$/.test(e.name)) salida.push(p);
  }
  return salida;
}

for (const archivo of archivos(RAIZ)) {
  const crudo = fs.readFileSync(archivo, 'utf8');

  /* LOS COMENTARIOS SE BORRAN ANTES DE MIRAR NADA, conservando los saltos de
     línea para que los números que se imprimen sigan siendo los del archivo.
     Sin esto, el propio comentario que explica el arreglo —«`titular()` LEE
     `r`»— se contaba como la llamada. Un verificador que lee comentarios lee
     ficción. */
  const texto = crudo
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (c) => ' '.repeat(c.length));
  const lineas = texto.split('\n');

  /* LOS ÁMBITOS SE SEPARAN PRIMERO, y ésta fue la lección al escribirlo: la
     primera versión avisó de `Roles.tsx` porque leía un `const nombre` de OTRO
     componente del mismo archivo. Un verificador que se equivoca es peor que no
     tenerlo (bloque 9), así que aquí cada componente de nivel 0 es su propio
     mundo y nada se compara entre dos. */
  const arranques = [];
  lineas.forEach((l, i) => {
    if (/^(export\s+default\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(l)) arranques.push(i);
  });
  if (!arranques.length) continue;

  const ambitos = arranques.map((desde, k) => ({
    desde,
    hasta: k + 1 < arranques.length ? arranques[k + 1] - 1 : lineas.length - 1,
  }));

  for (const ambito of ambitos) {
    const dentro = (i) => i >= ambito.desde && i <= ambito.hasta;

    const funciones = [];
    lineas.forEach((l, i) => {
      if (!dentro(i)) return;
      const m = l.match(/^  function\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (m) funciones.push({ nombre: m[1], desde: i });
    });
    if (!funciones.length) continue;

    /* Constantes del componente. Se queda con la PRIMERA declaración: si el
       nombre ya existía arriba, la de abajo es otra variable de otro bloque y
       la lectura de la función apunta a la de arriba. */
    const declarado = new Map();
    lineas.forEach((l, i) => {
      if (!dentro(i)) return;
      /* SÓLO la sangría del cuerpo del componente (dos espacios). Ésta fue la
         segunda lección: la primera versión no cazó el fallo real porque dentro
         de `cargar()` hay otro `const r = await api.get(...)` con más sangría, lo
         tomó por la declaración de `r` y la dio por hecha antes de tiempo. Un
         `const` de un bloque interior es OTRA variable. */
      const m = l.match(/^  const\s+([A-Za-z_$][\w$]*)\s*[:=]/);
      if (m && !declarado.has(m[1])) declarado.set(m[1], i);
    });

    for (const f of funciones) {
      let profundidad = 0; let fin = f.desde;
      for (let i = f.desde; i <= ambito.hasta; i++) {
        profundidad += (lineas[i].match(/\{/g) || []).length;
        profundidad -= (lineas[i].match(/\}/g) || []).length;
        if (i > f.desde && profundidad <= 0) { fin = i; break; }
      }
      const cuerpo = lineas.slice(f.desde, fin + 1).join('\n');

      let llamada = -1;
      for (let i = fin + 1; i <= ambito.hasta; i++) {
        if (/^  /.test(lineas[i]) && new RegExp(`\\b${f.nombre}\\s*\\(`).test(lineas[i])) { llamada = i; break; }
      }
      if (llamada === -1) continue;

      for (const [nombre, linea] of declarado) {
        if (linea <= llamada) continue;
        if (!new RegExp(`\\b${nombre}\\b`).test(cuerpo)) continue;
        fallos.push(
          `${path.relative(RAIZ, archivo)}: «${f.nombre}()» se llama en la línea `
          + `${llamada + 1} y lee «${nombre}», que no se declara hasta la línea `
          + `${linea + 1}. En el build de producción esto tumba la pantalla.`,
        );
      }
    }
  }
}

if (fallos.length) {
  console.error('\n  ZONA MUERTA DEL const — la pantalla reventará en producción:\n');
  fallos.forEach((f) => console.error(`   · ${f}`));
  console.error('\n  Arreglo: mover la declaración ARRIBA de la llamada.\n');
  process.exit(1);
}
console.log(`verificar:tdz — ${archivos(RAIZ).length} archivos, ningún const leído antes de declararse.`);
