import { useEffect, useState } from 'react';
import { api } from './api/client';
import { Modulo } from './modulos';

/* =============================================================================
   LOS NÚMEROS DEL MENÚ — bloque 170
   -----------------------------------------------------------------------------
   Una sola llamada (`/dashboard/contadores`) para todo el menú, compartida por
   la barra lateral, las pestañas y la página de módulos. Se pide al entrar, al
   cambiar de pantalla (como mucho una vez por minuto) y cada tres minutos.

   Si falla, el menú se queda sin números y ya está: no se anuncia ni se reintenta
   en bucle. Un número es una ayuda, no un dato del que dependa nada.
============================================================================= */

export interface Contador { n: number; que: string; tono: 'alerta' | 'aviso' }
export type Contadores = Record<string, Contador>;

const CADA_MS = 3 * 60_000;
const MINIMO_MS = 60_000;

let actuales: Contadores = {};
let ultimaPeticion = 0;
let enVuelo: Promise<void> | null = null;
const oyentes = new Set<(c: Contadores) => void>();

/** Pide los números si hace más de un minuto de la última vez (o si se fuerza). */
export function refrescarContadores(forzar = false): Promise<void> {
  if (enVuelo) return enVuelo;
  if (!forzar && Date.now() - ultimaPeticion < MINIMO_MS) return Promise.resolve();
  ultimaPeticion = Date.now();
  enVuelo = api.get('/dashboard/contadores')
    .then((r) => {
      actuales = r.data && typeof r.data === 'object' ? r.data : {};
      oyentes.forEach((f) => f(actuales));
    })
    .catch(() => { /* sin números: el menú sigue igual */ })
    .finally(() => { enVuelo = null; });
  return enVuelo;
}

export function useContadores(activo = true): Contadores {
  const [c, setC] = useState<Contadores>(actuales);
  useEffect(() => {
    if (!activo) return;
    oyentes.add(setC);
    refrescarContadores();
    const t = setInterval(() => {
      // Pestaña en segundo plano: no se gasta una consulta que nadie va a ver.
      if (typeof document === 'undefined' || document.visibilityState === 'visible') refrescarContadores(true);
    }, CADA_MS);
    return () => { oyentes.delete(setC); clearInterval(t); };
  }, [activo]);
  return c;
}

/* La bandeja RESUME lo de las otras pestañas (las órdenes sin detallar son
   órdenes): sumarla al módulo contaría dos veces lo mismo. Su número sale en
   su pestaña, no en el total. */
const SOLO_EN_SU_PESTANA = new Set(['/bandeja']);

/** Suma de un módulo: cuántas cosas esperan dentro, y si alguna es alerta. */
export function totalDelModulo(m: Modulo, rutasVisibles: string[], c: Contadores): Contador | null {
  let n = 0;
  let alerta = false;
  const partes: string[] = [];
  for (const p of m.pantallas) {
    if (!rutasVisibles.includes(p.ruta) || SOLO_EN_SU_PESTANA.has(p.ruta)) continue;
    const x = c[p.ruta];
    if (!x || x.n <= 0) continue;
    n += x.n;
    if (x.tono === 'alerta') alerta = true;
    partes.push(x.que);
  }
  return n > 0 ? { n, que: partes.join(' · '), tono: alerta ? 'alerta' : 'aviso' } : null;
}

/** «99+» a partir de cien: un número de cuatro cifras rompe la línea del menú. */
export function cifra(n: number): string {
  return n > 99 ? '99+' : String(n);
}
