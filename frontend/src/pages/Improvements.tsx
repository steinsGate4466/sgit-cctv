import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useDialogos } from '../components/Dialogos';
import { fecha } from '../formato';

/**
 * Mantenimiento de Mejora — trabajos que no son reparación ni rutina:
 * upgrades, reubicaciones, cambio de modelo, estandarización de red.
 */

export default function Improvements() {
  const { avisar } = useDialogos();
  const [oms, setOms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/work-orders?type=MEJORA&pageSize=200')
      .then((r) => r.data).catch(() => ({ data: [] }))
      .then((d) => { setOms(d.data || []); setLoading(false); });
  }, []);

  async function downloadOM(w: any) {
    try {
      const res = await api.get('/work-orders/' + w.id + '/report', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = (w.code || 'informe') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { await avisar('No se pudo generar el informe.'); }
  }

  if (loading) return <div className="loading">Cargando mejoras…</div>;

  const cerradas = oms.filter((w) => w.status === 'CERRADA').length;
  const enCurso = oms.filter((w) => w.status !== 'CERRADA' && w.status !== 'CANCELADA').length;

  return (
    <div>
      <h1 className="page-title">Mantenimiento de Mejora</h1>
      <p className="page-sub">Upgrades, reubicaciones y estandarización · trabajos que elevan la capacidad, no solo la reparan</p>

      <div className="kpi-grid">
        <div className="kpi"><div className="label">Mejoras registradas</div><div className="value">{oms.length}</div></div>
        <div className="kpi warn"><div className="label">En curso</div><div className="value">{enCurso}</div></div>
        <div className="kpi ok"><div className="label">Completadas</div><div className="value">{cerradas}</div></div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Código</th><th>Activo</th><th>Zona</th><th>Mejora</th><th>Estado</th><th>Programada</th><th></th></tr>
          </thead>
          <tbody>
            {oms.map((w) => (
              <tr key={w.id}>
                <td style={{ fontWeight: 600 }}>{w.code}</td>
                <td className="muted">{w.asset?.assetCode || '—'}</td>
                <td className="muted" style={{ fontSize: 12 }}>{w.zone || '—'}</td>
                <td style={{ fontSize: 12 }}>{w.activity || '—'}</td>
                <td><span className={'badge ' + (w.status === 'CERRADA' ? 'OPERATIVO' : w.status === 'CANCELADA' ? 'BAJA' : 'MANTENIMIENTO')}>{w.status}</span></td>
                <td className="muted" style={{ fontSize: 12 }}>{fecha(w.scheduledDate)}</td>
                <td><button className="btn-mini" onClick={() => downloadOM(w)}>Informe</button></td>
              </tr>
            ))}
            {!oms.length && (
              <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                Sin mejoras registradas. Créalas desde <b>Mantenimiento</b> eligiendo el tipo “MEJORA”.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
