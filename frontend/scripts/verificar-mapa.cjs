/* =============================================================================
   VERIFICADOR 28 (frontend) — EL MAPA VE Y MANDA, NO HACE
   -----------------------------------------------------------------------------
   Bloque 151. El mapa es la pantalla de monitoreo de Producción, Técnica y
   Mantenimiento. Regla §58: una pantalla de resumen VE y MANDA al módulo donde
   se trabaja; no crea, no cierra, no borra. Si el mapa empezara a escribir, la
   misma acción viviría en dos sitios con dos reglas distintas.

   COMPRUEBA que `pages/Mapa.tsx` y todo `components/mapa/*` NO llaman a
   `api.post / put / patch / delete`. El editor de planos (`pages/PlanosEditor`)
   sí escribe —es donde se preparan los planos— y por eso NO está en la lista.

   PROBADO REINTRODUCIENDO EL FALLO: con un `api.post(` dentro de
   `components/mapa/TarjetaEquipo.tsx` sale con código 1 diciendo dónde.

   BLOQUE 159 · LA EXCEPCIÓN ACORDADA, Y SÓLO ÉSA. Reportar una falla se hace
   desde el mapa (proceso de Producción del plan del 28/09), con LOS MISMOS
   formularios del QR. Por eso el mapa puede importar `ReportarCaida` y
   `ReportarAveria` y ningún otro componente de fuera de `components/mapa/`
   que no esté en la lista de abajo. Un formulario nuevo de escritura metido
   en la tarjeta sale aquí. Probado importando `BorrarDefinitivo`.
============================================================================= */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const sinComentarios = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^\s*\/\/.*$/gm, '');

const archivos = [path.join(SRC, 'pages', 'Mapa.tsx')];
const dir = path.join(SRC, 'components', 'mapa');
if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/\.tsx?$/.test(f)) archivos.push(path.join(dir, f));

/* Componentes de fuera que el mapa puede usar: los de dibujo y los DOS
   formularios de reporte del QR. Nada más. */
const PERMITIDOS = new Set(['Iconos', 'DibujoEquipo', 'ReportarCaida', 'ReportarAveria']);

const fallos = [];
for (const f of archivos) {
  if (!fs.existsSync(f)) { fallos.push(`${path.relative(SRC, f)} no existe.`); continue; }
  const texto = sinComentarios(fs.readFileSync(f, 'utf8'));
  for (const m of texto.matchAll(/from\s+'([^']+)'/g)) {
    const ruta = m[1];
    const esComponente = /(^|\/)components\//.test(ruta) || (/^\.\.\/[A-Z]/.test(ruta) && f.includes(path.join('components', 'mapa')));
    if (!esComponente || ruta.includes('/mapa/') || ruta.startsWith('./')) continue;
    const nombre = ruta.split('/').pop();
    if (!PERMITIDOS.has(nombre)) fallos.push(`${path.relative(SRC, f)} importa ${nombre}: el mapa sólo usa los formularios de reporte del QR.`);
  }
  const lineas = texto.split('\n');
  lineas.forEach((l, i) => {
    if (/\bapi\s*\.\s*(post|put|patch|delete)\s*\(/.test(l)) {
      fallos.push(`${path.relative(SRC, f)}:${i + 1} escribe desde el mapa: ${l.trim().slice(0, 90)}`);
    }
  });
}

if (fallos.length) {
  console.error('\nMapa: el mapa ve y manda, no hace (§58).\n');
  for (const x of fallos) console.error('   · ' + x);
  console.error('\nLas acciones van en su módulo; desde la tarjeta se ENLAZA a él.\n');
  process.exit(1);
}
console.log(`Mapa: ${archivos.length} archivos del mapa, ninguno escribe. Ve y manda.`);
