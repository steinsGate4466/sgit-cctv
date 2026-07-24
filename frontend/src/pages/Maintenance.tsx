import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';

const TYPES = ['PREVENTIVO', 'CORRECTIVO', 'MEJORA', 'PREDICTIVO'];
// Estados que el técnico puede fijar al registrar la intervención (el cierre lo hace el Jefe).
const WORK_STATES = ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'];
// Estado efectivo del activo (coherente con el módulo de Activos).
const ASSET_STATUS_ES: Record<string, string> = {
  OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento',
  CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock',
};
const aEs = (s: string) => ASSET_STATUS_ES[s] || s;

// Checklist de condición del equipo (evidencia detallada del técnico).
const CONDITION_ITEMS = ['Limpieza', 'Lente / imagen', 'Cableado', 'Fijación / soporte', 'Energía / PoE', 'Conectividad'];
const COND_STATES = ['OK', 'Observado', 'Cambiar'];

function woBadge(s: string) {
  if (s === 'CERRADA') return 'OPERATIVO';
  if (s === 'CANCELADA') return 'BAJA';
  return 'MANTENIMIENTO';
}

function isOverdue(w: any) {
  return w.scheduledDate && new Date(w.scheduledDate) < new Date() && w.status !== 'CERRADA' && w.status !== 'CANCELADA';
}

export default function Maintenance() {
  const { can, user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Buscador documental (registro para análisis de recurrencias).
  const [fq, setFq] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fType, setFType] = useState('');
  const [fStatus, setFStatus] = useState('');

  // Alta de OM (solo Jefe). El código es MANUAL (número que genera SAP).
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ code: '', type: 'PREVENTIVO', assetId: '', activity: '', responsible: '', materials: '', zone: '', incidentId: '', scheduledDate: '' });

  // Registro de intervención (técnico): qué se intervino en el equipo.
  const [intId, setIntId] = useState<string | null>(null);
  const [intForm, setIntForm] = useState<any>({ activity: '', diagnosis: '', materials: '', zone: '', status: 'EN_PROCESO' });
  const [intSaving, setIntSaving] = useState(false);

  // Cierre firmado (solo Jefe de Mantenimiento).
  const [closeId, setCloseId] = useState<string | null>(null);
  const [sig, setSig] = useState<any>({ email: '', password: '', diagnosis: '' });
  const [sigError, setSigError] = useState('');
  const [signing, setSigning] = useState(false);

  // Fotografías / evidencias de la intervención.
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: '200' });
    if (fq.trim()) params.set('q', fq.trim());
    if (fType) params.set('type', fType);
    if (fStatus) params.set('status', fStatus);
    // Fecha local → límites de día en ISO/UTC (respeta el día completo).
    if (from) params.set('from', new Date(from + 'T00:00:00').toISOString());
    if (to) params.set('to', new Date(to + 'T23:59:59.999').toISOString());
    const [wo, ast, inc] = await Promise.all([
      api.get('/work-orders?' + params.toString()).then((r) => r.data).catch(() => ({ data: [] })),
      api.get('/assets').then((r) => r.data).catch(() => []),
      api.get('/incidents').then((r) => r.data).catch(() => []),
    ]);
    setRows(wo.data || []);
    setAssets(ast || []);
    setIncidents(Array.isArray(inc) ? inc : inc.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function clearFilters() {
    setFq(''); setFrom(''); setTo(''); setFType(''); setFStatus('');
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: any = { type: form.type, assetId: form.assetId, activity: form.activity };
      if (form.responsible) body.responsible = form.responsible.trim();
      if (form.materials) body.materials = form.materials;
      if (form.code) body.code = form.code.trim();
      if (form.zone) body.zone = form.zone.trim();
      if (form.incidentId) body.incidentId = form.incidentId;
      if (form.scheduledDate) body.scheduledDate = new Date(form.scheduledDate + 'T08:00:00').toISOString();
      await api.post('/work-orders', body);
      setShowForm(false);
      setForm({ code: '', type: 'PREVENTIVO', assetId: '', activity: '', responsible: '', materials: '', zone: '', incidentId: '', scheduledDate: '' });
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo crear la orden de mantenimiento.');
    } finally { setSaving(false); }
  }

  function openIntervention(w: any) {
    setIntId(w.id);
    setIntForm({ activity: w.activity || '', diagnosis: w.diagnosis || '', materials: w.materials || '', zone: w.zone || '', status: w.status === 'CERRADA' || w.status === 'CANCELADA' ? 'EN_PROCESO' : w.status, condition: w.condition || {} });
  }
  async function submitIntervention(e: FormEvent) {
    e.preventDefault();
    setIntSaving(true);
    try {
      await api.patch('/work-orders/' + intId, {
        activity: intForm.activity || undefined,
        diagnosis: intForm.diagnosis || undefined,
        materials: intForm.materials || undefined,
        zone: intForm.zone || undefined,
        status: intForm.status,
        condition: intForm.condition && Object.keys(intForm.condition).length ? intForm.condition : undefined,
      });
      setIntId(null);
      await load();
    } catch {
      window.alert('No se pudo registrar la intervención.');
    } finally { setIntSaving(false); }
  }

  function openClose(id: string) {
    setCloseId(id);
    setSig({ email: user?.email || '', password: '', diagnosis: '' });
    setSigError('');
  }
  async function submitClose(e: FormEvent) {
    e.preventDefault();
    setSigError('');
    setSigning(true);
    try {
      await api.post('/work-orders/' + closeId + '/close', { email: sig.email, password: sig.password, diagnosis: sig.diagnosis || undefined });
      setCloseId(null);
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      setSigError(Array.isArray(m) ? m.join(', ') : m || 'Firma inválida.');
    } finally { setSigning(false); }
  }

  async function openPhotos(id: string) {
    setPhotoId(id); setFile(null); setCaption('');
    const ev = await api.get('/work-orders/' + id + '/evidence').then((r) => r.data).catch(() => []);
    setEvidence(ev || []);
  }
  async function uploadPhoto(e: FormEvent) {
    e.preventDefault();
    if (!file) { window.alert('Selecciona una imagen.'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (caption) fd.append('caption', caption);
      await api.post('/work-orders/' + photoId + '/evidence', fd);
      setFile(null); setCaption('');
      const ev = await api.get('/work-orders/' + photoId + '/evidence').then((r) => r.data).catch(() => []);
      setEvidence(ev || []);
      await load();
    } catch {
      window.alert('No se pudo subir la imagen.');
    } finally { setUploading(false); }
  }
  async function downloadReport(w: any) {
    try {
      const res = await api.get('/work-orders/' + w.id + '/report', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = (w.code || 'informe') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert('No se pudo generar el informe.');
    }
  }

  if (loading) return <div className="loading">Cargando órdenes de mantenimiento…</div>;

  const openIncidents = incidents.filter((i) => i.status !== 'CERRADA');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Órdenes de Mantenimiento</h1>
          <p className="page-sub">{rows.length} órdenes · preventivo, correctivo y mejora</p>
        </div>
        {can('wo.create') && <button className="btn-primary" onClick={() => setShowForm(true)}>+ Nueva OM</button>}
      </div>

      <div className="filters">
        <div style={{ flex: 1, minWidth: 180 }}><label>Buscar</label><input placeholder="código OM, incidencia, actividad, zona…" value={fq} onChange={(e) => setFq(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} /></div>
        <div><label>Tipo</label><select value={fType} onChange={(e) => setFType(e.target.value)}><option value="">Todos</option>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
        <div><label>Estado</label><select value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">Todos</option>{['ABIERTA', 'EN_PROCESO', 'EN_ESPERA', 'CERRADA', 'CANCELADA'].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label>Desde</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label>Hasta</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="btn-primary" onClick={load}>Buscar</button>
        <button className="btn-mini" onClick={clearFilters}>Limpiar</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Código</th><th>Tipo</th><th>Zona</th><th>Actividad</th><th>Estado</th><th>Activo</th><th>Programada</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id}>
                <td style={{ fontWeight: 600 }}>
                  {w.code}
                  {w.incident && <div className="muted" style={{ fontSize: 10 }}>◦ {w.incident.code}</div>}
                </td>
                <td className="muted" style={{ fontSize: 11 }}>{w.type}</td>
                <td className="muted" style={{ fontSize: 12 }}>{w.zone || '—'}</td>
                <td style={{ fontSize: 12 }}>{w.activity || '—'}</td>
                <td><span className={'badge ' + woBadge(w.status)}>{w.status}</span></td>
                <td className="muted">
                  {w.asset?.assetCode || '—'}
                  {w.asset?.effectiveStatus && <div style={{ marginTop: 3 }}><span className={'badge ' + w.asset.effectiveStatus} style={{ fontSize: 10 }}>{aEs(w.asset.effectiveStatus)}</span></div>}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {w.scheduledDate ? new Date(w.scheduledDate).toLocaleDateString() : '—'}
                  {isOverdue(w) && <span className="badge FUERA_SERVICIO" style={{ marginLeft: 6 }}>Vencida</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {w.status !== 'CERRADA' && w.status !== 'CANCELADA' && can('wo.update') && (
                    <button className="btn-mini" onClick={() => openIntervention(w)}>Registrar</button>
                  )}
                  {w.status !== 'CERRADA' && w.status !== 'CANCELADA' && can('wo.update') && (
                    <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => openPhotos(w.id)}>Fotos</button>
                  )}
                  {w.status !== 'CERRADA' && w.status !== 'CANCELADA' && can('wo.approve') && (
                    <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => openClose(w.id)}>Cerrar</button>
                  )}
                  <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => downloadReport(w)}>Informe</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 30 }}>Sin órdenes de mantenimiento</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Nueva orden de mantenimiento" onClose={() => setShowForm(false)}>
          <form onSubmit={create}>
            <label>Código OM (SAP)</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="N.º generado por SAP (si lo dejas vacío se asigna uno provisional)" />
            <label>Tipo</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label>Activo</label>
            <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} required>
              <option value="">— selecciona —</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.assetCode}</option>)}
            </select>
            <label>Zona de intervención</label>
            <input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="Ej: Horno, Laminación Tren 1, Púlpito…" />
            <label>Incidencia relacionada (opcional)</label>
            <select value={form.incidentId} onChange={(e) => setForm({ ...form, incidentId: e.target.value })}>
              <option value="">— ninguna —</option>
              {openIncidents.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.title}</option>)}
            </select>
            <label>Actividad / descripción</label>
            <input value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} />
            <label>Responsable</label>
            <input value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} placeholder="Nombre del responsable de la OM" />
            <label>Materiales (uno por línea)</label>
            <textarea value={form.materials} onChange={(e) => setForm({ ...form, materials: e.target.value })} rows={3} style={{ width: '100%', resize: 'vertical' }} placeholder="Ej: 2x Conector RJ45 / 1x Fuente PoE 48V" />
            <label>Fecha programada</label>
            <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
            <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Crear OM'}</button>
          </form>
        </Modal>
      )}

      {intId && (
        <Modal title="Registrar intervención" onClose={() => setIntId(null)}>
          <form onSubmit={submitIntervention}>
            <div className="sign-note">Registra qué se está interviniendo en el equipo. El cierre definitivo lo realiza el Jefe de Mantenimiento.</div>
            <label>Zona de intervención</label>
            <input value={intForm.zone} onChange={(e) => setIntForm({ ...intForm, zone: e.target.value })} placeholder="Ej: Horno, Tren 1, Púlpito…" />
            <label>Actividad realizada</label>
            <input value={intForm.activity} onChange={(e) => setIntForm({ ...intForm, activity: e.target.value })} />
            <label>Diagnóstico / detalle de la intervención</label>
            <input value={intForm.diagnosis} onChange={(e) => setIntForm({ ...intForm, diagnosis: e.target.value })} />
            <label>Materiales utilizados (uno por línea)</label>
            <textarea value={intForm.materials} onChange={(e) => setIntForm({ ...intForm, materials: e.target.value })} rows={3} style={{ width: '100%', resize: 'vertical' }} placeholder="Ej: 2x Conector RJ45 / 1x Fuente PoE 48V" />
            <label>Condición del equipo (checklist)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
              {CONDITION_ITEMS.map((item) => (
                <div key={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13 }}>{item}</span>
                  <select
                    value={intForm.condition?.[item] || 'OK'}
                    onChange={(e) => setIntForm({ ...intForm, condition: { ...(intForm.condition || {}), [item]: e.target.value } })}
                    style={{ width: 140 }}
                  >
                    {COND_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>Marca “Observado” o “Cambiar” lo que amerite; alimenta el análisis de reemplazo y el predictivo.</div>
            <label>Estado</label>
            <select value={intForm.status} onChange={(e) => setIntForm({ ...intForm, status: e.target.value })}>
              {WORK_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn" disabled={intSaving}>{intSaving ? 'Guardando…' : 'Guardar intervención'}</button>
          </form>
        </Modal>
      )}

      {closeId && (
        <Modal title="Cerrar OM (firma del Jefe)" onClose={() => setCloseId(null)}>
          <form onSubmit={submitClose}>
            <div className="sign-note">Solo el Jefe de Mantenimiento puede cerrar la OM. Confirma tu identidad: quedará registrado en auditoría quién la cerró.</div>
            <label>Diagnóstico / cierre (opcional)</label>
            <input value={sig.diagnosis} onChange={(e) => setSig({ ...sig, diagnosis: e.target.value })} />
            <label>Correo</label>
            <input type="email" value={sig.email} onChange={(e) => setSig({ ...sig, email: e.target.value })} required />
            <label>Contraseña</label>
            <input type="password" value={sig.password} onChange={(e) => setSig({ ...sig, password: e.target.value })} required />
            {sigError && <div className="error">{sigError}</div>}
            <button className="btn" disabled={signing}>{signing ? 'Firmando…' : 'Firmar y cerrar'}</button>
          </form>
        </Modal>
      )}

      {photoId && (
        <Modal title="Fotografías de la intervención" onClose={() => setPhotoId(null)}>
          <form onSubmit={uploadPhoto}>
            <div className="sign-note">Sube fotos del trabajo realizado. Se incrustarán en el informe PDF de la OM.</div>
            <label>Imagen (JPG / PNG)</label>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <label>Descripción (opcional)</label>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Ej: cámara T1 antes de la limpieza" />
            <button className="btn" disabled={uploading}>{uploading ? 'Subiendo…' : 'Subir foto'}</button>
          </form>
          <div style={{ marginTop: 14 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{evidence.length} foto(s) registradas</div>
            {evidence.map((ev) => (
              <div key={ev.id} style={{ fontSize: 12, padding: '4px 0', borderTop: '1px solid #eee' }}>
                📷 {ev.caption || '(sin descripción)'} <span className="muted">· {new Date(ev.createdAt).toLocaleString()}</span>
              </div>
            ))}
            {!evidence.length && <div className="muted" style={{ fontSize: 12 }}>Aún no hay fotos.</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
