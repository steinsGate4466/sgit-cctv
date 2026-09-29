#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR 29 (frontend) · EL MODO NOCHE NO SE QUEDA A MEDIAS — bloque 157
   -----------------------------------------------------------------------------
   El modo noche sale solo de `styles.css` (scripts/tema-oscuro.mjs). Lo que
   puede romperlo sin que nadie lo note, y lo que se comprueba aquí:

     1. Que el plugin siga enchufado en `vite.config.ts`. Sin él, el build sale
        sin modo noche y el botón «Noche» sólo oscurece los tokens: media
        pantalla blanca a las tres de la mañana.
     2. Que el plugin haga lo que dice: fondo blanco → oscuro, letra oscura →
        clara, el rojo de «caída» se reconoce, y una regla de fondo oscuro (el
        menú) no se toca.
     3. Que cada TOKEN de color de `:root` tenga su pareja en
        `:root[data-tema="oscuro"]`. Un token nuevo sin pareja se queda claro
        de noche.
     4. Que ninguna pantalla escriba un color CLARO a mano en un estilo en
        línea (`'#fee2e2'`…): el plugin no ve los estilos en línea, así que ese
        fondo saldría blanco de noche. Se usa el token (`var(--crit-fondo)`).
        Quedan fuera los dibujos y gráficos (lista abajo, con el motivo).

   PROBADO REINTRODUCIENDO EL FALLO: quitando el plugin de vite.config.ts,
   devolviendo un `'#fee2e2'` a una pantalla y borrando `--ok-fondo` del bloque
   oscuro, sale con código 1 y dice cuál.
============================================================================= */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const fallos = [];

/* Dibujos y gráficos: sus colores son el dibujo (o una serie de un gráfico),
   no un fondo de pantalla. De noche se ven como un dibujo sobre fondo oscuro. */
const DIBUJOS = ['Ilustraciones.tsx', 'MapaRed.tsx', 'CamaraCaida.tsx', 'Indicadores.tsx', 'Dashboard.tsx', 'Inventory.tsx', 'Mapeo.tsx'];

function luz(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

(async () => {
  // 1. El plugin, enchufado.
  const vite = fs.readFileSync(path.join(RAIZ, 'vite.config.ts'), 'utf8');
  if (!/import temaOscuro from '\.\/scripts\/tema-oscuro\.mjs'/.test(vite) || !/plugins:\s*\[\s*temaOscuro\(\)/.test(vite)) {
    fallos.push('vite.config.ts no usa el plugin temaOscuro(): el build saldría sin modo noche.');
  }

  // 2. El plugin hace lo que dice.
  const { valorDeNoche, luz: luzDe, default: temaOscuro } = await import('./tema-oscuro.mjs');
  const postcss = require(path.join(RAIZ, 'node_modules', 'postcss'));
  const caso = (prop, valor) => valorDeNoche(prop, valor);
  const fondo = caso('background', '#ffffff');
  if (!fondo || luzDe(fondo) > 0.2) fallos.push(`Plugin: un fondo blanco debería oscurecerse y da ${fondo}.`);
  const texto = caso('color', '#1f2733');
  if (!texto || luzDe(texto) < 0.7) fallos.push(`Plugin: una letra oscura debería aclararse y da ${texto}.`);
  const rojo = caso('color', '#dc2626');
  if (rojo && Math.abs(luzDe(rojo) - luzDe('#dc2626')) > 0.2) fallos.push(`Plugin: el rojo de estado cambió demasiado (${rojo}).`);
  const salida = postcss([temaOscuro()]).process(
    '.sidebar a { color: #b6c4dc; } .x { background: #fff; color: #333; } .y { background: #1f4e79; color: #fff; }',
    { from: undefined },
  ).css;
  if (/oscuro"\]\) \.sidebar/.test(salida)) fallos.push('Plugin: tocó una regla del menú lateral, que ya es oscuro.');
  if (!/oscuro"\]\) \.x/.test(salida)) fallos.push('Plugin: no generó la versión de noche de una regla con fondo blanco.');
  if (/oscuro"\]\) \.y/.test(salida)) fallos.push('Plugin: dio la vuelta a una regla con fondo fuerte (quedaría clara de noche).');

  // Cobertura sobre la hoja real.
  const css = fs.readFileSync(path.join(RAIZ, 'src', 'styles.css'), 'utf8');
  const real = postcss([temaOscuro()]).process(css, { from: undefined }).css;
  const generadas = (real.match(/:where\(:root\[data-tema="oscuro"\]\)/g) || []).length;
  if (generadas < 300) fallos.push(`Plugin: sólo generó ${generadas} reglas de noche (esperadas 300+).`);

  // 3. Cada token de color tiene pareja de noche.
  const raiz = postcss.parse(css);
  // Vale la ÚLTIMA definición de cada token (`--e1` empezó siendo una sombra y
  // hoy es un espaciado: no pide pareja de noche).
  const ultimo = new Map();
  const oscuros = new Set();
  raiz.walkRules((r) => {
    const esClaro = /^:root$/.test(r.selector.trim());
    const esOscuro = /^:root\[data-tema="oscuro"\]$/.test(r.selector.trim());
    if (!esClaro && !esOscuro) return;
    r.walkDecls((d) => {
      if (!d.prop.startsWith('--')) return;
      if (esOscuro) oscuros.add(d.prop);
      else ultimo.set(d.prop, d.value);
    });
  });
  const claros = new Set([...ultimo].filter(([, v]) => /#[0-9a-f]{3,6}\b|rgba?\(/i.test(v)).map(([t]) => t));
  const sinPareja = [...claros].filter((t) => !oscuros.has(t));
  if (sinPareja.length) fallos.push(`Tokens de color sin pareja de noche: ${sinPareja.join(', ')}.`);

  // 4. Nada de colores claros a mano en las pantallas.
  const archivos = [];
  const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p); else if (p.endsWith('.tsx')) archivos.push(p);
  });
  recorrer(path.join(RAIZ, 'src'));
  for (const f of archivos) {
    if (DIBUJOS.some((d) => f.endsWith(d))) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
      for (const m of linea.matchAll(/['"](#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})['"]/g)) {
        if (luz(m[1]) > 0.85) fallos.push(`${path.relative(RAIZ, f)}:${i + 1} escribe ${m[1]} a mano: de noche saldría claro. Usa un token (var(--…-fondo)).`);
      }
    });
  }

  if (fallos.length) {
    console.error('Modo noche:\n  · ' + fallos.join('\n  · '));
    process.exit(1);
  }
  console.log(`Modo noche: plugin activo, ${generadas} reglas de noche, ${claros.size} tokens con pareja, sin colores claros a mano.`);
})();
