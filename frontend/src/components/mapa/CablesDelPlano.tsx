/**
 * EL CABLE SOBRE EL PLANO — bloque 176.
 *
 * Del switch a cada equipo enchufado en uno de sus puertos. La línea sale de
 * lo DECLARADO (el puerto en Red › Conexiones), no se dibuja a mano: a mano
 * sólo se le da FORMA (por dónde va), en el editor de planos.
 *
 *   · Sin trazar → discontinua y «estimado»: recorrido en L, como por bandeja.
 *   · Trazada → continua, con los metros del recorrido real.
 *   · Fuera de norma (más de 90 m de UTP, o cruza un área de riesgo) → roja.
 *   · Los metros se escriben sólo en el cable resaltado: escritos en todos,
 *     se pisaban con los nombres de las zonas y no se leía ninguno.
 *   · Enlaces declarados (fibra, radio, cobre) → con el estilo de su medio.
 */
export interface Cable {
  assetId: string; codigo: string; switchId: string; switchCodigo: string; puerto: number; poe: boolean;
  esEnlace: boolean; linea: [number, number][]; puntos: [number, number][]; metros: number | null;
  estimado: boolean; fueraDeNorma: boolean; cruza: { nivel: string; nombre: string }[];
  medio: [number, number]; trazadoPor: string | null; trazadoEn: string | null;
}
export interface Enlace { id: string; medio: string; anillo: boolean; aId: string; bId: string; codigo: string; linea: [number, number][]; metros: number | null }

const enLinea = (l: [number, number][]) => l.map((p) => p.join(',')).join(' ');

export default function CablesDelPlano({ cables, enlaces, escala, resaltar, onPulsar }: {
  cables: Cable[]; enlaces: Enlace[]; escala: number;
  /** Ids (de equipo o de switch) cuyos cables se resaltan. */
  resaltar?: Set<string> | null;
  onPulsar?: (c: Cable) => void;
}) {
  const hay = !!resaltar && resaltar.size > 0;
  return (
    <g>
      {enlaces.map((l) => (
        <polyline key={l.id} points={enLinea(l.linea)} className={'enlace-red enlace-' + l.medio}
          style={{ strokeWidth: 3 * escala }}>
          <title>{`${l.codigo} · ${l.medio.toLowerCase()}${l.metros != null ? ` · ${l.metros} m en línea recta` : ''}`}</title>
        </polyline>
      ))}
      {cables.map((c) => {
        const r = hay && (resaltar!.has(c.assetId) || resaltar!.has(c.switchId));
        const clases = ['cable', c.estimado ? 'estimado' : 'trazado', c.fueraDeNorma ? 'fuera' : '', c.esEnlace ? 'subida' : '',
          r ? 'resaltado' : '', hay && !r ? 'atenuado' : ''].filter(Boolean).join(' ');
        return (
          <g key={c.assetId} className={clases}
            onClick={onPulsar ? (ev) => { ev.stopPropagation(); onPulsar(c); } : undefined}>
            <title>{`${c.switchCodigo} · puerto ${c.puerto} → ${c.codigo}${c.metros != null ? ` · ${c.metros} m${c.estimado ? ' (estimado)' : ''}` : ''}`}</title>
            <polyline points={enLinea(c.linea)} className="cable-toque" style={{ strokeWidth: 14 * escala }} />
            <polyline points={enLinea(c.linea)} className="cable-linea" style={{ strokeWidth: (r ? 4 : 2.5) * escala }} />
            {r && c.metros != null && (
              <text x={c.medio[0]} y={c.medio[1] - 6 * escala} style={{ fontSize: 11 * escala }} textAnchor="middle" className="cable-metros">
                {`${c.metros} m${c.estimado ? ' est.' : ''}`}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
