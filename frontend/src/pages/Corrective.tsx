import { useEffect, useState } from 'react';
import { api } from '../api/client';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

export default function Corrective() {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [oms, setOms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/corrective/assets').then((r) => r.data).catch(() => []),
      api.get('/corrective/summary').then((r) => r.data).catch(() => null),
      api.get('/work-orders?type=CORRECTIVO&pageSize=200').then((r) => r.data).catch(() => ({ data: [] })),
    ]).then(([a, s, w]) => { setRows(a || []); setSummary(s); setOms(w.data || []); setLoading(false); });
  }, []);

  if (loading) return <div className="loading">Cargando historial correctivo…</div>;

  return (
    <div>
      <h1 className="page-title">Mantenimiento Correctivo</h1>
      <p className="page-sub">Historial de fallas por activo · sustento para decidir reemplazos</p>

      <div className="kpi-grid">
        <div className="kpi red"><div className="label">Activos con fallas</div><div className="value">{summary?.assetsWithFailures ?? 0}</div></div>
        <div className="kpi crit"><div className="label">Candidatos a reemplazo</div><div className="value">{summary?.replacementCandidates ?? 0}</div><div className="hint">≥ {summary?.threshold ?? 3} correctivos en 12 meses</div></div>
        <div className="kpi"><div className="label">OM correctivas</div><div className="value">{oms.length}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <table>
          <thead>
            <tr><th>Activo</th><th>Ubicación</th><th>Correctivos (total)</th><th>Correctivos (12 m)</th><th>Incidencias</th><th>Última falla</th><th>Reemplazo</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.assetId}>
                <td style={{ fontWeight: 600 }}>{r.asset?.assetCode || '—'}</td>
                <td className="muted">{r.asset?.location?.name || '—'}</td>
                <td>{r.correctiveTotal}</td>
                <td style={{ fontWeight: 600 }}>{r.corrective12m}</td>
                <td>{r.incidents}</td>
                <td className="muted">{fmt(r.lastFailureAt)}</td>
                <td>{r.replacementCandidate ? <span className="badge FUERA_SERVICIO">Candidato</span> : <span className="badge OPERATIVO">No</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>Sin fallas correctivas registradas todavía.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 style={{ margin: '0 0 10px', color: 'var(--navy)', fontSize: 15 }}>Órdenes correctivas</h3>
      <div className="card">
        <table>
          <thead>
            <tr><th>Código</th><th>Activo</th><th>Zona</th><th>Actividad</th><th>Estado</th><th>Programada</th></tr>
          </thead>
          <tbody>
            {oms.map((w) => (
              <tr key={w.id}>
                <td style={{ fontWeight: 600 }}>{w.code}{w.incident && <div className="muted" style={{ fontSize: 10 }}>◦ {w.incident.code}</div>}</td>
                <td className="muted">{w.asset?.assetCode || '—'}</td>
                <td className="muted" style={{ fontSize: 12 }}>{w.zone || '—'}</td>
                <td style={{ fontSize: 12 }}>{w.activity || '—'}</td>
                <td><span className={'badge ' + (w.status === 'CERRADA' ? 'OPERATIVO' : w.status === 'CANCELADA' ? 'BAJA' : 'MANTENIMIENTO')}>{w.status}</span></td>
                <td className="muted" style={{ fontSize: 12 }}>{w.scheduledDate ? new Date(w.scheduledDate).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {!oms.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>Sin órdenes correctivas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
