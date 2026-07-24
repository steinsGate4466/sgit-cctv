import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';

const TYPES = ['CAMERA', 'NVR', 'SWITCH', 'WIRELESS', 'ROUTER', 'FIREWALL', 'SERVER', 'UPS', 'FIBER', 'CABINET', 'DECODER', 'PC', 'OTHER'];
const STATES = ['OPERATIVO', 'FUERA_SERVICIO', 'MANTENIMIENTO', 'BAJA', 'STOCK'];
const CRITS = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
// Tipos montados en rack: es obligatorio indicar en qué gabinete están.
const CABINET_REQUIRED = ['NVR', 'SWITCH', 'SERVER', 'DECODER', 'ROUTER', 'FIREWALL'];

// Etiquetas en español (los valores internos siguen en inglés para no romper datos)
const TYPE_ES: Record<string, string> = { CAMERA: 'Cámara', NVR: 'NVR', SWITCH: 'Switch', WIRELESS: 'Enlace inalámbrico', ROUTER: 'Router', FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', FIBER: 'Fibra', CABINET: 'Gabinete', DECODER: 'Decodificador', PC: 'PC / iVMS-4200', OTHER: 'Otro' };
const STATUS_ES: Record<string, string> = { OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento', CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock' };
const CRIT_ES: Record<string, string> = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Crítica' };
const tEs = (v: string) => TYPE_ES[v] || v;
const sEs = (v: string) => STATUS_ES[v] || v;
const cEs = (v: string) => CRIT_ES[v] || v;

function Frow({ k, v }: { k: string; v: any }) {
  return (
    <div className="frow">
      <span className="k">{k}</span>
      <span className="v">{v === null || v === undefined || v === '' ? '—' : String(v)}</span>
    </div>
  );
}

export default function Assets() {
  const { can, user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [cabinets, setCabinets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [creds, setCreds] = useState<any[]>([]);
  const [revealed, setRevealed] = useState<any>({});

  // Alta firmada de activo
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [tries, setTries] = useState(5);

  // Actualización de estado (Técnico / Técnico de Red)
  const [newStatus, setNewStatus] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  // Edición de red y accesos (Jefe de Mantenimiento / Técnico de Red = credential.manage)
  const [ipEdit, setIpEdit] = useState('');
  const [savingIp, setSavingIp] = useState(false);
  const [cred, setCred] = useState<any>({ username: '', type: '', secret: '' });

  // Edición rápida (tiempo real) de IP + contraseña desde la tabla
  const [quick, setQuick] = useState<any>(null);
  const [qIp, setQIp] = useState('');
  const [qPass, setQPass] = useState('');
  const [qSaving, setQSaving] = useState(false);

  async function loadAssets() {
    const r = await api.get('/assets').then((x) => x.data).catch(() => []);
    setRows(r || []);
  }
  useEffect(() => {
    Promise.all([
      api.get('/assets').then((r) => r.data).catch(() => []),
      api.get('/locations').then((r) => r.data).catch(() => []),
      api.get('/cabinets').then((r) => r.data).catch(() => []),
    ]).then(([a, l, c]) => { setRows(a || []); setLocations(l || []); setCabinets(c || []); setLoading(false); });
  }, []);

  function openNew() {
    setFormErr('');
    setTries(5);
    setForm({ assetCode: '', type: 'CAMERA', brand: '', model: '', serialNumber: '', ipAddress: '', devicePass: '', status: 'OPERATIVO', criticality: 'MEDIA', locationId: '', cabinetId: '', referencePlace: '', sapId: '', responsibleArea: '', email: user?.email || '', password: '' });
  }
  function openEdit(a: any) {
    setFormErr(''); setTries(5); setDetail(null);
    setForm({
      id: a.id, assetCode: a.assetCode || '', type: a.type || 'CAMERA', brand: a.brand || '', model: a.model || '',
      serialNumber: a.serialNumber || '', ipAddress: a.ipAddress || '', status: a.status || 'OPERATIVO',
      criticality: a.criticality || 'MEDIA', locationId: a.locationId || '', cabinetId: a.cabinetId || '', referencePlace: a.referencePlace || '', sapId: a.sapId || '',
      responsibleArea: a.responsibleArea || '', devicePass: '', email: user?.email || '', password: '',
    });
  }
  async function submitNew(e: any) {
    e.preventDefault();
    setFormErr('');
    setSaving(true);
    try {
      const body: any = {
        assetCode: form.assetCode, type: form.type, status: form.status, criticality: form.criticality,
        brand: form.brand || undefined, model: form.model || undefined, serialNumber: form.serialNumber || undefined,
        ipAddress: form.ipAddress || undefined, referencePlace: form.referencePlace || undefined,
        locationId: form.locationId || undefined, cabinetId: form.cabinetId || undefined, sapId: form.sapId || undefined, responsibleArea: form.responsibleArea || undefined,
        email: form.email, password: form.password,
      };
      let assetId = form.id;
      if (form.id) { await api.patch('/assets/' + form.id + '/edit', body); }
      else { const res = await api.post('/assets', body); assetId = res.data?.id; }
      if (form.devicePass && assetId) {
        await api.post('/credentials', { assetId, username: 'admin', secret: form.devicePass, type: 'equipo' }).catch(() => {});
      }
      setForm(null);
      await loadAssets();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      const msg = Array.isArray(m) ? m.join(', ') : m || 'No se pudo registrar el activo.';
      // Firma incorrecta: alerta con intentos restantes, sin cerrar sesión.
      if (/firma inv|contrase/i.test(msg)) {
        const left = tries - 1;
        setTries(left);
        setFormErr(left > 0 ? `Contraseña incorrecta. Te quedan ${left} intento(s).` : 'Contraseña incorrecta. Sin intentos restantes; vuelve a intentarlo más tarde.');
      } else setFormErr(msg);
    } finally { setSaving(false); }
  }

  async function openDetail(id: string) {
    setRevealed({});
    setCreds([]);
    const d = await api.get('/assets/' + id).then((r) => r.data).catch(() => null);
    setDetail(d);
    setNewStatus(d?.status || '');
    setIpEdit(d?.ipAddress || '');
    setCred({ username: '', type: '', secret: '' });
    if (d && can('credential.read')) {
      const c = await api.get('/credentials?assetId=' + id).then((r) => r.data).catch(() => []);
      setCreds(c || []);
    }
  }

  async function reveal(credId: string) {
    const r = await api.get('/credentials/' + credId + '/reveal').then((res) => res.data).catch(() => null);
    if (r) setRevealed((prev: any) => ({ ...prev, [credId]: r.secret }));
  }

  async function saveStatus() {
    if (!detail || !newStatus || newStatus === detail.status) return;
    setSavingStatus(true);
    try {
      await api.patch('/assets/' + detail.id, { status: newStatus });
      setDetail({ ...detail, status: newStatus });
      await loadAssets();
    } catch { window.alert('No se pudo actualizar el estado.'); }
    finally { setSavingStatus(false); }
  }

  async function saveIp() {
    setSavingIp(true);
    try {
      await api.patch('/assets/' + detail.id + '/network', { ipAddress: ipEdit || undefined });
      setDetail({ ...detail, ipAddress: ipEdit });
      await loadAssets();
    } catch { window.alert('No se pudo actualizar la IP.'); }
    finally { setSavingIp(false); }
  }

  // Guarda IP + contraseña del equipo juntas (la contraseña va cifrada como credencial).
  function openQuickEdit(a: any) {
    setQuick(a); setQIp(a.ip || ''); setQPass(a.password || '');
  }
  async function saveQuick() {
    setQSaving(true);
    try {
      if (qIp !== (quick.ip || '')) {
        await api.patch('/assets/' + quick.id + '/network', { ipAddress: qIp || undefined });
      }
      if (qPass && qPass !== (quick.password || '')) {
        await api.post('/credentials', { assetId: quick.id, username: 'admin', secret: qPass, type: 'equipo' });
      }
      setQuick(null);
      await loadAssets();
    } catch { window.alert('No se pudo actualizar la IP / contraseña.'); }
    finally { setQSaving(false); }
  }

  async function saveAccess() {
    setSavingIp(true);
    try {
      if (ipEdit !== (detail.ipAddress || '')) {
        await api.patch('/assets/' + detail.id + '/network', { ipAddress: ipEdit || undefined });
        setDetail({ ...detail, ipAddress: ipEdit });
      }
      if (cred.secret) {
        await api.post('/credentials', { assetId: detail.id, username: cred.username || 'admin', secret: cred.secret, type: 'equipo' });
        setCred({ username: '', type: '', secret: '' });
        const c = await api.get('/credentials?assetId=' + detail.id).then((r) => r.data).catch(() => []);
        setCreds(c || []);
      }
      await loadAssets();
    } catch { window.alert('No se pudo guardar el acceso.'); }
    finally { setSavingIp(false); }
  }
  async function addCredential() {
    if (!cred.secret) { window.alert('La contraseña del equipo es obligatoria.'); return; }
    try {
      await api.post('/credentials', { assetId: detail.id, username: cred.username || 'admin', secret: cred.secret, type: cred.type || undefined });
      setCred({ username: '', type: '', secret: '' });
      const c = await api.get('/credentials?assetId=' + detail.id).then((r) => r.data).catch(() => []);
      setCreds(c || []);
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar la credencial.');
    }
  }
  async function delCredential(id: string) {
    if (!window.confirm('¿Eliminar esta credencial?')) return;
    await api.delete('/credentials/' + id).catch(() => {});
    const c = await api.get('/credentials?assetId=' + detail.id).then((r) => r.data).catch(() => []);
    setCreds(c || []);
  }

  if (loading) return <div className="loading">Cargando activos…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Activos Tecnológicos</h1>
          <p className="page-sub">{rows.length} activos · haz clic en un activo para ver el detalle</p>
        </div>
        {can('asset.create') && <button className="btn-primary" onClick={openNew}>+ Nuevo activo</button>}
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>Código</th><th>Tipo</th><th>Marca / Modelo</th>{can('credential.read') && <th>IP</th>}{can('credential.read') && <th>Contraseña</th>}<th>Estado</th><th>Criticidad</th><th>Ubicación</th>{can('credential.read') && <th></th>}</tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(a.id)}>
                <td style={{ fontWeight: 600 }}>{a.assetCode}</td>
                <td>{tEs(a.type)}</td>
                <td>{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</td>
                {can('credential.read') && <td className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.ip || '—'}</td>}
                {can('credential.read') && <td className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.password || '—'}</td>}
                <td><span className={'badge ' + (a.effectiveStatus || a.status)}>{sEs(a.effectiveStatus || a.status)}</span></td>
                <td><span className={'badge ' + a.criticality}>{cEs(a.criticality)}</span></td>
                <td className="muted">{a.location?.name || '—'}</td>
                {can('credential.read') && <td><button className="btn-mini" onClick={(e) => { e.stopPropagation(); openQuickEdit(a); }}>Editar</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <Modal title={detail.assetCode} onClose={() => setDetail(null)}>
          {can('credential.read') && (
            <div style={{ marginBottom: 10, textAlign: 'right' }}>
              <button className="btn-mini" onClick={() => openEdit(detail)}>✏️ Editar activo (firmado)</button>
            </div>
          )}
          <Frow k="Tipo" v={tEs(detail.type)} />
          <Frow k="Marca / Modelo" v={[detail.brand, detail.model].filter(Boolean).join(' ')} />
          <Frow k="N° de serie" v={detail.serialNumber} />
          <div className="frow">
            <span className="k">Estado operativo</span>
            <span className="v"><span className={'badge ' + (detail.effectiveStatus || detail.status)}>{sEs(detail.effectiveStatus || detail.status)}</span></span>
          </div>
          {detail.effectiveStatus && detail.effectiveStatus !== detail.status && (
            <div className="muted" style={{ fontSize: 11, marginTop: -2, marginBottom: 4 }}>
              Estado calculado en vivo desde sus OM/incidencias abiertas. Estado base registrado: {sEs(detail.status)}.
            </div>
          )}
          <Frow k="Criticidad" v={cEs(detail.criticality)} />
          <Frow k="Firmware" v={detail.firmware} />
          <Frow k="Ubicación" v={detail.location?.name} />
          <Frow k="Gabinete" v={detail.cabinet ? `${detail.cabinet.code} — ${detail.cabinet.name}` : null} />
          <Frow k="Lugar de referencia" v={detail.referencePlace} />
          <Frow k="Garantía" v={detail.warrantyEnd ? new Date(detail.warrantyEnd).toLocaleDateString() : null} />

          {can('asset.update') && (
            <div className="detail-sec">
              <h4>🔄 Actualizar estado</h4>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} style={{ flex: 1 }}>
                  {STATES.map((t) => <option key={t} value={t}>{sEs(t)}</option>)}
                </select>
                <button className="btn-mini" disabled={savingStatus || newStatus === detail.status} onClick={saveStatus}>
                  {savingStatus ? 'Guardando…' : 'Guardar estado'}
                </button>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Estado base del activo. Si el activo tiene una OM o incidencia abierta, el sistema muestra automáticamente “En mantenimiento” / “Fuera de servicio” aunque aquí figure “Operativo”.</div>
            </div>
          )}

          {detail.workOrders && detail.workOrders.length > 0 && (
            <div className="detail-sec">
              <h4>🔧 Historial de mantenimiento</h4>
              {detail.workOrders.map((w: any) => (
                <div key={w.code} className="frow">
                  <span className="v">{w.code} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>({w.type})</span></span>
                  <span className={'badge ' + (w.status === 'CERRADA' ? 'OPERATIVO' : w.status === 'CANCELADA' ? 'BAJA' : 'MANTENIMIENTO')}>{w.status}</span>
                </div>
              ))}
            </div>
          )}

          {can('credential.read') ? (
            <div className="detail-sec">
              <h4>🔒 Red y accesos</h4>
              {can('credential.manage') ? (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <div className="muted" style={{ fontSize: 11 }}>IP principal</div>
                      <input value={ipEdit} onChange={(e) => setIpEdit(e.target.value)} placeholder="172.16.x.x" style={{ width: '100%' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <div className="muted" style={{ fontSize: 11 }}>Contraseña del equipo</div>
                      <input type="password" value={cred.secret} onChange={(e) => setCred({ ...cred, secret: e.target.value })} placeholder="clave cámara / NVR" style={{ width: '100%' }} />
                    </div>
                    <button className="btn-mini" disabled={savingIp} onClick={saveAccess}>{savingIp ? '…' : 'Guardar'}</button>
                  </div>
                  <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>IP y contraseña del equipo van juntas. Usuario opcional (por defecto “admin”). Se cifra (AES-256); revelar queda auditado.</div>
                </div>
              ) : <Frow k="IP principal" v={detail.ipAddress} />}
              {detail.camera && (<>
                <Frow k="IP" v={detail.camera.ipAddress} />
                <Frow k="MAC" v={detail.camera.macAddress} />
                <Frow k="NVR asociado" v={detail.camera.nvrId} />
              </>)}
              {detail.nvr && (<>
                <Frow k="Canales" v={detail.nvr.channels} />
                <Frow k="NIC primaria (industrial)" v={detail.nvr.nicPrimary} />
                <Frow k="NIC secundaria (visualización)" v={detail.nvr.nicSecondary} />
              </>)}
              {detail.switchDev && (<>
                <Frow k="IP de gestión" v={detail.switchDev.mgmtIp} />
                <Frow k="Fabricante" v={detail.switchDev.vendor} />
                <Frow k="Rol" v={detail.switchDev.switchRole} />
              </>)}
              {detail.wireless && (<>
                <Frow k="Modo" v={detail.wireless.mode} />
                <Frow k="Frecuencia" v={detail.wireless.frequency} />
                <Frow k="Origen → Destino" v={[detail.wireless.originPoint, detail.wireless.destPoint].filter(Boolean).join(' → ')} />
              </>)}

              <h4 style={{ marginTop: 14 }}>Credenciales</h4>
              {creds.length ? creds.map((c) => (
                <div key={c.id} className="frow">
                  <span className="v">{c.username} <span className="muted" style={{ fontWeight: 400 }}>({c.type || '—'})</span></span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {revealed[c.id]
                      ? <b style={{ fontSize: 13 }}>{revealed[c.id]}</b>
                      : (can('credential.read')
                          ? <button className="btn-mini" onClick={() => reveal(c.id)}>Revelar</button>
                          : <span className="muted" style={{ fontSize: 11 }}>oculto</span>)}
                    {can('credential.manage') && <button className="btn-mini" onClick={() => delCredential(c.id)}>✕</button>}
                  </span>
                </div>
              )) : <div className="muted" style={{ fontSize: 12 }}>Sin credenciales registradas</div>}

            </div>
          ) : (
            <div className="sign-note" style={{ marginTop: 14 }}>
              🔒 Datos de red y accesos ocultos — requiere permiso de red (Jefe de Mantenimiento, Supervisor TI o Técnico de Red).
            </div>
          )}
        </Modal>
      )}

      {form && (
        <Modal title={form.id ? 'Editar activo (firmado)' : 'Registrar activo (firmado)'} onClose={() => setForm(null)}>
          <form onSubmit={submitNew}>
            <div className="sign-note">El activo contiene información sensible (IP, red, accesos). Confirma tu identidad con correo y contraseña; quedará auditado con tu firma quién {form.id ? 'editó' : 'registró'} el activo.</div>
            <label>Código / rótulo del activo</label>
            <input value={form.assetCode} onChange={(e) => setForm({ ...form, assetCode: e.target.value })} required />
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>Tipo</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{tEs(t)}</option>)}</select></div>
              <div style={{ flex: 1 }}><label>Criticidad</label><select value={form.criticality} onChange={(e) => setForm({ ...form, criticality: e.target.value })}>{CRITS.map((t) => <option key={t} value={t}>{cEs(t)}</option>)}</select></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>Marca</label><input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label>Modelo</label><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>N° de serie</label><input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label>Estado</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATES.map((t) => <option key={t} value={t}>{sEs(t)}</option>)}</select></div>
            </div>
            <label>IP principal (sensible)</label>
            <input value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} placeholder="Ej: 172.16.10.21" />
            <label>Contraseña del equipo (opcional)</label>
            <input value={form.devicePass} onChange={(e) => setForm({ ...form, devicePass: e.target.value })} placeholder="clave de la cámara / NVR" />
            <label>Ubicación</label>
            <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
              <option value="">— sin ubicación —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <label>Gabinete{CABINET_REQUIRED.includes(form.type) ? ' (obligatorio para este tipo)' : ''}</label>
            <select value={form.cabinetId} onChange={(e) => setForm({ ...form, cabinetId: e.target.value })} required={CABINET_REQUIRED.includes(form.type)}>
              <option value="">— sin gabinete —</option>
              {cabinets.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
            {CABINET_REQUIRED.includes(form.type) && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Este tipo va montado en rack: indica el gabinete para ubicarlo rápido en planta.</div>}
            <label>Lugar de referencia (texto libre)</label>
            <input value={form.referencePlace} onChange={(e) => setForm({ ...form, referencePlace: e.target.value })} placeholder="Ej: Púlpito Tren 1, poste 3 lado norte" />
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>Código SAP (activo)</label><input value={form.sapId} onChange={(e) => setForm({ ...form, sapId: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label>Área responsable</label><input value={form.responsibleArea} onChange={(e) => setForm({ ...form, responsibleArea: e.target.value })} /></div>
            </div>
            <h4 style={{ marginTop: 14, marginBottom: 4 }}>🔏 Firma electrónica</h4>
            <label>Correo</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <label>Contraseña</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            {formErr && <div className="error">{formErr}</div>}
            <button className="btn" disabled={saving || tries <= 0}>{saving ? 'Guardando…' : (form.id ? 'Firmar y guardar cambios' : 'Firmar y registrar')}</button>
          </form>
        </Modal>
      )}

      {quick && (
        <Modal title={'Editar IP y contraseña · ' + quick.assetCode} onClose={() => setQuick(null)}>
          <div className="sign-note">Edición en tiempo real de los accesos del equipo. Solo Jefe de Mantenimiento, Supervisor TI y Técnico de Red.</div>
          <label>IP principal</label>
          <input value={qIp} onChange={(e) => setQIp(e.target.value)} placeholder="172.16.x.x" />
          <label>Contraseña del equipo</label>
          <input value={qPass} onChange={(e) => setQPass(e.target.value)} placeholder="clave cámara / NVR" />
          <button className="btn" disabled={qSaving} onClick={saveQuick}>{qSaving ? 'Guardando…' : 'Guardar'}</button>
        </Modal>
      )}
    </div>
  );
}
