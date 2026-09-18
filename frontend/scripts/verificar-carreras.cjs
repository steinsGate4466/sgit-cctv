#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR 21 (frontend) · UNA RESPUESTA VIEJA NO PUEDE TAPAR A LA NUEVA
   -----------------------------------------------------------------------------
   DE DÓNDE SALE (bloque 115)

   Un barrido de las 56 pantallas encontró ONCE efectos que se relanzan al
   cambiar algo —un equipo, una orden, un texto de búsqueda— y que escriben en
   el estado SIN comprobar que su petición siga siendo la buena.

   El peor era `HistorialActivo.tsx`:

       useEffect(() => {
         api.get('/assets/' + assetId + '/historial')
           .then((r) => setD(r.data));      // <-- ¿sigue siendo este equipo?
       }, [assetId]);

   El ingeniero da de alta una OM y cambia el equipo en el desplegable. Se
   lanzan DOS peticiones. Si la primera —la del equipo que ya descartó— llega
   DESPUÉS, es la que se queda en pantalla: la ficha dice una cámara y el
   historial es de otra.

   Y ese componente existe justamente para que nadie intervenga a ciegas. No es
   un fallo de pantalla: es mandar a alguien a campo con la información de otro
   equipo. En `AssetScan` es peor todavía, porque pasa con el QR en la mano y
   con guantes: se escanea una cámara, la señal de planta tarda, se escanea la
   siguiente, y se queda la ficha de la primera.

   -----------------------------------------------------------------------------
   POR QUÉ NO LO CAZA NADA MÁS

   No es un error de tipos: compila. No es un error de lint: la regla de
   dependencias está contenta. No falla en pruebas: en local el servidor
   responde en 2 ms y las peticiones nunca se adelantan. **Sólo aparece con la
   red de planta, que es donde no hay nadie mirando el código.**

   -----------------------------------------------------------------------------
   QUÉ COMPRUEBA

   Todo `useEffect` que:
     1. tenga dependencias (con `[]` no hay carrera: se lanza una sola vez),
     2. pida datos con `api.get` / `api.post`,
     3. y escriba en el estado con un `setAlgo(...)`,
   tiene que llevar una GUARDIA: `let vivo` / `vigente` / `activo`, o un
   `AbortController`.

   React ejecuta la limpieza ANTES de volver a lanzar el efecto, así que la
   misma bandera cierra las dos puertas: el cambio de dependencia y el
   desmontaje.

   -----------------------------------------------------------------------------
   CÓMO EVITA GRITAR DE MÁS (la regla de los verificadores 6, 9 y 14)

   · Con el array de dependencias VACÍO no se mira: esa carga ocurre una sola
     vez y no hay dos respuestas que se puedan cruzar.
   · Sin `api.` no se mira: un efecto que sólo pone un temporizador o escucha
     un evento no tiene nada que cruzar.
   · Sin `set...` no se mira: si no escribe en el estado, la respuesta tardía
     no cambia nada de lo que se ve.
   · Se aceptan los TRES nombres de guardia que el proyecto ya usaba antes de
     este bloque, para no obligar a reescribir lo que ya estaba bien.

   PROBADO REINTRODUCIENDO EL FALLO: quitando la guardia de `HistorialActivo`
   sale con código 1 señalando archivo y línea.
============================================================================= */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\w])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

/** Los nombres de guardia que el proyecto acepta. */
const GUARDIA = /\b(vivo|vigente|activo)\b|AbortController|signal:/;

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', 'generated'].includes(e.name)) continue;
      archivos(p, acc);
    } else if (/\.tsx$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const problemas = [];
for (const f of archivos(SRC)) {
  const t = sinComentarios(fs.readFileSync(f, 'utf8'));
  /* Se lee el efecto entero hasta su array de dependencias. El tope de 900
     caracteres es generoso: los efectos más largos del proyecto no llegan. */
  for (const m of t.matchAll(/useEffect\(\(\)\s*=>\s*\{([\s\S]{0,900}?)\n\s*\},\s*\[([^\]]*)\]\)/g)) {
    const cuerpo = m[1];
    const deps = m[2].trim();
    if (!deps) continue;                              // carga única
    if (!/\bapi\.(get|post|patch|put|delete)\s*[(<]/.test(cuerpo)) continue;
    if (!/\bset[A-Z]\w*\s*\(/.test(cuerpo)) continue;
    if (GUARDIA.test(cuerpo)) continue;
    problemas.push({
      archivo: path.relative(SRC, f).replace(/\\/g, '/'),
      linea: t.slice(0, m.index).split('\n').length,
      deps: deps.replace(/\s+/g, ' ').slice(0, 50),
    });
  }
}

if (!problemas.length) {
  console.log('[verificar:carreras] OK — ningún efecto puede dejar en pantalla una respuesta vieja.');
  process.exit(0);
}

for (const p of problemas) {
  console.error(`  [ERROR] ${p.archivo}:${p.linea} — se relanza con [${p.deps}] y escribe en el estado sin guardia`);
}
console.error(
  `\n${problemas.length} efecto(s) sin guardia.`
  + '\nAl cambiar la dependencia se lanza otra petición. Si la ANTERIOR llega'
  + '\ndespués, es la que se queda en pantalla — y la pantalla dirá una cosa'
  + '\nmientras enseña los datos de otra.'
  + '\n\nSe arregla así:'
  + '\n    let vivo = true;'
  + '\n    api.get(...).then((r) => { if (vivo) setX(r.data); });'
  + '\n    return () => { vivo = false; };\n',
);
process.exit(1);
