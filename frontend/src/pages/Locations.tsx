import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import CatalogosEditables from '../components/CatalogosEditables';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';

const TYPES = ['EMPRESA', 'PLANTA', 'TREN', 'AREA', 'SALA', 'ZONA', 'RACK'];
const TYPE_ES: Record<string, string> = {
  EMPRESA: 'Empresa', PLANTA: 'Planta', TREN: 'Tren', AREA: 'Área',
  SALA: 'Sala', ZONA: 'Zona', RACK: 'Gabinete/Rack', ETAPA: 'Etapa del proceso',
};
const CRIT_ES: Record<string, string> = {
  BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Crítica',
};

export default function Locations() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'ubic' | 'etapas' | 'catalogos'>('ubic');

  // ---- Ubicaciones ----
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [photoFor, setPhotoFor] = useState<any>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // ---- Etapas del proceso ----
  const [stages, setStages] = useState<any[]>([]);
  const [ambientes, setAmbientes] = useState<any[]>([]);
  const [trenes, setTrenes] = useState<any[]>([]);
  const [stageForm, setStageForm] = useState<any>(null);
  const [assignFor, setAssignFor] = useState<any>(null);
  const [assignTren, setAssignTren] = useState('');

  async function load() {
    const l = await api.get('/locations').then((r) => r.data).catch(() => []);
    setRows(l || []);
  }
  async function loadStages() {
    const [s, a, t] = await Promise.all([
      api.get('/locations/stages').then((r) => r.data).catch(() => []),
      api.get('/locations/stages/ambientes').then((r) => r.data).catch(() => []),
      api.get('/locations/stages/trenes').then((r) => r.data).catch(() => []),
    ]);
    setStages(s || []); setAmbientes(a || []); setTrenes(t || []);
  }
  useEffect(() => { Promise.all([load(), loadStages()]).then(() => setLoading(false)); }, []);

  // ------------------------------------------------------------------ ubicaciones
  function openNew() { setForm({ code: '', name: '', type: 'AREA', parentId: '', responsibleArea: '' }); }
  function openEdit(l: any) {
    setForm({ id: l.id, code: l.code, name: l.name, type: l.type, parentId: l.parentId || '', responsibleArea: l.responsibleArea || '' });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.id) {
        await api.patch('/locations/' + form.id, { name: form.name, parentId: form.parentId || undefined, responsibleArea: form.responsibleArea || undefined });
      } else {
        await api.post('/locations', { code: form.code, name: form.name, type: form.type, parentId: form.parentId || undefined, responsibleArea: form.responsibleArea || undefined });
      }
      setForm(null);
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar la ubicación.');
    } finally { setSaving(false); }
  }

  async function uploadPhoto(e: FormEvent) {
    e.preventDefault();
    if (!photoFile) { window.alert('Selecciona una imagen.'); return; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', photoFile);
      await api.post('/locations/' + photoFor.id + '/photo', fd);
      setPhotoFor(null); setPhotoFile(null);
      await load();
    } catch { window.alert('No se pudo subir la foto.'); }
    finally { setUploading(false); }
  }
  async function viewPhoto(l: any) {
    try {
      const res = await api.get('/locations/' + l.id + '/photo', { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch { window.alert('La ubicación no tiene foto.'); }
  }

  // ---------------------------------------------------------------------- etapas
  function openNewStage() {
    setStageForm({
      code: '', name: '', sequence: '', environment: ambientes[0]?.code || 'CLIMATIZADO',
      baseCriticality: 'MEDIA', defaultIntervalDays: '', watches: '',
    });
  }
  function openEditStage(s: any) {
    setStageForm({
      id: s.id, code: s.code, name: s.name, sequence: s.sequence,
      environment: s.environment, baseCriticality: s.baseCriticality,
      defaultIntervalDays: s.defaultIntervalDays, watches: s.watches || '',
    });
  }
  async function submitStage(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const cuerpo = {
        name: stageForm.name,
        sequence: stageForm.sequence === '' ? undefined : Number(stageForm.sequence),
        environment: stageForm.environment,
        baseCriticality: stageForm.baseCriticality,
        defaultIntervalDays: stageForm.defaultIntervalDays === '' ? undefined : Number(stageForm.defaultIntervalDays),
        watches: stageForm.watches,
      };
      if (stageForm.id) await api.patch('/locations/stages/' + stageForm.id, cuerpo);
      else await api.post('/locations/stages', { ...cuerpo, code: stageForm.code });
      setStageForm(null);
      await loadStages();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar la etapa.');
    } finally { setSaving(false); }
  }
  async function asignarATren(e: FormEvent) {
    e.preventDefault();
    if (!assignTren) { window.alert('Elige un tren.'); return; }
    setSaving(true);
    try {
      await api.post(`/locations/stages/${assignFor.id}/trenes/${assignTren}`);
      setAssignFor(null); setAssignTren('');
      await Promise.all([load(), loadStages()]);
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo asignar la etapa.');
    } finally { setSaving(false); }
  }
  async function desactivar(s: any) {
    if (!window.confirm(`¿Desactivar la etapa "${s.name}"?\n\nNo se borra: el historial de mantenimiento se conserva.`)) return;
    try { await api.delete('/locations/stages/' + s.id); await loadStages(); }
    catch { window.alert('No se pudo desactivar la etapa.'); }
  }

  const ambienteDe = (code: string) => ambientes.find((a) => a.code === code);

  if (loading) return <div className="loading">Cargando ubicaciones…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Ubicaciones</h1>
          <p className="page-sub">
            {tab === 'ubic'
              ? `${rows.length} ubicaciones · se eligen (obligatorio) al crear un activo`
              : `${stages.length} etapas del proceso · defínelas con los nombres reales de tu tren`}
          </p>
        </div>
        {can('asset.update') && tab === 'ubic' && <button className="btn-primary" onClick={openNew}>+ Nueva ubicación</button>}
        {can('location.manage') && tab === 'etapas' && <button className="btn-primary" onClick={openNewStage}>+ Nueva etapa</button>}
      </div>

      <div className="tabs" style={{ margin: '14px 0' }}>
        <button className={tab === 'ubic' ? 'tab active' : 'tab'} onClick={() => setTab('ubic')}>Ubicaciones</button>
        <button className={tab === 'etapas' ? 'tab active' : 'tab'} onClick={() => setTab('etapas')}>Etapas del proceso</button>
        {/* Los catálogos viven aquí, junto a las etapas: son la misma clase de
            decisión —cómo se llaman las cosas en esta planta— y la toma la
            misma gente. */}
        <button className={tab === 'catalogos' ? 'tab active' : 'tab'} onClick={() => setTab('catalogos')}>Catálogos</button>
      </div>

      {/* --------------------------------------------------------- CATÁLOGOS */}
      {tab === 'catalogos' && <CatalogosEditables />}

      {/* ------------------------------------------------------- UBICACIONES */}
      {tab === 'ubic' && (
        <div className="card">
          <table>
            <thead>
              <tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Pertenece a</th><th>Activos</th><th>Foto</th>{can('asset.update') && <th></th>}</tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 600 }}>{l.code}</td>
                  <td>{l.name}</td>
                  <td className="muted">{TYPE_ES[l.type] || l.type}</td>
                  <td className="muted">{l.parent?.name || '—'}</td>
                  <td>{l._count?.assets ?? 0}</td>
                  <td>{l.hasPhoto ? <button className="btn-mini" onClick={() => viewPhoto(l)}>Ver</button> : <span className="muted" style={{ fontSize: 12 }}>—</span>}</td>
                  {can('asset.update') && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-mini" onClick={() => openEdit(l)}>Editar</button>
                      <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => { setPhotoFor(l); setPhotoFile(null); }}>Foto</button>
                    </td>
                  )}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>Sin ubicaciones. Crea una con “+ Nueva ubicación”.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------------ ETAPAS */}
      {tab === 'etapas' && (
        <>
          <div className="sign-note" style={{ marginBottom: 12 }}>
            Las etapas describen el recorrido del material en tu tren. El sistema
            no trae ninguna precargada: los nombres reales los pones tú.
            Del <strong>ambiente</strong> que elijas se deriva cada cuántos días
            toca el mantenimiento preventivo, y de la <strong>criticidad mínima</strong>
            {' '}que un activo instalado ahí nunca quede clasificado por debajo.
          </div>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Orden</th><th>Código</th><th>Nombre</th>
                  <th>Ambiente</th><th>Criticidad mín.</th><th>Preventivo</th>
                  <th>En trenes</th>{can('location.manage') && <th></th>}
                </tr>
              </thead>
              <tbody>
                {stages.map((s) => {
                  const amb = ambienteDe(s.environment);
                  const editado = s.intervaloSugerido && s.defaultIntervalDays !== s.intervaloSugerido;
                  return (
                    <tr key={s.id} style={s.active === false ? { opacity: 0.45 } : undefined}>
                      <td style={{ fontWeight: 600 }}>{s.sequence}</td>
                      <td className="muted">{s.code}</td>
                      <td>
                        {s.name}
                        {s.active === false && <span className="muted" style={{ fontSize: 11 }}> · inactiva</span>}
                        {s.watches && <div className="muted" style={{ fontSize: 11 }}>{s.watches}</div>}
                      </td>
                      <td className="muted">{amb?.label || s.environment}</td>
                      <td>{CRIT_ES[s.baseCriticality] || s.baseCriticality}</td>
                      <td>
                        cada {s.defaultIntervalDays} días
                        {editado ? <div className="muted" style={{ fontSize: 11 }}>ajustado (sugerido: {s.intervaloSugerido})</div> : null}
                      </td>
                      <td>{s.enUso || 0}</td>
                      {can('location.manage') && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn-mini" onClick={() => openEditStage(s)}>Editar</button>
                          <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => { setAssignFor(s); setAssignTren(''); }}>Añadir a tren</button>
                          {s.active !== false && <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => desactivar(s)}>Desactivar</button>}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {!stages.length && (
                  <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                    Todavía no hay etapas. Crea la primera con “+ Nueva etapa”:
                    por ejemplo el horno, el desbaste o el púlpito de control.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ------------------------------------------------------------ modales */}
      {form && (
        <Modal title={form.id ? 'Editar ubicación' : 'Nueva ubicación'} onClose={() => setForm(null)}>
          <form onSubmit={submit}>
            {!form.id && (
              <>
                <label>Código</label>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ej: AASA-PISCO-T1-HORNO" required />
                <label>Tipo</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {TYPES.map((t) => <option key={t} value={t}>{TYPE_ES[t]}</option>)}
                </select>
              </>
            )}
            <label>Nombre</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Horno — Tren 1" required />
            <label>Pertenece a (ubicación padre)</label>
            <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">— ninguna (raíz) —</option>
              {rows.filter((r) => r.id !== form.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <label>Área responsable</label>
            <input value={form.responsibleArea} onChange={(e) => setForm({ ...form, responsibleArea: e.target.value })} />
            <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar ubicación'}</button>
          </form>
        </Modal>
      )}

      {stageForm && (
        <Modal title={stageForm.id ? 'Editar etapa' : 'Nueva etapa del proceso'} onClose={() => setStageForm(null)}>
          <form onSubmit={submitStage}>
            {!stageForm.id && (
              <>
                <label>Código corto</label>
                <input value={stageForm.code} onChange={(e) => setStageForm({ ...stageForm, code: e.target.value })} placeholder="Ej: DESBASTE" required />
                <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 8 }}>
                  Sin espacios ni tildes. Se usa para armar el código de la ubicación.
                </div>
              </>
            )}
            <label>Nombre de la etapa</label>
            <input value={stageForm.name} onChange={(e) => setStageForm({ ...stageForm, name: e.target.value })} placeholder="El nombre que usan en planta" required />

            <label>Orden dentro del proceso</label>
            <input type="number" min={1} value={stageForm.sequence} onChange={(e) => setStageForm({ ...stageForm, sequence: e.target.value })} placeholder="Vacío = al final" />

            <label>Ambiente</label>
            <select value={stageForm.environment} onChange={(e) => setStageForm({ ...stageForm, environment: e.target.value, defaultIntervalDays: '' })}>
              {ambientes.map((a) => <option key={a.code} value={a.code}>{a.label} — cada {a.dias} días</option>)}
            </select>
            {ambienteDe(stageForm.environment) && (
              <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 8 }}>
                {ambienteDe(stageForm.environment).detalle}
              </div>
            )}

            <label>Criticidad mínima de los activos aquí</label>
            <select value={stageForm.baseCriticality} onChange={(e) => setStageForm({ ...stageForm, baseCriticality: e.target.value })}>
              {Object.entries(CRIT_ES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>

            <label>Días entre mantenimientos preventivos</label>
            <input type="number" min={1} value={stageForm.defaultIntervalDays}
              onChange={(e) => setStageForm({ ...stageForm, defaultIntervalDays: e.target.value })}
              placeholder={`Vacío = ${ambienteDe(stageForm.environment)?.dias ?? 60} (según el ambiente)`} />

            <label>Qué vigila el CCTV aquí (opcional)</label>
            <input value={stageForm.watches} onChange={(e) => setStageForm({ ...stageForm, watches: e.target.value })} placeholder="Ej: atascos, lazos, carga de material" />

            <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar etapa'}</button>
          </form>
        </Modal>
      )}

      {assignFor && (
        <Modal title={'Añadir “' + assignFor.name + '” a un tren'} onClose={() => setAssignFor(null)}>
          <form onSubmit={asignarATren}>
            <div className="sign-note">
              Se creará la ubicación de esta etapa dentro del tren elegido.
              Repite para cada tren que tenga esta etapa: no todos los trenes
              tienen las mismas.
            </div>
            <label>Tren</label>
            <select value={assignTren} onChange={(e) => setAssignTren(e.target.value)}>
              <option value="">— elige un tren —</option>
              {trenes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button className="btn" disabled={saving}>{saving ? 'Añadiendo…' : 'Añadir al tren'}</button>
          </form>
        </Modal>
      )}

      {photoFor && (
        <Modal title={'Foto de referencia · ' + photoFor.name} onClose={() => setPhotoFor(null)}>
          <form onSubmit={uploadPhoto}>
            <div className="sign-note">Sube una foto de referencia de la ubicación para identificarla en planta.</div>
            <label>Imagen (JPG / PNG)</label>
            <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
            <button className="btn" disabled={uploading}>{uploading ? 'Subiendo…' : 'Subir foto'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
