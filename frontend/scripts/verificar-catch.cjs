/* =============================================================================
   VERIFICADOR 17 · UNA ESCRITURA NO SE SILENCIA
   =============================================================================

   LA REGLA, escrita en el bloque 77 después de encontrar tres bugs iguales:

     > Un `.catch(() => {})` sobre una ESCRITURA es siempre un bug.
     > Sobre una LECTURA es deuda —el bloque queda vacío—; sobre una escritura
     > es una MENTIRA: la pantalla afirma que algo pasó y no pasó.

   Los tres del bloque 77 fueron:

     1. La contraseña del equipo se perdía en silencio. El activo se creaba,
        la pantalla decía «guardado», y la credencial no estaba en ningún
        sitio. Nadie se enteraba hasta ir a conectarse a la cámara.

     2. Borrar una credencial que no se borraba. **No es comodidad, es
        seguridad**: se da de baja a un contratista, se borran sus accesos, el
        borrado falla, y la contraseña sigue guardada creyendo todos que no.

     3. Borrar una foto que no se borraba. Se recarga, sigue ahí, se vuelve a
        pulsar, sigue. Es literalmente cómo se aprende que un software no
        funciona.

   Se arreglaron los tres. **Nada impedía que volvieran.** Esto lo impide.

   -----------------------------------------------------------------------------
   POR QUÉ NO SE VIGILAN LAS LECTURAS

   Porque el aviso central de `api/client.ts` YA las cubre: el interceptor
   anuncia el fallo de red, el 500 y el 403 —los tres casos en los que una
   lista vacía miente—. Marcar los 103 `.catch(() => [])` de lectura daría 103
   avisos de algo que ya está resuelto en otro sitio.

   > Un verificador que grita cuando no pasa nada se ignora a la semana, y
   > entonces no sirve el día que grita de verdad.

   Se prefiere que se escape algo antes que inventarse un hallazgo. Misma
   regla que `verificar:botones`.
============================================================================= */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');

/** Los métodos que CAMBIAN algo en el servidor. */
const ESCRITURA = /\bapi\.(post|put|patch|delete)\s*(<[^>]*>)?\s*\(/;

/**
 * Un `catch` que se traga el error y devuelve un valor de relleno.
 * `catch((e) => ...)` NO cuenta: ahí alguien está mirando el error.
 */
const SILENCIO = /\.catch\(\s*\(\s*\)\s*=>\s*(\[\]|\{\}|null|undefined|0|false|''|""|\s*)\s*\)/;

/**
 * EXCEPCIONES, cada una con su motivo escrito.
 *
 * Una lista de excepciones sin motivo es una lista que crece sola hasta que el
 * verificador no vigila nada.
 */
const EXCEPCIONES = [
  {
    archivo: 'auth/AuthContext.tsx',
    contiene: '/auth/logout',
    porque:
      'Fuego y olvido A PROPÓSITO. Si el aviso al servidor falla, la sesión '
      + 'local se limpia IGUAL: lo contrario dejaría al usuario dentro de una '
      + 'sesión que él ya dio por cerrada, que es peor que el fallo que se '
      + 'estaría reportando. El servidor la caduca solo.',
  },
];

function sinComentarios(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '');
}

function recorrer(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p, salida);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.spec\.tsx?$/.test(e.name)) salida.push(p);
  }
  return salida;
}

function main() {
  const archivos = recorrer(RAIZ);
  if (!archivos.length) {
    /* Si no encuentra lo que vigila, AVISA en vez de dar luz verde. Un
       verificador que no encuentra su objetivo es un verificador apagado. */
    console.error('[verificar:catch] No encontré ningún archivo en src/. No se comprobó nada.');
    process.exit(2);
  }

  const fallos = [];
  let escrituras = 0;

  for (const abs of archivos) {
    const rel = path.relative(RAIZ, abs).replace(/\\/g, '/');
    const lineas = sinComentarios(fs.readFileSync(abs, 'utf8')).split('\n');

    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      if (!ESCRITURA.test(l)) continue;
      escrituras++;

      /* SE MIRA LA LÍNEA Y LA SIGUIENTE, no una ventana ancha.
         --------------------------------------------------------------------
         Una cadena `api.post(...)` con su `.catch()` encadenado cabe en dos
         líneas cuando el formateador la parte. Más allá de eso ya se está
         leyendo OTRA llamada — que es el fallo que este proyecto ha cometido
         cuatro veces: verificador 9, el de etiquetas, la prueba del bloque 82
         y la del 83. Un patrón más flojo de lo necesario acaba leyendo otra
         cosa. */
      const trozo = l + '\n' + (lineas[i + 1] || '');
      if (!SILENCIO.test(trozo)) continue;

      /* ¿SE USA EL RESULTADO, O SE TIRA?
         --------------------------------------------------------------------
         FALSO POSITIVO DE MI PRIMERA VERSIÓN, cazado al probarla contra el
         código real. En `Assets.tsx` hay esto, y está BIEN:

             const ok = await api.post(...).then(() => true).catch(() => false);
             if (!ok) fallidas.push(f.file.name);
             ...luego avisa con la lista de las que fallaron

         Ahí el `false` NO silencia nada: es el valor con el que se decide, y
         al final se avisa. Marcarlo sería enseñar a ignorar el verificador.

         La señal que separa los dos casos no admite discusión: si el valor se
         ASIGNA o se DEVUELVE, alguien lo va a mirar. Si la llamada está suelta
         como una sentencia, el error se tira a la basura — que es la forma
         exacta de los tres bugs del bloque 77.

         Es la quinta vez que en este proyecto un patrón más flojo de lo
         necesario acaba leyendo otra cosa. */
      const antesDeLaLlamada = l.slice(0, l.search(ESCRITURA));
      const seUsa = /=\s*$|=\s*await\s*$|\breturn\s*$|\breturn\s+await\s*$|[?:]\s*$/
        .test(antesDeLaLlamada.trimEnd())
        || /(^|[^=!<>])=[^=]/.test(antesDeLaLlamada)
        || /^\s*return\b/.test(l);
      if (seUsa) continue;

      const exenta = EXCEPCIONES.find(
        (x) => x.archivo === rel && trozo.includes(x.contiene),
      );
      if (exenta) continue;

      fallos.push({ rel, linea: i + 1, texto: l.trim().slice(0, 110) });
    }
  }

  if (fallos.length) {
    console.error('\n[verificar:catch] Hay escrituras que se tragan el error:\n');
    for (const f of fallos) {
      console.error(`  src/${f.rel}:${f.linea}`);
      console.error(`      ${f.texto}\n`);
    }
    console.error(
      '  Sobre una LECTURA, un catch vacío es deuda: el bloque sale vacío.\n'
      + '  Sobre una ESCRITURA es una MENTIRA: la pantalla dice que algo pasó\n'
      + '  y no pasó. Así se perdió una contraseña de equipo en silencio, y así\n'
      + '  un borrado de credenciales decía haber ido bien sin borrar nada.\n\n'
      + '  Arreglo: avisar con `mensajeDeError(e, ...)`, o —si de verdad da\n'
      + '  igual que falle— añadirlo a EXCEPCIONES con su motivo escrito.\n',
    );
    process.exit(1);
  }

  console.log(
    `Escrituras: ${escrituras} revisadas, ninguna se traga el error `
    + `(${EXCEPCIONES.length} excepción(es) declarada(s) con su motivo).`,
  );
}

main();
