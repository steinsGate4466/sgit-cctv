import { useEffect, useState } from 'react';
import { api } from './api/client';
import { mismoTren } from './trenes';

/* =============================================================================
   QUÉ UBICACIONES SALEN EN CADA DESPLEGABLE — bloque 172
   -----------------------------------------------------------------------------
   Lo reportó el usuario: «en una lista de mapas o de direcciones salen también
   los gabinetes. Eso no debería ser así.»

   Tenía razón, y el fallo estaba en DOCE formularios a la vez: todos pintaban
   `/locations` entero. Así, en «¿Dónde está montado el equipo?», en «Zona del
   plano» o en «Ubicación del tablero» salían:

     · los GABINETES (ubicaciones de tipo RACK), que tienen su propio campo
       «Gabinete» y su propia pantalla;
     · «Aceros Arequipa» (la EMPRESA), donde no se monta nada;
     · y todo en una lista plana por orden alfabético: «Sala eléctrica T1» y
       «Sala eléctrica T2» juntas, sin saber de qué tren es cada una.

   Ahora cada desplegable dice PARA QUÉ es (`uso`) y esta tabla decide qué
   tipos de ubicación tienen sentido ahí. Las opciones salen agrupadas por tren,
   en el orden del árbol, y si se eligió un tren arriba sólo salen las suyas.

   Si un registro VIEJO ya apunta a algo que hoy no se ofrecería (un equipo
   guardado dentro de un RACK), se sigue enseñando marcado «(actual)»: un
   desplegable que se queda en blanco al editar parece que borró el dato.
============================================================================= */

export type UsoDeUbicacion =
  | 'equipo'       // dónde está montado un equipo (el gabinete va en su campo)
  | 'estructura'   // dónde está un gabinete o un tablero eléctrico
  | 'plano'        // de qué zona es un plano
  | 'zonaDePlano'  // qué ubicación es un polígono dibujado en un plano
  | 'trabajo'      // zona de una orden, una campaña o una instalación
  | 'documento';   // a qué ubicación cuelga un documento

const PERMITIDOS: Record<UsoDeUbicacion, string[]> = {
  equipo: ['TREN', 'AREA', 'ETAPA', 'SALA', 'ZONA'],
  estructura: ['TREN', 'AREA', 'ETAPA', 'SALA', 'ZONA'],
  plano: ['PLANTA', 'TREN', 'AREA', 'ETAPA', 'SALA', 'ZONA'],
  zonaDePlano: ['TREN', 'AREA', 'ETAPA', 'SALA', 'ZONA'],
  trabajo: ['TREN', 'AREA', 'ETAPA', 'SALA', 'ZONA'],
  documento: ['PLANTA', 'TREN', 'AREA', 'ETAPA', 'SALA', 'ZONA'],
};

/** Qué tipos admite un uso. Exportado para la prueba y el verificador. */
export function tiposPara(uso: UsoDeUbicacion): string[] {
  return PERMITIDOS[uso];
}

/* EL ORDEN DE LOS NIVELES. Una ubicación sólo puede colgar de otra de nivel
   MENOR: un tren de la planta, una sala de un tren o de un área… nunca un tren
   de una sala. ETAPA y AREA son el mismo nivel (el área del tren). */
const NIVEL: Record<string, number> = {
  EMPRESA: 0, PLANTA: 1, TREN: 2, AREA: 3, ETAPA: 3, SALA: 4, ZONA: 5, RACK: 6,
};

export function nivelDe(tipo: string | null | undefined): number {
  return NIVEL[String(tipo || '')] ?? 9;
}

export interface Ubicacion {
  id: string; name: string; type?: string | null; code?: string | null;
  parentId?: string | null; siglaTren?: string | null;
}

/** El tren al que pertenece una ubicación (subiendo por el árbol), o null. */
export function trenDe(lista: Ubicacion[], id: string | null | undefined): Ubicacion | null {
  const porId = new Map(lista.map((u) => [u.id, u]));
  const vistos = new Set<string>();
  for (let u = id ? porId.get(id) : undefined; u && !vistos.has(u.id); u = u.parentId ? porId.get(u.parentId) : undefined) {
    vistos.add(u.id);
    if (u.type === 'TREN') return u;
  }
  return null;
}

/** «T1», «GRU»…: la sigla con la que el resto del sistema nombra al tren. */
export function siglaDe(t: Ubicacion | null | undefined): string {
  if (!t) return '';
  return String(t.siglaTren || String(t.code || '').split('-').pop() || '');
}

/** Ids de una ubicación y todo lo que cuelga de ella. */
export function rama(lista: Ubicacion[], raiz: string): Set<string> {
  const hijos = new Map<string, string[]>();
  for (const u of lista) if (u.parentId) hijos.set(u.parentId, [...(hijos.get(u.parentId) ?? []), u.id]);
  const out = new Set<string>();
  const pila = [raiz];
  while (pila.length) {
    const x = pila.pop()!;
    if (out.has(x)) continue;
    out.add(x);
    pila.push(...(hijos.get(x) ?? []));
  }
  return out;
}

export interface GrupoDeUbicaciones { tren: string; opciones: { id: string; texto: string; actual?: boolean }[] }

/**
 * Las opciones de un desplegable de ubicación, agrupadas por tren y en el
 * orden del árbol (cada nivel con su sangría).
 *
 * `tren`: sigla o código del tren elegido (o la lista de trenes del usuario); si viene,
 * sólo salen ubicaciones de ese tren (y las de planta, para `plano`/`documento`).
 * `dentroDe`: id de una ubicación; sólo sale lo que cuelga de ella.
 * `actual`: el valor guardado; se conserva aunque hoy no se ofrecería.
 */
export function ubicacionesPara(
  uso: UsoDeUbicacion,
  lista: Ubicacion[],
  opts: { tren?: string | string[] | null; dentroDe?: string | null; actual?: string | null } = {},
): GrupoDeUbicaciones[] {
  const trenesPedidos = (Array.isArray(opts.tren) ? opts.tren : opts.tren ? [opts.tren] : []).filter(Boolean);
  const esDeLosTrenes = (t: Ubicacion | null) => !trenesPedidos.length
    || (t ? trenesPedidos.some((x) => mismoTren(siglaDe(t), x) || mismoTren(t.code, x)) : uso === 'plano' || uso === 'documento');
  const permitidos = PERMITIDOS[uso];
  const porId = new Map(lista.map((u) => [u.id, u]));
  const hijos = new Map<string, Ubicacion[]>();
  const raices: Ubicacion[] = [];
  for (const u of lista) {
    if (u.parentId && porId.has(u.parentId)) hijos.set(u.parentId, [...(hijos.get(u.parentId) ?? []), u]);
    else raices.push(u);
  }
  const ordenar = (a: Ubicacion, b: Ubicacion) => nivelDe(a.type) - nivelDe(b.type) || String(a.name).localeCompare(String(b.name));
  const limite = opts.dentroDe ? rama(lista, opts.dentroDe) : null;

  const grupos = new Map<string, GrupoDeUbicaciones>();
  const meter = (u: Ubicacion, prof: number, tren: Ubicacion | null) => {
    const t = u.type === 'TREN' ? u : tren;
    const vale = permitidos.includes(String(u.type))
      && (!limite || limite.has(u.id))
      && esDeLosTrenes(t);
    const esActual = !!opts.actual && u.id === opts.actual;
    if (vale || esActual) {
      const clave = t ? t.name : 'Planta';
      if (!grupos.has(clave)) grupos.set(clave, { tren: clave, opciones: [] });
      const sangria = '  '.repeat(Math.max(0, prof - (t ? 2 : 1)));
      grupos.get(clave)!.opciones.push({
        id: u.id,
        texto: sangria + u.name + (!vale ? ' (actual)' : ''),
        actual: !vale,
      });
    }
    for (const h of (hijos.get(u.id) ?? []).sort(ordenar)) meter(h, prof + 1, t);
  };
  for (const r of raices.sort(ordenar)) meter(r, nivelDe(r.type), null);

  // «Planta» primero; luego los trenes en el orden en que aparecen.
  return [...grupos.values()].sort((a, b) => (a.tren === 'Planta' ? -1 : b.tren === 'Planta' ? 1 : 0));
}

/** Las <option> de un desplegable de ubicación. Va DENTRO del <select>. */
export function OpcionesDeUbicacion(props: {
  uso: UsoDeUbicacion; lista: Ubicacion[];
  tren?: string | string[] | null; dentroDe?: string | null; actual?: string | null;
}) {
  const grupos = ubicacionesPara(props.uso, props.lista, props);
  if (grupos.length === 1) {
    return <>{grupos[0].opciones.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}</>;
  }
  return (
    <>
      {grupos.map((g) => (
        <optgroup key={g.tren} label={g.tren}>
          {g.opciones.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
        </optgroup>
      ))}
    </>
  );
}

/**
 * ¿De qué puede colgar una ubicación de este tipo? Sólo de una de nivel MENOR,
 * y nunca de sí misma ni de algo que cuelga de ella (eso hace un círculo y el
 * árbol se rompe: la ubicación desaparece de todas las listas).
 */
export function padresPosibles(lista: Ubicacion[], tipo: string, propioId?: string | null): Ubicacion[] {
  const prohibidos = propioId ? rama(lista, propioId) : new Set<string>();
  return lista.filter((u) => !prohibidos.has(u.id) && nivelDe(u.type) < nivelDe(tipo) && u.type !== 'RACK');
}

/* =============================================================================
   LOS TRENES REALES — no ['T1', 'T2', 'T3'] escrito a mano.
   -----------------------------------------------------------------------------
   Ocho desplegables de «Tren» tenían la lista escrita en el código. La planta
   tiene CINCO (T1, T2, T3, Grúas, Oficinas), así que una parada, una subred o
   un tablero de Grúas no se podía apuntar a su tren. Salen de la base.
============================================================================= */
let cacheTrenes: Ubicacion[] | null = null;
let pidiendo: Promise<Ubicacion[]> | null = null;

export function useTrenes(): Ubicacion[] {
  const [t, setT] = useState<Ubicacion[]>(cacheTrenes ?? []);
  useEffect(() => {
    if (cacheTrenes) return;
    let vivo = true;
    pidiendo = pidiendo ?? api.get('/locations')
      .then((r) => {
        const lista: Ubicacion[] = r.data?.items || r.data || [];
        cacheTrenes = lista.filter((u) => u.type === 'TREN')
          .sort((a, b) => String(a.code).localeCompare(String(b.code)));
        return cacheTrenes;
      })
      .catch(() => { pidiendo = null; return []; });
    pidiendo.then((x) => { if (vivo) setT(x); });
    return () => { vivo = false; };
  }, []);
  return t;
}

/** Las <option> de un desplegable de tren. El valor es la sigla (T1, GRU…). */
export function OpcionesDeTren({ trenes }: { trenes: Ubicacion[] }) {
  return <>{trenes.map((t) => <option key={t.id} value={siglaDe(t)}>{t.name}</option>)}</>;
}

/**
 * Gabinetes, tableros… del MISMO TREN que la ubicación elegida en el formulario.
 * Sin ubicación elegida, o si ésta no cuelga de ningún tren, salen todos. El
 * valor ya guardado se conserva siempre.
 */
export function delMismoTren<T extends { id: string; locationId?: string | null }>(
  lista: Ubicacion[], items: T[], locationId: string | null | undefined, actual?: string | null,
): T[] {
  const tren = trenDe(lista, locationId);
  if (!tren) return items;
  return items.filter((x) => x.id === actual || !x.locationId || trenDe(lista, x.locationId)?.id === tren.id);
}

/* =============================================================================
   EL TREN DE PARADAS, INSTALACIONES, TABLEROS, SUBREDES Y CAMPAÑAS — bloque 172
   -----------------------------------------------------------------------------
   Esas cinco tablas guardan el enum `PlantTrain`. El desplegable mandaba «T1»
   y la base lo rechazaba: NO se podía apuntar ninguna parada. Estas son
   exactamente las opciones que la base acepta. El servidor normaliza además
   «T1» → TREN_1 (common/tren-de-planta.ts) por si llega la forma vieja.
============================================================================= */
export const TRENES_DE_PLANTA: { valor: string; nombre: string }[] = [
  { valor: 'TREN_1', nombre: 'Tren 1' },
  { valor: 'TREN_2', nombre: 'Tren 2' },
  { valor: 'TREN_3', nombre: 'Tren 3' },
  { valor: 'PATIO', nombre: 'Patio, almacenes y exteriores' },
  { valor: 'PLANTA_GENERAL', nombre: 'Planta general (oficinas, servicios)' },
];

/** «TREN_1» o «T1» → «Tren 1». Para pintar lo guardado. */
export function nombreDeTrenDePlanta(v: string | null | undefined): string {
  if (!v) return '';
  const s = String(v).toUpperCase();
  const n = s.match(/^(?:TREN_|T)([123])$/);
  if (n) return `Tren ${n[1]}`;
  return TRENES_DE_PLANTA.find((t) => t.valor === s)?.nombre ?? String(v);
}

/** Pasa la sigla de un tren del árbol («T1», «OFI») al valor de la base, si tiene. */
export function trenDePlantaDeSigla(sigla: string | null | undefined): string {
  const s = String(sigla || '').toUpperCase();
  const n = s.match(/(?:^|-)T([123])$/);
  if (n) return `TREN_${n[1]}`;
  if (/OFI$/.test(s)) return 'PLANTA_GENERAL';
  return '';
}

export function OpcionesDeTrenDePlanta() {
  return <>{TRENES_DE_PLANTA.map((t) => <option key={t.valor} value={t.valor}>{t.nombre}</option>)}</>;
}

/** TREN_1 → «T1» (para filtrar el árbol). Patio o planta general → '' (sin filtro). */
export function siglaDeTrenDePlanta(v: string | null | undefined): string {
  const n = String(v || '').toUpperCase().match(/^(?:TREN_|T)([123])$/);
  return n ? `T${n[1]}` : '';
}
