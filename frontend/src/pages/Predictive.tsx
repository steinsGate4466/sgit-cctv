import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';
import Icono from '../components/Iconos';

/**
 * Mantenimiento Predictivo — alerta temprana por condición.
 * Muestra los activos que están dando señales de que van a fallar, para intervenir
 * ANTES de la falla (ventana P-F). El sistema propone; la persona decide.
 */
const NIVEL_BADGE: Record<string, string> = {
  CRITICO: 'FUERA_SERVICIO', ALTO: 'MANTENIMIENTO', MEDIO: 'CON_INCIDENCIA', BAJO: 'BAJA',
};
const NIVEL_ES: Record<string, string> = {
  CRITICO: 'Crítico', ALTO: 'Alto', MEDIO: 'Medio', BAJO: 'Bajo',
};

export default function Predictive() {
  const { can } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const [r, s] = await Promise.all([
      api.get('/predictive/risk').then((x) => x.data).catch(() => []),
      api.get('/predictive/summary').then((x) => x.data).catch(() => null),
    ]);
    setRows(r || []); setSummary(s);
  }
  useEffect(() => { load().then(() => setLoading(false)); }, []);

  /** Crea una OM PREDICTIVA a partir de la alerta (decisión humana, no automática). */
  async function crearOM(r: any) {
    const señales = r.signals.map((s: any) => `- ${s.senal}: ${s.detalle}`).join('\n');
    if (!window.confirm(`¿Crear una OM PREDICTIVA para ${r.asset.assetCode}?\n\nSeñales detectadas:\n${señales}`)) return;
    setCreating(true);
    try {
      await api.post('/work-orders', {
        type: 'PREDICTIVO',
        assetId: r.asset.id,
        zone: r.asset.cabinet?.code
          ? `${r.asset.location?.name || 'Planta'} — ${r.asset.cabinet.code}`
          : r.asset.location?.name || undefined,
        activity: `Intervención predictiva (riesgo ${NIVEL_ES[r.nivel]}, índice ${r.score}). ${r.recomendacion}`,
        materials: undefined,
        scheduledDate: new Date().toISOString(),
      });
      window.alert('OM predictiva creada. Queda en el módulo de Mantenimiento.');
      setDetail(null);
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo crear la OM.');
    } finally { setCreating(false); }
  }

  if (loading) return <div className="loading">Analizando señales de los activos…</div>;

  return (
    <div>
      <h1 className="page-title">Mantenimiento Predictivo</h1>
      <p className="page-sub">
        Activos que dan señales de falla antes de fallar · basado en la condición registrada, la recurrencia y el estado de los enlaces
      </p>

      <div className="kpi-grid">
        <div className="kpi crit"><div className="label">Riesgo crítico</div><div className="value">{summary?.criticos ?? 0}</div><div className="hint">Intervenir ya</div></div>
        <div className="kpi warn"><div className="label">Riesgo alto</div><div className="value">{summary?.altos ?? 0}</div><div className="hint">Adelantar mantenimiento</div></div>
        <div className="kpi"><div className="label">Riesgo medio</div><div className="value">{summary?.medios ?? 0}</div><div className="hint">Vigilar</div></div>
        <div className="kpi red"><div className="label">Activos en alerta</div><div className="value">{summary?.total ?? 0}</div></div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Activo</th><th>Ubicación</th><th>Índice</th><th>Nivel</th><th>Señal principal</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.asset.id}>
                <td style={{ fontWeight: 600 }}>{r.asset.assetCode}</td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {r.asset.location?.name || '—'}
                  {r.asset.cabinet?.code && <div style={{ fontSize: 11 }}>{r.asset.cabinet.code}</div>}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 60, height: 6, background: '#eef2f9', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        width: `${r.score}%`, height: '100%',
                        background: r.score >= 70 ? 'var(--crit)' : r.score >= 45 ? 'var(--warn)' : 'var(--steel)',
                      }} />
                    </div>
                    <b style={{ fontSize: 12 }}>{r.score}</b>
                  </div>
                </td>
                <td><span className={'badge ' + (NIVEL_BADGE[r.nivel] || 'BAJA')}>{NIVEL_ES[r.nivel]}</span></td>
                <td style={{ fontSize: 12 }}>{r.signals[0]?.senal || '—'}</td>
                <td><button className="btn-mini" onClick={() => setDetail(r)}>Analizar</button></td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                Ningún activo en alerta. Las señales aparecen cuando el técnico registra condición
                “Observado/Cambiar”, hay fallas recurrentes o enlaces inestables.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
        El predictivo <b>no crea órdenes solo</b>: propone y la persona decide. (Solo el preventivo se genera automáticamente.)
      </div>

      {detail && (
        <Modal title={'Análisis · ' + detail.asset.assetCode} onClose={() => setDetail(null)}>
          <div className="frow"><span className="k">Índice de riesgo</span><span className="v"><b>{detail.score}</b> / 100</span></div>
          <div className="frow"><span className="k">Nivel</span><span className="v"><span className={'badge ' + (NIVEL_BADGE[detail.nivel])}>{NIVEL_ES[detail.nivel]}</span></span></div>
          <div className="frow"><span className="k">Criticidad del activo</span><span className="v">{detail.asset.criticality}</span></div>
          <div className="frow"><span className="k">Ubicación</span><span className="v">{detail.asset.location?.name || '—'}</span></div>

          <div className="detail-sec">
            <h4>Señales detectadas</h4>
            {detail.signals.map((s: any, i: number) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.senal}</div>
                <div className="muted" style={{ fontSize: 12 }}>{s.detalle}</div>
              </div>
            ))}
          </div>

          <div className="detail-sec">
            <h4>Recomendación</h4>
            <div className="sign-note" style={{ marginBottom: 0 }}>{detail.recomendacion}</div>
          </div>

          {can('wo.create') && (
            <button className="btn" disabled={creating} onClick={() => crearOM(detail)}>
              {creating ? 'Creando…' : <><Icono n="llaveInglesa" size={15} /> Crear OM predictiva</>}
            </button>
          )}
        </Modal>
      )}
    </div>
  );
}
