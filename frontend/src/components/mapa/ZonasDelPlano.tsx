/**
 * LAS ZONAS SOBRE EL PLANO — bloque 165.
 *
 * Cada zona (sala eléctrica, púlpito, línea…) es un polígono del color de su
 * PEOR equipo, con su nombre en el centro. Tocarla la elige: el mapa enseña
 * sólo sus equipos y el panel su resumen. Va DEBAJO de los conos y los
 * puntos: la zona es el fondo, el equipo es lo que se toca.
 *
 * El rótulo se escala con `escala` para leerse igual de cerca o de lejos.
 */
export interface Zona {
  id: string; locationId: string; nombre: string; puntos: [number, number][];
  caja: { x: number; y: number; w: number; h: number; cx: number; cy: number };
  /** Dónde va el nombre (dentro de la zona aunque tenga muesca). */
  rotulo?: { x: number; y: number };
  equipos: string[]; resumen: Record<string, number>; estado: string;
  conOtraUbicacion: string[]; planoHijo: { id: string; nombre: string; resumen: Record<string, number> | null } | null;
}

/** «Sala eléctrica T2 (demo)» → «Sala eléctrica»: en el plano sobra lo que ya dice el plano. */
export const nombreCorto = (n: string) => n.replace(/\s+\(demo\)$/i, '').replace(/\s+T\d+$/i, '');

export default function ZonasDelPlano({ zonas, escala, elegida, onElegir }: {
  zonas: Zona[]; escala: number; elegida: string | null; onElegir: (id: string) => void;
}) {
  if (!zonas.length) return null;
  return (
    <g>
      {zonas.map((z) => {
        /* El rótulo cabe en la zona o no se pone: una sala pequeña vista de
           lejos no puede tapar a la de al lado con su nombre. */
        const nombre = nombreCorto(z.nombre);
        const tam = Math.min(13 * escala, (z.caja.w * 1.7) / Math.max(6, nombre.length));
        const cabe = tam / escala >= 8;
        const rx = z.rotulo?.x ?? z.caja.cx;
        const ry = z.rotulo?.y ?? z.caja.cy;
        return (
        <g key={z.id} className={'zona zona-' + z.estado + (elegida === z.id ? ' elegida' : '') + (elegida && elegida !== z.id ? ' atenuada' : '')}
          onClick={(ev) => { ev.stopPropagation(); onElegir(z.id); }}>
          <polygon points={z.puntos.map((p) => p.join(',')).join(' ')} style={{ strokeWidth: 2 * escala }} />
          {cabe && <text x={rx} y={ry} style={{ fontSize: tam }} textAnchor="middle">{nombre}</text>}
          {cabe && z.planoHijo && (
            <text x={rx} y={ry + tam * 1.3} style={{ fontSize: tam * 0.8 }} textAnchor="middle" className="zona-hijo">
              ⤵ tiene plano propio
            </text>
          )}
        </g>
        );
      })}
    </g>
  );
}
