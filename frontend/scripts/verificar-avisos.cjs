/* eslint-disable no-console */
/**
 * VERIFICADOR 19 — LOS AVISOS SE TIENEN QUE ANUNCIAR.
 *
 * =============================================================================
 *  DE QUÉ FALLO REAL NACE
 * =============================================================================
 *  En la auditoría del bloque 47 se contaron 44 avisos de resultado repartidos
 *  por 15 pantallas. NINGUNO tenía `role`.
 *
 *  Eso significa que, cuando alguien pulsa «Guardar» y el servidor contesta
 *  «falta el número de PETAR», el mensaje aparece en pantalla y un lector de
 *  pantalla no lo dice jamás: para el navegador es un `div` cualquiera que
 *  cambió. La persona pulsa, no pasa nada aparente, y vuelve a pulsar.
 *
 *  Y no es sólo cuestión de accesibilidad. En el celular, con el formulario
 *  largo y el aviso arriba del todo, el técnico tampoco lo ve: pulsa Guardar
 *  tres veces creyendo que la aplicación se colgó.
 *
 *  `role="alert"`  -> lo interrumpe todo para decirlo. Para errores.
 *  `role="status"` -> lo dice cuando haya un hueco. Para «guardado».
 *
 *  La diferencia importa: si un «guardado correctamente» interrumpiera la
 *  lectura cada vez, se acabaría desactivando el lector entero.
 *
 * =============================================================================
 *  Y EL SEGUNDO FALLO: EL CURSOR AL REVÉS
 * =============================================================================
 *  `cursor: pointer` estaba en `.aviso-ok`, que se lo daba también a los que
 *  no se cierran al tocarlos, mientras los avisos de error que SÍ se cierran
 *  no daban ninguna pista. Ahora la mano la pone `.aviso-cerrable`, y este
 *  verificador comprueba que esa clase esté exactamente donde hay un onClick.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');

/** Todos los .tsx, recursivo. */
function tsx(dir) {
  const salida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...tsx(p));
    else if (e.name.endsWith('.tsx')) salida.push(p);
  }
  return salida;
}

/**
 * Recorta la etiqueta de apertura completa, respetando las llaves de JSX.
 *
 * No vale con buscar el primer `>`: un `onClick={() => setX('')}` no lleva
 * ninguno, pero `style={{ a: b > c }}` sí, y cortar ahí partiría la etiqueta
 * por la mitad. Con un contador de llaves esto no se equivoca.
 */
function etiqueta(texto, desde) {
  let llaves = 0;
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i];
    if (c === '{') llaves++;
    else if (c === '}') llaves--;
    else if (c === '>' && llaves === 0) return texto.slice(desde, i + 1);
  }
  return texto.slice(desde);
}

const ROL_QUE_TOCA = { ok: 'status', error: 'alert' };

const fallos = [];
let revisados = 0;
let cerrables = 0;

for (const archivo of tsx(RAIZ)) {
  const texto = fs.readFileSync(archivo, 'utf8');
  const rel = path.relative(path.join(__dirname, '..'), archivo).replace(/\\/g, '/');

  const re = /<div\b[^>]*?className="aviso-(ok|error)/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    // Retrocede hasta el '<' de esta etiqueta para cogerla entera.
    const inicio = texto.lastIndexOf('<', m.index);
    const tag = etiqueta(texto, inicio);
    const linea = texto.slice(0, inicio).split('\n').length;
    const tipo = m[1];
    const donde = `${rel}:${linea}`;
    revisados++;

    const esperado = ROL_QUE_TOCA[tipo];
    const rol = /role="([a-z]+)"/.exec(tag);
    if (!rol) {
      fallos.push(`${donde}  aviso-${tipo} sin role. Debe llevar role="${esperado}".`);
    } else if (rol[1] !== esperado) {
      fallos.push(
        `${donde}  aviso-${tipo} lleva role="${rol[1]}" y le toca role="${esperado}".`
        + (tipo === 'error'
          ? ' Un error tiene que interrumpir; "status" espera un hueco que quizá no llegue.'
          : ' Un "guardado" no debe interrumpir la lectura cada vez.'),
      );
    }

    const tieneClic = tag.includes('onClick');
    const tieneClase = tag.includes('aviso-cerrable');
    if (tieneClic) cerrables++;
    if (tieneClic && !tieneClase) {
      fallos.push(
        `${donde}  se cierra al tocarlo pero no lleva "aviso-cerrable": `
        + 'sale sin cursor de mano y nadie sabe que se puede quitar.',
      );
    }
    if (!tieneClic && tieneClase) {
      fallos.push(
        `${donde}  lleva "aviso-cerrable" y no tiene onClick: `
        + 'mano que no hace nada al pulsar.',
      );
    }
  }
}

console.log(`\nAvisos: ${revisados} revisados, ${cerrables} se cierran al tocarlos.`);

if (fallos.length) {
  console.error(`\n${fallos.length} aviso(s) mal declarados:\n`);
  for (const f of fallos) console.error(`   ${f}`);
  console.error(
    '\nUn aviso sin `role` no se anuncia: la persona pulsa Guardar, no oye nada'
    + '\ny vuelve a pulsar. Errores -> role="alert". Confirmaciones -> role="status".',
  );
  process.exit(1);
}

console.log('Todos se anuncian, y la mano está sólo donde hay algo que pulsar.');
