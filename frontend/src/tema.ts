/**
 * TEMA CLARO / MODO NOCHE — bloque 157.
 *
 * Tres opciones y no dos: «Automático» sigue al equipo (el celular que se pone
 * oscuro de noche, el monitor del púlpito configurado en oscuro), y «Claro» /
 * «Noche» fijan uno a mano. Se recuerda en ESTE navegador: es una comodidad de
 * quien mira, no un dato de la planta, así que no viaja al servidor.
 *
 * El tema se aplica ANTES de pintar nada (desde `main.tsx`), para que la
 * pantalla no aparezca blanca un instante y luego se oscurezca: de noche, en el
 * púlpito, ese fogonazo es justo lo que molesta.
 *
 * Los colores de la noche salen solos de `styles.css` (ver
 * `scripts/tema-oscuro.mjs`); aquí sólo se decide CUÁL se ve.
 */
import { useEffect, useState } from 'react';

export type Tema = 'auto' | 'claro' | 'oscuro';
const CLAVE = 'sgit:tema';
const ORDEN: Tema[] = ['auto', 'claro', 'oscuro'];

export const NOMBRE_TEMA: Record<Tema, string> = { auto: 'Automático', claro: 'Claro', oscuro: 'Noche' };

export function temaGuardado(): Tema {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === 'claro' || v === 'oscuro' ? v : 'auto';
  } catch { return 'auto'; }
}

const sistemaOscuro = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** El que se ve de verdad: «auto» se resuelve con el del equipo. */
export const temaEfectivo = (t: Tema): 'claro' | 'oscuro' => (t === 'auto' ? (sistemaOscuro() ? 'oscuro' : 'claro') : t);

function pintar(t: Tema) {
  const ef = temaEfectivo(t);
  document.documentElement.dataset.tema = ef;
  // La barra del navegador del celular, del mismo color que la cabecera.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ef === 'oscuro' ? '#070d19' : '#16233b');
}

const oyentes = new Set<(t: Tema) => void>();

export function elegirTema(t: Tema) {
  try { if (t === 'auto') localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, t); } catch { /* sin persistencia */ }
  pintar(t);
  oyentes.forEach((f) => f(t));
}

/** Se llama una vez, antes de montar React. */
export function iniciarTema() {
  pintar(temaGuardado());
  // Si está en automático y el equipo cambia (anochece), se cambia con él.
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (temaGuardado() === 'auto') pintar('auto');
  });
}

export function useTema() {
  const [tema, setTema] = useState<Tema>(temaGuardado);
  useEffect(() => {
    oyentes.add(setTema);
    return () => { oyentes.delete(setTema); };
  }, []);
  const siguiente = ORDEN[(ORDEN.indexOf(tema) + 1) % ORDEN.length];
  return { tema, efectivo: temaEfectivo(tema), siguiente, elegir: elegirTema };
}
