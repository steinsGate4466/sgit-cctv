import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';

// Estado del plan -> clase de badge existente.
const PLAN_BADGE: Record<string, string> = {
  AL_DIA: 'OPERATIVO', PROXIMO: 'MANTENIMIENTO', VENCIDO: 'FUERA_SERVICIO',
  SIN_PROGRAMAR: 'CON_INCIDENCIA', INACTIVO: 'BAJA',
};
const PLAN_ES: Record<string, string> = {
  AL_DIA: 'Al día', PROXIMO: 'Próximo', VENCIDO: 'Vencido', SIN_PROGRAMAR: 'Sin programar', INACTIVO: 'Inactivo',
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

export default function Preventive() {
  const { can } = useAuth();
  const [plans, setPlans] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [oms, setOms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [p, s, w] = await Promise.all([
      api.get('/preventive/plans').then((r) => r.data).catch(() => []),
      api.get('/preventive/summary').then((r) => r.data).catch(() => null),
      api.get('/work-orders?type=PREVENTIVO&pageSize=200').then((r) => r.data).catch(() => ({ data: [] })),
    ]);
    setPlans(p || []);
    setSummary(s);
    setOms(w.data || []);
  }
  useEffect(() => {
    Promise.all([
      api.get('/preventive/plans').then((r) => r.data).catch(() => []),
      api.get('/preventive/summary').then((r) => r.data).catch(() => null),
      api.get('/assets').then((r) => r.data).catch(() => []),
      api.get('/work-orders?type=PREVENTIVO&pageSize=200').then((r) => r.data).catch(() => ({ data: [] })),
    ]).then(([p, s, a, w]) => { setPlans(p || []); setSummary(s); setAssets(a || []); setOms(w.data || []); setLoading(false); });
  }, []);

  async function generate() {
    if (!window.confirm('¿Generar las OM preventivas de los planes vencidos?')) return;
    setGenerating(true);
    try {
      const r = await api.post('/preventive/generate', {});
      window.alert(`Se generaron ${r.data?.generated ?? 0} OM preventiva(s).`);
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo generar.');
    } finally { setGenerating(false); }
  }

  function openNew() {
    setForm({ assetId: '', intervalMonths: 6, zoneCritical: false, lastServiceAt: '', active: true });
  }
  function openEdit(p: any) {
    setForm({
      assetId: p.assetId, assetCode: p.asset?.assetCode,
      intervalMonths: p.intervalMonths, zoneCritical: p.zoneCritical,
      lastServiceAt: p.lastServiceAt ? String(p.lastServiceAt).slice(0, 10) : '',
      active: p.active,
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.assetId) { window.alert('Selecciona un activo.'); return; }
    setSaving(true);
    try {
      const body: any = {
        assetId: form.assetId,
        intervalMonths: Number(form.intervalMonths) || (form.zoneCritical ? 3 : 6),
        zoneCritical: !!form.zoneCritical,
        active: !!form.active,
      };
      if (form.lastServiceAt) body.lastServiceAt = new Date(form.lastServiceAt + 'T08:00:00').toISOString();
      await api.post('/preventive/plans', body);
      setForm(null);
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar el plan.');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="loading">Cargando plan preventivo…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Mantenimiento Preventivo</h1>
          <p className="page-sub">Programación por activo · 3 meses en zonas críticas, 6 meses en el resto</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {can('wo.create') && <button className="btn-mini" onClick={openNew}>+ Nuevo plan</button>}
          {can('wo.create') && <button className="btn-primary" disabled={generating} onClick={generate}>{generating ? 'Generando…' : 'Generar OM vencidas'}</button>}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi ok"><div className="label">Al día</div><div className="value">{summary?.alDia ?? 0}</div></div>
        <div className="kpi warn"><div className="label">Próximos (30 días)</div><div className="value">{summary?.proximos ?? 0}</div></div>
        <div className="kpi crit"><div className="label">Vencidos</div><div className="value">{summary?.vencidos ?? 0}</div></div>
        <div className="kpi"><div className="label">Sin programar</div><div className="value">{summary?.sinProgramar ?? 0}</div></div>
        <div className="kpi"><div className="label">Total con plan</div><div className="value">{summary?.total ?? 0}</div></div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Activo</th><th>Ubicación</th><th>Zona</th><th>Intervalo</th><th>Último</th><th>Próximo</th><th>Estado</th>{can('wo.create') && <th></th>}</tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.asset?.assetCode || '—'}</td>
                <td className="muted">{p.asset?.location?.name || '—'}</td>
                <td>{p.zoneCritical ? <span className="badge ALTA">Crítica</span> : <span className="badge BAJA">Normal</span>}</td>
                <td>{p.intervalMonths} meses</td>
                <td className="muted">{fmt(p.lastServiceAt)}</td>
                <td className="muted">{fmt(p.nextDueAt)}</td>
                <td><span className={'badge ' + (PLAN_BADGE[p.statusPlan] || 'BAJA')}>{PLAN_ES[p.statusPlan] || p.statusPlan}</span></td>
                {can('wo.create') && <td><button className="btn-mini" onClick={() => openEdit(p)}>Editar</button></td>}
              </tr>
            ))}
            {!plans.length && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 30 }}>Sin planes preventivos. Crea uno con “+ Nuevo plan”.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 style={{ margin: '22px 0 10px', color: 'var(--navy)', fontSize: 15 }}>Órdenes preventivas ({oms.length})</h3>
      <div className="card">
        <table>
          <thead>
            <tr><th>Código</th><th>Activo</th><th>Zona</th><th>Actividad</th><th>Estado</th><th>Programada</th></tr>
          </thead>
          <tbody>
            {oms.map((w) => (
              <tr key={w.id}>
                <td style={{ fontWeight: 600 }}>{w.code}</td>
                <td className="muted">{w.asset?.assetCode || '—'}</td>
                <td className="muted" style={{ fontSize: 12 }}>{w.zone || '—'}</td>
                <td style={{ fontSize: 12 }}>{w.activity || '—'}</td>
                <td><span className={'badge ' + (w.status === 'CERRADA' ? 'OPERATIVO' : w.status === 'CANCELADA' ? 'BAJA' : 'MANTENIMIENTO')}>{w.status}</span></td>
                <td className="muted" style={{ fontSize: 12 }}>{w.scheduledDate ? new Date(w.scheduledDate).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {!oms.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>Aún no hay OM preventivas. Usa “Generar OM vencidas”.</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.assetCode ? 'Editar plan · ' + form.assetCode : 'Nuevo plan preventivo'} onClose={() => setForm(null)}>
          <form onSubmit={submit}>
            {!form.assetCode && (
              <>
                <label>Activo</label>
                <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} required>
                  <option value="">— selecciona —</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.assetCode}</option>)}
                </select>
              </>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, marginTop: 10 }}>
              <input type="checkbox" checked={!!form.zoneCritical} onChange={(e) => setForm({ ...form, zoneCritical: e.target.checked, intervalMonths: e.target.checked ? 3 : 6 })} style={{ width: 'auto' }} />
              Zona crítica (cerca del horno / alta exposición) → 3 meses
            </label>
            <label>Intervalo (meses)</label>
            <input type="number" min={1} value={form.intervalMonths} onChange={(e) => setForm({ ...form, intervalMonths: e.target.value })} />
            <label>Último mantenimiento (opcional)</label>
            <input type="date" value={form.lastServiceAt} onChange={(e) => setForm({ ...form, lastServiceAt: e.target.value })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, marginTop: 10 }}>
              <input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} style={{ width: 'auto' }} />
              Plan activo
            </label>
            <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar plan'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
