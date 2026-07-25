import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';

const MEANS = ['MANLIFT', 'GRUA', 'ANDAMIO', 'ESCALERA', 'LINEA_VIDA', 'OTRO'];
const MEANS_ES: Record<string, string> = {
  MANLIFT: 'Manlift (plataforma elevadora)', GRUA: 'Grúa / izaje', ANDAMIO: 'Andamio',
  ESCALERA: 'Escalera', LINEA_VIDA: 'Línea de vida', OTRO: 'Otro',
};
const STATUSES = ['SOLICITADO', 'EN_REVISION', 'APROBADO', 'RECHAZADO'];
const STATUS_ES: Record<string, string> = {
  SOLICITADO: 'Solicitado', EN_REVISION: 'En revisión', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado',
};
const STATUS_BADGE: Record<string, string> = {
  SOLICITADO: 'MANTENIMIENTO', EN_REVISION: 'CON_INCIDENCIA', APROBADO: 'OPERATIVO', RECHAZADO: 'FUERA_SERVICIO',
};
const LOCATION_KINDS = ['Poste', 'Estructura metálica', 'Grúa / puente grúa', 'Techo', 'Torre', 'Muro alto', 'Otro'];
const ALTURA_MIN = 1.8; // trabajo en altura según normativa

export default function Access() {
  const { can, user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fStatus, setFStatus] = useState('');

  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const [decide, setDecide] = useState<any>(null);
  const [signing, setSigning] = useState(false);
  const [sigError, setSigError] = useState('');
  const [tries, setTries] = useState(5);

  async function load() {
    const params = fStatus ? `?status=${fStatus}` : '';
    const [r, s] = await Promise.all([
      api.get('/access-requests' + params).then((x) => x.data).catch(() => []),
      api.get('/access-requests/summary').then((x) => x.data).catch(() => null),
    ]);
    setRows(r || []);
    setSummary(s);
  }
  useEffect(() => {
    Promise.all([
      api.get('/access-requests').then((r) => r.data).catch(() => []),
      api.get('/access-requests/summary').then((r) => r.data).catch(() => null),
      api.get('/assets').then((r) => r.data).catch(() => []),
    ]).then(([r, s, a]) => { setRows(r || []); setSummary(s); setAssets(a || []); setLoading(false); });
  }, []);

  function openNew() {
    setForm({
      assetId: '', heightMeters: '', means: 'MANLIFT', locationKind: 'Poste', justification: '',
      accessRoute: '', requiresPetar: true, hasIperc: false, hasAts: false, personnelCount: 2,
      eppDetail: 'Arnés de cuerpo entero, línea de vida con absorbedor, casco con barbiquejo',
      risks: '', productionImpact: '',
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if ((form.justification || '').trim().length < 20) {
      window.alert('La justificación debe ser detallada (mínimo 20 caracteres). El manlift es un recurso costoso y debe sustentarse.');
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        assetId: form.assetId,
        means: form.means,
        locationKind: form.locationKind || undefined,
        justification: form.justification,
        accessRoute: form.accessRoute || undefined,
        requiresPetar: !!form.requiresPetar,
        hasIperc: !!form.hasIperc,
        hasAts: !!form.hasAts,
        eppDetail: form.eppDetail || undefined,
        risks: form.risks || undefined,
        productionImpact: form.productionImpact || undefined,
      };
      if (form.heightMeters) body.heightMeters = Number(form.heightMeters);
      if (form.personnelCount) body.personnelCount = Number(form.personnelCount);
      const res = await api.post('/access-requests', body);
      setForm(null);
      await load();
      window.alert(`Solicitud ${res.data?.code} registrada. Adjunta las fotos que sustentan la inaccesibilidad: sin ellas el Jefe no puede aprobarla.`);
      openDetail(res.data.id);
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo registrar la solicitud.');
    } finally { setSaving(false); }
  }

  async function openDetail(id: string) {
    const d = await api.get('/access-requests/' + id).then((r) => r.data).catch(() => null);
    setDetail(d);
    setPhotos(d?.photos || []);
    setFile(null); setCaption('');
  }
  async function uploadPhoto(e: FormEvent) {
    e.preventDefault();
    if (!file) { window.alert('Selecciona una imagen.'); return; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file); if (caption) fd.append('caption', caption);
      await api.post('/access-requests/' + detail.id + '/photos', fd);
      setFile(null); setCaption('');
      const ph = await api.get('/access-requests/' + detail.id + '/photos').then((r) => r.data).catch(() => []);
      setPhotos(ph || []);
      await load();
    } catch { window.alert('No se pudo subir la foto.'); }
    finally { setUploading(false); }
  }
  async function viewPhoto(ph: any) {
    try {
      const res = await api.get('/access-requests/photos/' + ph.id + '/file', { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch { window.alert('No se pudo abrir la foto.'); }
  }
  async function downloadReport(r: any) {
    try {
      const res = await api.get('/access-requests/' + r.id + '/report', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = (r.code || 'acceso') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { window.alert('No se pudo generar el documento.'); }
  }

  function openDecide(r: any, status: string) {
    setDecide({ id: r.id, code: r.code, status, decisionNotes: '', email: user?.email || '', password: '' });
    setSigError(''); setTries(5);
  }
  async function submitDecide(e: FormEvent) {
    e.preventDefault();
    setSigError(''); setSigning(true);
    try {
      await api.post('/access-requests/' + decide.id + '/decide', {
        status: decide.status,
        decisionNotes: decide.decisionNotes || undefined,
        email: decide.email,
        password: decide.password,
      });
      setDecide(null); setDetail(null);
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      const msg = Array.isArray(m) ? m.join(', ') : m || 'No se pudo registrar la decisión.';
      if (/firma inv|contrase/i.test(msg)) {
        const left = tries - 1; setTries(left);
        setSigError(left > 0 ? `Contraseña incorrecta. Te quedan ${left} intento(s).` : 'Contraseña incorrecta. Sin intentos restantes.');
      } else setSigError(msg);
    } finally { setSigning(false); }
  }

  if (loading) return <div className="loading">Cargando solicitudes de acceso…</div>;

  const pendiente = (r: any) => r.status === 'SOLICITADO' || r.status === 'EN_REVISION';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Accesibilidad y Trabajo en Altura</h1>
          <p className="page-sub">Solicitudes de manlift / izaje · sustento fotográfico y aprobación del Jefe de Mantenimiento</p>
        </div>
        {can('access.request') && <button className="btn-primary" onClick={openNew}>+ Nueva solicitud</button>}
      </div>

      <div className="kpi-grid">
        <div className="kpi warn"><div className="label">Pendientes</div><div className="value">{summary?.pendientes ?? 0}</div><div className="hint">Esperan revisión del Jefe</div></div>
        <div className="kpi ok"><div className="label">Aprobadas</div><div className="value">{summary?.aprobadas ?? 0}</div></div>
        <div className="kpi crit"><div className="label">Rechazadas</div><div className="value">{summary?.rechazadas ?? 0}</div></div>
        <div className="kpi red"><div className="label">Activos con acceso especial</div><div className="value">{summary?.activosConAccesoEspecial ?? 0}</div><div className="hint">Agrúpalos en una sola movilización</div></div>
      </div>

      <div className="filters">
        <div><label>Estado</label>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Todos</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_ES[s]}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={load}>Buscar</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Código</th><th>Activo</th><th>Medio</th><th>Altura</th><th>Fotos</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.code}</td>
                <td className="muted">{r.asset?.assetCode || '—'}<div style={{ fontSize: 11 }}>{r.asset?.location?.name || ''}</div></td>
                <td style={{ fontSize: 12 }}>{MEANS_ES[r.means] || r.means}</td>
                <td>
                  {r.heightMeters != null ? `${r.heightMeters} m` : '—'}
                  {r.trabajoEnAltura && <div><span className="badge ALTA" style={{ fontSize: 10 }}>Trabajo en altura</span></div>}
                </td>
                <td>{r.photoCount > 0 ? r.photoCount : <span className="badge FUERA_SERVICIO" style={{ fontSize: 10 }}>Sin sustento</span>}</td>
                <td><span className={'badge ' + (STATUS_BADGE[r.status] || 'BAJA')}>{STATUS_ES[r.status] || r.status}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn-mini" onClick={() => openDetail(r.id)}>Ver</button>
                  <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => downloadReport(r)}>Documento</button>
                  {can('access.approve') && pendiente(r) && (
                    <>
                      <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => openDecide(r, 'APROBADO')}>Aprobar</button>
                      <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => openDecide(r, 'RECHAZADO')}>Rechazar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>Sin solicitudes de acceso registradas.</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title="Nueva solicitud de acceso especial" onClose={() => setForm(null)}>
          <form onSubmit={submit}>
            <div className="sign-note">
              El manlift y el izaje son recursos costosos y el trabajo en altura (desde 1.80 m) es de alto riesgo.
              Completa el sustento con detalle: el Jefe de Mantenimiento aprobará en base a esta información.
            </div>
            <label>Activo inaccesible</label>
            <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} required>
              <option value="">— selecciona —</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.assetCode}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label>Altura estimada (m)</label>
                <input type="number" step="0.1" min="0" value={form.heightMeters}
                  onChange={(e) => setForm({ ...form, heightMeters: e.target.value, requiresPetar: Number(e.target.value) >= ALTURA_MIN ? true : form.requiresPetar })} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Medio requerido</label>
                <select value={form.means} onChange={(e) => setForm({ ...form, means: e.target.value })}>
                  {MEANS.map((m) => <option key={m} value={m}>{MEANS_ES[m]}</option>)}
                </select>
              </div>
            </div>
            {Number(form.heightMeters) >= ALTURA_MIN && (
              <div className="error" style={{ marginTop: 8 }}>
                ⚠️ Clasifica como <b>trabajo en altura</b> (≥ 1.80 m): requiere PETAR, personal acreditado y EPP anticaídas.
              </div>
            )}
            <label>Tipo de emplazamiento</label>
            <select value={form.locationKind} onChange={(e) => setForm({ ...form, locationKind: e.target.value })}>
              {LOCATION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <label>¿Por qué es inaccesible sin este medio? (obligatorio y detallado)</label>
            <textarea value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })}
              rows={3} style={{ width: '100%', resize: 'vertical' }}
              placeholder="Ej: cámara montada a 7 m sobre estructura del puente grúa; no hay punto de anclaje ni acceso por escalera; el área no permite andamio por tránsito de material." required />
            <label>Ruta de acceso / restricciones de la zona</label>
            <input value={form.accessRoute} onChange={(e) => setForm({ ...form, accessRoute: e.target.value })}
              placeholder="Ej: ingreso por nave 2, coordinar paso de grúa puente" />

            <h4 style={{ marginTop: 14, marginBottom: 4 }}>🦺 Seguridad (SSOMA)</h4>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
              <input type="checkbox" checked={!!form.requiresPetar} onChange={(e) => setForm({ ...form, requiresPetar: e.target.checked })} style={{ width: 'auto' }} />
              Requiere PETAR (permiso de trabajo de alto riesgo)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
              <input type="checkbox" checked={!!form.hasIperc} onChange={(e) => setForm({ ...form, hasIperc: e.target.checked })} style={{ width: 'auto' }} />
              IPERC elaborado
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
              <input type="checkbox" checked={!!form.hasAts} onChange={(e) => setForm({ ...form, hasAts: e.target.checked })} style={{ width: 'auto' }} />
              ATS del día
            </label>
            <label>Personal asignado (mínimo 2 en trabajo en altura)</label>
            <input type="number" min={1} value={form.personnelCount} onChange={(e) => setForm({ ...form, personnelCount: e.target.value })} />
            <label>EPP requerido</label>
            <textarea value={form.eppDetail} onChange={(e) => setForm({ ...form, eppDetail: e.target.value })} rows={2} style={{ width: '100%', resize: 'vertical' }} />
            <label>Riesgos identificados</label>
            <textarea value={form.risks} onChange={(e) => setForm({ ...form, risks: e.target.value })} rows={2} style={{ width: '100%', resize: 'vertical' }}
              placeholder="Ej: caída a distinto nivel, proximidad a carga suspendida, calor radiante del horno" />
            <label>Impacto en producción</label>
            <input value={form.productionImpact} onChange={(e) => setForm({ ...form, productionImpact: e.target.value })}
              placeholder="Ej: requiere detener el puente grúa 40 min, coordinar con Jefe de Línea" />
            <button className="btn" disabled={saving}>{saving ? 'Registrando…' : 'Registrar solicitud'}</button>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal title={'Solicitud ' + detail.code} onClose={() => setDetail(null)}>
          <div className="frow"><span className="k">Activo</span><span className="v">{detail.asset?.assetCode}</span></div>
          <div className="frow"><span className="k">Medio</span><span className="v">{MEANS_ES[detail.means] || detail.means}</span></div>
          <div className="frow"><span className="k">Altura</span><span className="v">{detail.heightMeters != null ? `${detail.heightMeters} m` : '—'}</span></div>
          <div className="frow"><span className="k">Estado</span><span className="v"><span className={'badge ' + (STATUS_BADGE[detail.status] || 'BAJA')}>{STATUS_ES[detail.status]}</span></span></div>
          <div className="frow"><span className="k">Solicitado por</span><span className="v">{detail.requestedBy?.fullName || '—'}</span></div>
          {detail.reviewedBy && <div className="frow"><span className="k">Resuelto por</span><span className="v">{detail.reviewedBy.fullName}</span></div>}

          <div className="detail-sec">
            <h4>Justificación</h4>
            <div style={{ fontSize: 13 }}>{detail.justification}</div>
          </div>
          <div className="detail-sec">
            <h4>Seguridad (SSOMA)</h4>
            <div className="frow"><span className="k">PETAR</span><span className="v">{detail.requiresPetar ? 'Sí' : 'No'}</span></div>
            <div className="frow"><span className="k">IPERC</span><span className="v">{detail.hasIperc ? 'Sí' : 'No'}</span></div>
            <div className="frow"><span className="k">ATS</span><span className="v">{detail.hasAts ? 'Sí' : 'No'}</span></div>
            <div className="frow"><span className="k">Personal</span><span className="v">{detail.personnelCount ?? '—'}</span></div>
          </div>

          <div className="detail-sec">
            <h4>📷 Sustento fotográfico ({photos.length})</h4>
            {photos.length ? photos.map((ph) => (
              <div key={ph.id} className="frow">
                <span className="v">{ph.caption || '(sin descripción)'}</span>
                <button className="btn-mini" onClick={() => viewPhoto(ph)}>Ver</button>
              </div>
            )) : <div className="muted" style={{ fontSize: 12 }}>Sin fotos. <b>El Jefe no puede aprobar sin sustento fotográfico.</b></div>}
            {can('access.request') && detail.status !== 'APROBADO' && detail.status !== 'RECHAZADO' && (
              <form onSubmit={uploadPhoto} style={{ marginTop: 8 }}>
                <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Descripción (ej: altura del montaje)" style={{ marginTop: 6 }} />
                <button className="btn-mini" style={{ marginTop: 6 }} disabled={uploading}>{uploading ? 'Subiendo…' : 'Subir foto'}</button>
              </form>
            )}
          </div>

          <button className="btn" onClick={() => downloadReport(detail)}>📄 Descargar documento sustentado</button>
        </Modal>
      )}

      {decide && (
        <Modal title={(decide.status === 'APROBADO' ? 'Aprobar' : 'Rechazar') + ' solicitud ' + decide.code} onClose={() => setDecide(null)}>
          <form onSubmit={submitDecide}>
            <div className="sign-note">
              {decide.status === 'APROBADO'
                ? 'Al aprobar autorizas el uso del medio solicitado (manlift/izaje). Requiere sustento fotográfico y queda firmado y auditado.'
                : 'Indica el motivo del rechazo para que el técnico pueda corregir o replantear el trabajo.'}
            </div>
            <label>Observaciones {decide.status === 'RECHAZADO' ? '(motivo)' : '(condiciones)'}</label>
            <textarea value={decide.decisionNotes} onChange={(e) => setDecide({ ...decide, decisionNotes: e.target.value })} rows={3} style={{ width: '100%', resize: 'vertical' }} />
            <h4 style={{ marginTop: 12, marginBottom: 4 }}>🔏 Firma del Jefe de Mantenimiento</h4>
            <label>Correo</label>
            <input type="email" value={decide.email} onChange={(e) => setDecide({ ...decide, email: e.target.value })} required />
            <label>Contraseña</label>
            <input type="password" value={decide.password} onChange={(e) => setDecide({ ...decide, password: e.target.value })} required />
            {sigError && <div className="error">{sigError}</div>}
            <button className="btn" disabled={signing || tries <= 0}>{signing ? 'Firmando…' : 'Firmar y registrar decisión'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
