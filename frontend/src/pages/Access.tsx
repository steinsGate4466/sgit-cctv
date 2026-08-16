import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import AccessRequestForm, { MEANS_ES, STATUS_ES, STATUS_BADGE } from '../components/AccessRequestForm';
import { useAuth } from '../auth/AuthContext';
import Icono from '../components/Iconos';
import { useDialogos } from '../components/Dialogos';
import { fecha } from '../formato';

/**
 * Bandeja de Accesibilidad y Trabajo en Altura.
 * El técnico marca el activo como inaccesible desde ACTIVOS; aquí se revisa,
 * se analiza el sustento y el Jefe de Mantenimiento da el visto bueno.
 */
const STATUSES = ['SOLICITADO', 'EN_REVISION', 'APROBADO', 'RECHAZADO'];

export default function Access() {
  const { avisar } = useDialogos();
  const { can, user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fStatus, setFStatus] = useState('');
  const [showNew, setShowNew] = useState(false);

  const [detail, setDetail] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);

  const [decide, setDecide] = useState<any>(null);
  const [signing, setSigning] = useState(false);
  const [sigError, setSigError] = useState('');
  const [tries, setTries] = useState(5);

  async function load(status = fStatus) {
    const [r, s] = await Promise.all([
      api.get('/access-requests' + (status ? `?status=${status}` : '')).then((x) => x.data).catch(() => []),
      api.get('/access-requests/summary').then((x) => x.data).catch(() => null),
    ]);
    setRows(r || []); setSummary(s);
  }
  useEffect(() => {
    Promise.all([
      api.get('/access-requests').then((r) => r.data).catch(() => []),
      api.get('/access-requests/summary').then((r) => r.data).catch(() => null),
      api.get('/assets/options').then((r) => r.data).catch(() => []),
    ]).then(([r, s, a]) => { setRows(r || []); setSummary(s); setAssets(a || []); setLoading(false); });
  }, []);

  async function openDetail(id: string) {
    const d = await api.get('/access-requests/' + id).then((r) => r.data).catch(() => null);
    setDetail(d); setPhotos(d?.photos || []);
  }
  async function viewPhoto(ph: any) {
    try {
      const res = await api.get('/access-requests/photos/' + ph.id + '/file', { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch { await avisar('No se pudo abrir la foto.'); }
  }
  async function downloadReport(r: any) {
    try {
      const res = await api.get('/access-requests/' + r.id + '/report', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = (r.code || 'acceso') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { await avisar('No se pudo generar el documento.'); }
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
        email: decide.email, password: decide.password,
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
  const pendientes = rows.filter(pendiente);
  const resueltas = rows.filter((r) => !pendiente(r));

  const Tabla = ({ data, titulo, resaltar }: { data: any[]; titulo: string; resaltar?: boolean }) => (
    <>
      <h3 style={{ margin: '20px 0 10px', color: 'var(--navy)', fontSize: 15 }}>{titulo} ({data.length})</h3>
      <div className="card">
        <table>
          <thead>
            <tr><th>Código</th><th>Activo</th><th>Medio</th><th>Altura</th><th>Evidencia</th><th>Estado</th><th>Fecha</th><th></th></tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.code}</td>
                <td className="muted">
                  {r.asset?.assetCode || '—'}
                  <div style={{ fontSize: 11 }}>{r.asset?.location?.name || ''}</div>
                </td>
                <td style={{ fontSize: 12 }}>{MEANS_ES[r.means] || r.means}</td>
                <td>
                  {r.heightMeters != null ? `${r.heightMeters} m` : '—'}
                  {r.trabajoEnAltura && <div><span className="badge ALTA" style={{ fontSize: 10 }}>Altura</span></div>}
                </td>
                <td>
                  {r.photoCount > 0
                    ? <span className="badge OPERATIVO" style={{ fontSize: 10 }}>{r.photoCount} foto(s)</span>
                    : <span className="badge FUERA_SERVICIO" style={{ fontSize: 10 }}>Sin evidencia</span>}
                </td>
                <td><span className={'badge ' + (STATUS_BADGE[r.status] || 'BAJA')}>{STATUS_ES[r.status] || r.status}</span></td>
                <td className="muted" style={{ fontSize: 12 }}>{fecha(r.createdAt)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn-mini" onClick={() => openDetail(r.id)}>Revisar</button>
                  <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => downloadReport(r)}>Informe</button>
                </td>
              </tr>
            ))}
            {!data.length && (
              <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 26 }}>
                {resaltar ? 'No hay solicitudes esperando revisión.' : 'Sin registros.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Accesibilidad y Trabajo en Altura</h1>
          <p className="page-sub">Equipos que no se pueden intervenir sin manlift, grúa o andamio · revisión y visto bueno del Jefe de Mantenimiento</p>
        </div>
        {can('access.request') && <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nueva solicitud</button>}
      </div>

      <div className="kpi-grid">
        <div className="kpi warn"><div className="label">Esperan revisión</div><div className="value">{summary?.pendientes ?? 0}</div><div className="hint">Requieren visto bueno del Jefe</div></div>
        <div className="kpi ok"><div className="label">Aprobadas</div><div className="value">{summary?.aprobadas ?? 0}</div></div>
        <div className="kpi crit"><div className="label">Rechazadas</div><div className="value">{summary?.rechazadas ?? 0}</div></div>
        <div className="kpi red"><div className="label">Activos con acceso especial</div><div className="value">{summary?.activosConAccesoEspecial ?? 0}</div><div className="hint">Agrúpalos en una sola movilización de manlift</div></div>
      </div>

      <div className="filters">
        <div><label>Estado</label>
          <select value={fStatus} onChange={(e) => { setFStatus(e.target.value); load(e.target.value); }}>
            <option value="">Todos</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_ES[s]}</option>)}
          </select>
        </div>
        <div className="muted" style={{ fontSize: 12, alignSelf: 'flex-end', paddingBottom: 8 }}>
          El técnico marca el activo como inaccesible desde <b>Activos</b>; aquí se revisa y aprueba.
        </div>
      </div>

      <Tabla data={pendientes} titulo="Pendientes de revisión" resaltar />
      <Tabla data={resueltas} titulo="✓ Resueltas" />

      {showNew && (
        <Modal title="Nueva solicitud de acceso especial" onClose={() => setShowNew(false)}>
          <AccessRequestForm assets={assets} onDone={async () => { setShowNew(false); await load(); }} />
        </Modal>
      )}

      {detail && (
        <Modal title={'Revisión · ' + detail.code} onClose={() => setDetail(null)}>
          <div className="frow"><span className="k">Activo</span><span className="v">{detail.asset?.assetCode}</span></div>
          <div className="frow"><span className="k">Ubicación</span><span className="v">{detail.asset?.location?.name || '—'}</span></div>
          <div className="frow"><span className="k">Medio requerido</span><span className="v">{MEANS_ES[detail.means] || detail.means}</span></div>
          <div className="frow"><span className="k">Altura</span><span className="v">{detail.heightMeters != null ? `${detail.heightMeters} m` : '—'}{detail.trabajoEnAltura ? ' (trabajo en altura)' : ''}</span></div>
          <div className="frow"><span className="k">Emplazamiento</span><span className="v">{detail.locationKind || '—'}</span></div>
          <div className="frow"><span className="k">Solicitado por</span><span className="v">{detail.requestedBy?.fullName || '—'}</span></div>
          <div className="frow"><span className="k">Estado</span><span className="v"><span className={'badge ' + (STATUS_BADGE[detail.status] || 'BAJA')}>{STATUS_ES[detail.status]}</span></span></div>

          <div className="detail-sec">
            <h4>Sustento del técnico</h4>
            <div style={{ fontSize: 13 }}>{detail.justification}</div>
            {detail.accessRoute && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Ruta: {detail.accessRoute}</div>}
          </div>

          <div className="detail-sec">
            <h4><Icono n="seguridad" size={15} /> Seguridad (SSOMA)</h4>
            <div className="frow"><span className="k">PETAR</span><span className="v">{detail.requiresPetar ? 'Sí' : 'No'}</span></div>
            <div className="frow"><span className="k">IPERC</span><span className="v">{detail.hasIperc ? 'Sí' : 'No'}</span></div>
            <div className="frow"><span className="k">ATS</span><span className="v">{detail.hasAts ? 'Sí' : 'No'}</span></div>
            <div className="frow"><span className="k">Personal</span><span className="v">{detail.personnelCount ?? '—'}</span></div>
            {detail.risks && <div style={{ fontSize: 12, marginTop: 6 }}><b>Riesgos:</b> {detail.risks}</div>}
            {detail.productionImpact && <div style={{ fontSize: 12, marginTop: 4 }}><b>Impacto en producción:</b> {detail.productionImpact}</div>}
          </div>

          <div className="detail-sec">
            <h4><Icono n="camara" size={15} /> Evidencia ({photos.length})</h4>
            {photos.length ? photos.map((ph) => (
              <div key={ph.id} className="frow">
                <span className="v" style={{ fontSize: 12 }}>{ph.caption || '(sin descripción)'}</span>
                <button className="btn-mini" onClick={() => viewPhoto(ph)}>Ver</button>
              </div>
            )) : <div className="error">Sin evidencia fotográfica: no se puede aprobar.</div>}
          </div>

          {detail.decisionNotes && (
            <div className="detail-sec">
              <h4>Resolución</h4>
              <div style={{ fontSize: 13 }}>{detail.decisionNotes}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Por {detail.reviewedBy?.fullName || '—'}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn-mini" onClick={() => downloadReport(detail)}><Icono n="pdf" size={14} /> Informe</button>
            {can('access.approve') && pendiente(detail) && (
              <>
                <button className="btn-mini" onClick={() => openDecide(detail, 'APROBADO')}>✓ Aprobar</button>
                <button className="btn-mini" onClick={() => openDecide(detail, 'RECHAZADO')}>✕ Rechazar</button>
              </>
            )}
          </div>
        </Modal>
      )}

      {decide && (
        <Modal title={(decide.status === 'APROBADO' ? 'Aprobar' : 'Rechazar') + ' · ' + decide.code} onClose={() => setDecide(null)}>
          <form onSubmit={submitDecide}>
            <div className="sign-note">
              {decide.status === 'APROBADO'
                ? 'Al aprobar autorizas el uso del medio solicitado (manlift/izaje) y las condiciones de seguridad. Queda firmado y auditado.'
                : 'Indica el motivo del rechazo o cómo debe replantearse el trabajo.'}
            </div>
            <label>{decide.status === 'APROBADO' ? 'Condiciones / indicaciones' : 'Motivo del rechazo'}</label>
            <textarea value={decide.decisionNotes} onChange={(e) => setDecide({ ...decide, decisionNotes: e.target.value })}
              rows={3} style={{ width: '100%', resize: 'vertical' }} />
            <h4 style={{ marginTop: 12, marginBottom: 4 }}><Icono n="firma" size={15} /> Firma del Jefe de Mantenimiento</h4>
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
