import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { CAUSA_ES, fh } from '../pages/omCatalogos';
import { plural } from '../formato';

/**
 * HISTORIAL DEL ACTIVO — la retroalimentación antes de intervenir.
 *
 * PARA QUÉ SIRVE
 * Todo lo que se capturaba —causas de cierre, reincidencia, tramos de cable,
 * incidencias— se guardaba y nadie lo volvía a mirar. El ingeniero creaba una
 * orden sin ver el pasado del equipo y el técnico iba a campo a improvisar.
 *
 * Este panel se usa en tres momentos, a propósito los tres:
 *   · al crear una orden      -> el ingeniero decide con datos
 *   · en la ficha del activo  -> consulta de oficina
 *   · al escanear el QR       -> el técnico lo ve parado frente al equipo
 */

const COLOR: Record<string, { fondo: string; borde: string; texto: string }> = {
  CONFIRMADA: { fondo: '#fee2e2', borde: '#fca5a5', texto: '#991b1b' },
  SOSPECHA: { fondo: '#fef3c7', borde: '#fcd34d', texto: '#92400e' },
  NINGUNA: { fondo: '#f0fdf4', borde: '#bbf7d0', texto: '#166534' },
};

const MEDIO: Record<string, string> = {
  MANLIFT: 'Manlift', GRUA: 'Grúa', ANDAMIO: 'Andamio',
  ESCALERA: 'Escalera', LINEA_VIDA: 'Línea de vida', OTRO: 'Otro',
};

interface Props {
  assetId: string;
  /** compacto = para el celular y para el panel dentro del formulario. */
  compacto?: boolean;
}

export default function HistorialActivo({ assetId, compacto }: Props) {
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!assetId) { setCargando(false); return; }
    setCargando(true);
    api.get('/assets/' + assetId + '/historial')
      .then((r) => setD(r.data))
      .catch(() => setD(null))
      .finally(() => setCargando(false));
  }, [assetId]);

  if (!assetId) return null;
  if (cargando) return <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>Consultando el historial…</div>;
  if (!d) return null;

  const c = COLOR[d.severidad] || COLOR.NINGUNA;
  const sinHistorial = !d.resumen.ordenesTotales && !d.resumen.incidencias;

  return (
    <div style={{ marginTop: 12 }}>
      {/* ------------------------------------------------ señales de patrón */}
      <div style={{
        background: c.fondo, border: `1px solid ${c.borde}`, borderRadius: 8,
        padding: '10px 12px', fontSize: 13, color: c.texto,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          {d.severidad === 'CONFIRMADA' ? 'Reincidencia confirmada'
            : d.severidad === 'SOSPECHA' ? 'Posible reincidencia'
            : sinHistorial ? 'Sin historial previo'
            : 'Sin patrón de reincidencia'}
        </div>

        {d.senales?.length ? (
          <ul style={{ margin: '4px 0 0 18px' }}>
            {d.senales.map((s: any, i: number) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {s.mensaje}
                {s.sugerencia && (
                  <div style={{ fontSize: 12, opacity: 0.85 }}>→ {s.sugerencia}</div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ fontSize: 12 }}>
            {sinHistorial
              ? 'Es la primera intervención registrada sobre este equipo.'
              : `${plural(d.resumen.ordenesTotales, 'orden', 'órdenes')}(es) registradas, sin patrón detectado.`}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- resumen */}
      {!sinHistorial && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {[
            { t: 'Órdenes', v: d.resumen.ordenesTotales },
            { t: `En ${d.ventanaDias} días`, v: d.resumen.ordenesEnVentana },
            { t: 'Incidencias', v: d.resumen.incidencias },
            { t: 'Sin falla hallada', v: d.resumen.sinFallaEncontrada, alerta: d.resumen.sinFallaEncontrada >= 2 },
            // Impacto real en producción: es el argumento para un reemplazo,
            // mucho más que la cantidad de órdenes.
            ...(d.resumen.minutosSinVision
              ? [{ t: 'Min. sin visión', v: d.resumen.minutosSinVision, alerta: d.resumen.minutosSinVision > 240 }]
              : []),
          ].map((k) => (
            <div key={k.t} style={{
              border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', minWidth: 84,
            }}>
              <div className="muted" style={{ fontSize: 10 }}>{k.t}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.alerta ? '#b91c1c' : undefined }}>
                {k.v}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --------------------------------------------------- qué le pasa */}
      {Object.keys(d.porCausa || {}).length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Causas registradas</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(d.porCausa).map(([causa, n]: any) => (
              <span key={causa} style={{
                background: '#f1f5f9', borderRadius: 12, padding: '3px 10px', fontSize: 12,
              }}>
                {CAUSA_ES[causa] || causa} <strong>×{n}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- cableado */}
      {d.tramos?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Cableado conectado</div>
          {d.tramos.map((t: any) => (
            <div key={t.id} style={{ fontSize: 12, marginBottom: 2 }}>
              · {t.category} {t.meters != null ? `· ${t.meters} m` : '· sin medir'}
              {t.meters != null && (
                <span className="muted"> ({t.metersEstimated ? 'estimado' : 'medido'})</span>
              )}
              {t.shielded ? ' · blindado' : ' · sin blindaje'}
              {t.route ? ` · ${t.route.toLowerCase()}` : ''}
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------ vecinos que comparten */}
      {d.compartida?.vecinos > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
            Comparte {d.compartida.via} con {plural(d.compartida.vecinos, 'equipo')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {d.compartida.vecinosDetalle?.slice(0, compacto ? 6 : 20).map((v: any) => (
              <span key={v.assetCode} style={{
                background: v.ordenes ? '#fee2e2' : '#f1f5f9',
                color: v.ordenes ? '#991b1b' : undefined,
                borderRadius: 12, padding: '3px 10px', fontSize: 12,
              }}>
                {v.assetCode}{v.ordenes ? ` · ${v.ordenes} falla(s)` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ----------------------------------------------- accesos en altura */}
      {d.accesos?.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12 }}>
          <span style={{ fontWeight: 600 }}>Acceso especial: </span>
          {d.accesos[0].status === 'APROBADO' ? 'requirió ' : 'se solicitó '}
          {MEDIO[d.accesos[0].means] || d.accesos[0].means}
          {d.accesos[0].heightMeters ? ` (${d.accesos[0].heightMeters} m)` : ''}
          {' · '}{fh(d.accesos[0].createdAt)}
        </div>
      )}

      {/* ------------------------------------------ materiales históricos */}
      {d.materiales?.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Materiales usados antes</div>
          <div className="muted">{d.materiales.join(' · ')}</div>
        </div>
      )}

      {/* ------------------------------------------------ últimas órdenes */}
      {!compacto && d.ordenes?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Últimas intervenciones</div>
          <table style={{ fontSize: 12 }}>
            <thead><tr><th>OM</th><th>Tipo</th><th>Cierre</th><th>Causa</th><th>Técnico</th></tr></thead>
            <tbody>
              {d.ordenes.slice(0, 8).map((o: any) => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 600 }}>{o.code}</td>
                  <td className="muted">{o.type}</td>
                  <td className="muted">{fh(o.endedAt || o.executedDate)}</td>
                  <td>
                    {o.rootCause ? (CAUSA_ES[o.rootCause] || o.rootCause) : '—'}
                    {o.isRecurrent && <div style={{ fontSize: 10, color: '#b91c1c' }}>reincidente</div>}
                  </td>
                  <td className="muted">{o.technician?.fullName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
