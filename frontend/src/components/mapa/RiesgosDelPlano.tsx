import type { Zona } from './ZonasDelPlano';
import { NIVEL } from './riesgos';

/**
 * EL RIESGO SOBRE EL PLANO — bloque 176.
 *
 * Dos fuentes, y se ven distintas a propósito:
 *   · ÁREAS DIBUJADAS por el Jefe de Mantenimiento (el paso de grúa, el foso):
 *     relleno rayado y borde grueso del color de su nivel, con su nombre.
 *   · ZONAS que ya DECLARAN su riesgo en Ubicaciones (riesgo para personas,
 *     permiso eléctrico, exige subir, zona vital): sólo un segundo borde por
 *     fuera, sin tapar el color de la zona — el relleno sigue diciendo si sus
 *     equipos funcionan; el borde dice el peligro. Dos datos, sin mezclarlos.
 */
export interface AreaDeRiesgo {
  id: string; nivel: string; nombre: string; motivo: string; puntos: [number, number][];
  caja: { cx: number; cy: number; w: number; h: number; x: number; y: number };
  rotulo?: { x: number; y: number }; dibujadoPor?: string | null; editadoEn?: string;
}

export default function RiesgosDelPlano({ areas, zonas, escala, elegida, onElegir, borrador }: {
  areas: AreaDeRiesgo[]; zonas: (Zona & { riesgos?: { nivel: string; porque: string }[] })[]; escala: number;
  elegida?: string | null; onElegir?: (id: string) => void;
  /** En el editor, el área que se está dibujando (no se puede tocar: se jala por sus asas). */
  borrador?: { nivel: string; puntos: [number, number][] } | null;
}) {
  return (
    <g>
      {zonas.filter((z) => z.riesgos?.length).map((z) => {
        const n = z.riesgos![0].nivel;
        return (
          <g key={'zr' + z.id} className={'riesgo-borde riesgo-' + n} aria-hidden="true">
            <polygon points={z.puntos.map((p) => p.join(',')).join(' ')} style={{ strokeWidth: 5 * escala }} />
            <text x={z.rotulo?.x ?? z.caja.cx} y={(z.rotulo?.y ?? z.caja.cy) - 16 * escala} style={{ fontSize: 13 * escala }} textAnchor="middle">
              {z.riesgos!.map((r) => NIVEL[r.nivel]?.icono).join(' ')}
            </text>
          </g>
        );
      })}
      {areas.map((a) => {
        const tam = Math.min(12 * escala, (a.caja.w * 1.6) / Math.max(6, a.nombre.length + 2));
        return (
          <g key={a.id} className={'riesgo riesgo-' + a.nivel + (elegida === a.id ? ' elegida' : '')}
            onClick={onElegir ? (ev) => { ev.stopPropagation(); onElegir(a.id); } : undefined}>
            <title>{`${NIVEL[a.nivel]?.texto ?? a.nivel} · ${a.nombre}: ${a.motivo}`}</title>
            <polygon points={a.puntos.map((p) => p.join(',')).join(' ')} style={{ strokeWidth: 3 * escala }} />
            {tam / escala >= 7 && (
              <text x={a.rotulo?.x ?? a.caja.cx} y={a.rotulo?.y ?? a.caja.cy} style={{ fontSize: tam }} textAnchor="middle">
                {`${NIVEL[a.nivel]?.icono ?? ''} ${a.nombre}`}
              </text>
            )}
          </g>
        );
      })}
      {borrador && borrador.puntos.length > 1 && (
        <polygon points={borrador.puntos.map((p) => p.join(',')).join(' ')}
          className={'riesgo-borrador riesgo-' + borrador.nivel} style={{ strokeWidth: 3 * escala }} />
      )}
    </g>
  );
}
