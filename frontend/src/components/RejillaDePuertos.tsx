import { NOMBRE_DE_TIPO } from '../tipos-de-equipo';

/* =============================================================================
   LA REJILLA DE PUERTOS DE UN SWITCH — bloque 173, separada en el 176.
   -----------------------------------------------------------------------------
   Es la MISMA rejilla en Red › Conexiones y en el Mapa: lo que se arregle aquí
   se ve en los dos sitios. Por eso vive sola y NO escribe nada (no tiene ni un
   `api`): en Conexiones, quien la usa abre el puerto para editarlo; en el
   mapa, tocar un puerto resalta su cable hasta el equipo (§58: el mapa ve y
   manda, no hace).
============================================================================= */

export interface Puerto {
  id: string; numero: number; poe: boolean; vlan: number | null;
  enlace?: boolean; aviso?: string | null;
  equipo: null | { id: string; code: string; tipo: string; estado: string; lugar?: string | null; modelo?: string | null };
}

/** Ocupados · libres · PoE: el resumen que se mira antes de pedir otra cámara. */
export function CifrasDePuertos({ sw }: { sw: { ocupados: number; libres: number | null; poeUsados: number; poePuertos: number | null } }) {
  return (
    <div className="sw-cifras">
      <div><b>{sw.ocupados}</b><span>ocupados</span></div>
      <div className={sw.libres === 0 ? 'lleno' : ''}><b>{sw.libres ?? '?'}</b><span>libres</span></div>
      <div title="Puertos marcados con PoE, contra los que dice la ficha">
        <b>{sw.poeUsados}{sw.poePuertos != null ? `/${sw.poePuertos}` : ''}</b><span>PoE</span>
      </div>
    </div>
  );
}

export default function RejillaDePuertos({ sw, puedeEditar, recien, marcado, onAbrir, onDesenchufar }: {
  sw: any;
  puedeEditar: boolean;
  /** Puerto recién guardado: parpadea un momento. */
  recien?: number | null;
  /** Puerto resaltado (en el mapa: el que se tocó). */
  marcado?: number | null;
  /** Tocar un puerto. Sin esto (y sin poder editar), las casillas sólo se leen. */
  onAbrir?: (numero: number, puerto: Puerto | null) => void;
  onDesenchufar?: (p: Puerto) => void;
}) {
  const porNumero = new Map<number, Puerto>((sw.puertos as Puerto[]).map((p) => [p.numero, p]));
  const total = Math.max(sw.capacidad || 0, ...(sw.puertos as Puerto[]).map((p) => p.numero), 0);
  if (!total) return null;
  return (
    <div className="rejilla-puertos" role="list" aria-label={`Puertos de ${sw.code}`}>
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
        const p = porNumero.get(n) || null;
        const eq = p?.equipo;
        const clases = ['puerto', eq ? 'ocupado' : 'libre'];
        if (p?.enlace) clases.push('enlace');
        if (eq && eq.estado !== 'OPERATIVO') clases.push('con-falla');
        if (recien === n || marcado === n) clases.push('recien');
        /* En un switch sin VLAN, una VLAN guardada es un resto: no se pinta. */
        const vlan = sw.soportaVlan === false ? null : p?.vlan ?? null;
        const etiqueta = `Puerto ${n}${p?.poe ? ', con PoE' : ''}${vlan != null ? `, VLAN ${vlan}` : ''}: ${eq ? `${eq.code}` : 'libre'}`;
        return (
          <div key={n} className={clases.join(' ')} role="listitem">
            <button type="button" className="puerto-abrir" disabled={!onAbrir}
              aria-label={etiqueta} title={p?.aviso || etiqueta}
              onClick={() => onAbrir?.(n, p)}>
              <span className="p-num">
                {n}
                {p?.poe && <span className="p-poe" title="Este puerto da corriente (PoE)">PoE</span>}
                {vlan != null && <span className="p-vlan" title={`VLAN ${vlan}`}>V{vlan}</span>}
              </span>
              {eq ? (
                <>
                  <span className="p-code">{eq.code}</span>
                  <span className="p-tipo">
                    {p?.enlace ? '↔ enlace · ' : ''}{NOMBRE_DE_TIPO[eq.tipo] || eq.tipo}
                    {p?.aviso ? ' ⚠' : ''}
                  </span>
                </>
              ) : (
                <span className="p-libre">{puedeEditar ? '+ enchufar' : 'libre'}</span>
              )}
            </button>
            {eq && puedeEditar && onDesenchufar && (
              <button type="button" className="canal-quitar" aria-label={`Desenchufar ${eq.code} del puerto ${n}`}
                title="Desenchufar" onClick={() => onDesenchufar(p!)}>×</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
