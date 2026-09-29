/* =============================================================================
   MODO NOCHE · el tema oscuro sale SOLO de `styles.css` — bloque 157
   -----------------------------------------------------------------------------
   POR QUÉ ASÍ Y NO A MANO

   `styles.css` tiene unas 4 500 líneas y ~470 colores escritos en las reglas
   (fondos de aviso, bordes, textos de estado). Escribir a mano la versión
   oscura de cada uno sería otra hoja entera que se desincroniza en cuanto
   alguien toca la clara: la regla nueva saldría blanca en plena noche, en el
   púlpito, que es justo donde el modo oscuro hace falta.

   Así que este plugin de PostCSS la genera EN CADA BUILD:

     1. Recorre cada regla. Si un valor lleva un color escrito (#rgb, #rrggbb,
        rgb/rgba o `white`), añade justo debajo la misma regla con el color
        «pasado a noche», colgada de `:where(:root[data-tema="oscuro"])`.
        `:where()` no suma especificidad: la regla nueva pesa lo mismo que la
        original y gana sólo por ir detrás. Los `:hover`, `.act`, etc. siguen
        ganando como en el tema claro.
     2. Cada color se transforma según PARA QUÉ se usa:
          · fondo claro  → fondo oscuro con el mismo matiz (un aviso rojo
            claro pasa a rojo profundo, no a gris);
          · texto oscuro → texto claro con el mismo matiz;
          · borde claro  → borde oscuro tenue;
          · los tonos medios (el rojo de «caída», el verde de «ok») casi no
            se tocan: son la señal y tienen que seguir reconociéndose.
     3. `color: var(--navy)` / `var(--steel)` (azul como TEXTO) pasa a
        `var(--tinta-marca)`: el azul marino sirve de fondo, no de letra
        sobre negro.

   LO QUE NO TOCA
     · Las reglas que ya pintan un FONDO OSCURO o de color fuerte (menú lateral,
       franja de marca, pastillas activas, lienzo del plano): ya son de noche,
       y darles la vuelta las dejaría blancas.
     · El texto blanco: casi siempre va sobre un color fuerte (botón, pastilla).
     · Sombras, `@keyframes` y el bloque `:root` (los tokens de la noche están
       escritos a mano en `styles.css`, en `:root[data-tema="oscuro"]`).
     · Cualquier regla con el comentario `/* tema: fijo *\/` dentro.

   PROBADO: `test-tema-oscuro.mjs` (verificar:tema) comprueba que el fondo
   blanco pasa a oscuro, el texto oscuro a claro, que el rojo de estado se
   reconoce y que una regla de fondo oscuro no se toca. Y reintroduciendo el
   fallo (quitar el plugin del build) el verificador dice cuántas reglas se
   quedan sin versión de noche.
============================================================================= */

export const PREFIJO = ':where(:root[data-tema="oscuro"])';

/* Zonas que ya son oscuras en los dos temas: no se invierten. */
const SIEMPRE_OSCURO = [
  '.sidebar', '.login-brandside', '.lb-', '.lienzo-plano', '.cam-foto', '.mapa-escenario',
  '.marcador-cuerpo', '.marcador-marca', '.cono', '.lp-', '.brand',
  // Los dibujos de los aparatos (bloque 162): un NVR es gris de día y de noche.
  '.eq-',
];

const HEX = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const RGB = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)/g;

function aRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
export function aHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
function deHsl([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}
const hex2 = (n) => n.toString(16).padStart(2, '0');
const aHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
export const luz = (css) => aHsl(css.startsWith('#') ? aRgb(css) : css.match(/\d+/g).slice(0, 3).map(Number))[2];

/** Qué papel juega el color según la propiedad. */
function papelDe(prop) {
  if (/^background|^fill$/.test(prop)) return 'fondo';
  if (/border|outline|column-rule|^stroke$|text-decoration/.test(prop)) return 'borde';
  if (/^color$|caret-color|accent-color/.test(prop)) return 'texto';
  return null; // sombras, filtros, etc.
}

/** Pasa un color [r,g,b] a su versión de noche según el papel. */
export function aNoche(rgb, papel) {
  const [h, s0, l] = aHsl(rgb);
  let s = s0, nl = l;
  if (papel === 'fondo') {
    if (l >= 0.85) { nl = 0.105 + (1 - l) * 0.9; s = Math.min(s0, 0.55) * 0.75; }
    else if (l >= 0.6) { nl = 0.16 + (1 - l) * 0.35; s = s0 * 0.7; }
    else return rgb; // tono medio u oscuro: es una señal, se respeta
  } else if (papel === 'texto') {
    if (l >= 0.93) return rgb; // blanco sobre color: se queda
    if (l < 0.45) { nl = Math.max(0.74, 1 - l * 0.75); s = Math.min(s0, 0.85); }
    else if (l < 0.62) nl = 0.66;
    else return rgb;
  } else if (papel === 'borde') {
    if (l >= 0.8) { nl = 0.2 + (1 - l) * 0.5; s = s0 * 0.6; }
    else if (l < 0.35) nl = 1 - l * 0.9;
    else return rgb;
  }
  /* Los grises y el blanco no tienen matiz: invertidos salían gris carbón
     (#1b1b1b), que desentona con el azul noche de las tarjetas. Se les da el
     matiz de la marca (azul 220°) con poca saturación. */
  let hh = h;
  if (s0 < 0.12) {
    hh = 220;
    s = papel === 'fondo' ? 0.42 : papel === 'borde' ? 0.3 : 0.18;
  }
  return deHsl([hh, s, Math.min(0.95, Math.max(0.04, nl))]);
}

/** Transforma todos los colores de un valor. Devuelve null si no había ninguno. */
export function valorDeNoche(prop, valor) {
  const papel = papelDe(prop);
  if (!papel) return null;
  let toco = false;
  let v = valor.replace(/\bwhite\b/g, '#ffffff');
  v = v.replace(HEX, (m) => { toco = true; return aHex(aNoche(aRgb(m), papel)); });
  v = v.replace(RGB, (m, r, g, b, a) => {
    toco = true;
    const [nr, ng, nb] = aNoche([+r, +g, +b], papel);
    return a != null ? `rgba(${nr}, ${ng}, ${nb}, ${a})` : `rgb(${nr}, ${ng}, ${nb})`;
  });
  if (papel === 'texto' && /var\(--(navy|navy-2|steel)\)/.test(v)) {
    v = v.replace(/var\(--(navy|navy-2|steel)\)/g, 'var(--tinta-marca)');
    toco = true;
  }
  return toco && v !== valor ? v : null;
}

const fondoFuerte = (regla) => regla.nodes?.some((d) => d.type === 'decl' && /^background/.test(d.prop)
  && [...d.value.matchAll(HEX)].some(([m]) => luz(m) < 0.6));

function prefijar(selector) {
  return selector.split(',').map((s) => {
    const t = s.trim();
    if (/^(html|:root)\b/.test(t)) return t.replace(/^(html|:root)/, '$1:where([data-tema="oscuro"])');
    return `${PREFIJO} ${t}`;
  }).join(', ');
}

export default function temaOscuro() {
  return {
    postcssPlugin: 'sgit-tema-oscuro',
    Once(root, { Rule }) {
      const nuevas = [];
      root.walkRules((regla) => {
        if (regla.parent?.type === 'atrule' && /keyframes/.test(regla.parent.name)) return;
        if (regla.selector.startsWith(PREFIJO) || /data-tema/.test(regla.selector)) return;
        if (/^:root\s*$/.test(regla.selector)) return;
        if (SIEMPRE_OSCURO.some((z) => regla.selector.includes(z))) return;
        if (regla.nodes?.some((n) => n.type === 'comment' && /tema:\s*fijo/.test(n.text))) return;
        if (fondoFuerte(regla)) return;
        const decls = [];
        regla.each((d) => {
          if (d.type !== 'decl') return;
          const v = valorDeNoche(d.prop, d.value);
          if (v) decls.push({ prop: d.prop, value: v, important: d.important, source: d.source });
        });
        if (!decls.length) return;
        const r = new Rule({ selector: prefijar(regla.selector), source: regla.source });
        decls.forEach((d) => r.append(d));
        nuevas.push([regla, r]);
      });
      for (const [original, r] of nuevas) original.after(r);
    },
  };
}
temaOscuro.postcss = true;
