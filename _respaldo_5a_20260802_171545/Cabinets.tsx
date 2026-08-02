import { useEffect, useState, useCallback, FormEvent } from 'react';
import { api } from '../api/client';
import FiltroAmbito, { Ambito, AMBITO_VACIO, AvisoAmbito } from '../components/FiltroAmbito';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';

export default function Cabinets() {
  const { can } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [photoFor, setPhotoFor] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_VACIO);
  const [uploading, setUploading] = useState(false);

  // useCallback porque depende del ámbito: así puede entrar como dependencia
  // del efecto sin recrearse en cada render.
  const load = useCallback(async () => {
    const params: any = {};
    if (ambito.tren) params.tren = ambito.tren;
    if (ambito.etapa) params.etapa = ambito.etapa;
    const c = await api.get('/cabinets', { params }).then((r) => r.data).catch(() => []);
    setRows(c || []);
  }, [ambito]);
  // Las ubicaciones son catálogo: se piden una sola vez.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.get('/locations').then((r) => setLocations(r.data || [])).catch(() => setLocations([]));
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  function openNew() { setForm({ code: '', name: '', locationId: '', referencePlace: '', notes: '' }); }
  function openEdit(g: any) {
    setForm({ id: g.id, code: g.code, name: g.name, locationId: g.locationId || '', referencePlace: g.referencePlace || '', notes: g.notes || '' });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: any = { code: form.code, name: form.name };
      body.locationId = form.locationId || undefined;
      body.referencePlace = form.referencePlace || undefined;
      body.notes = form.notes || undefined;
      if (form.id) await api.patch('/cabinets/' + form.id, body);
      else await api.post('/cabinets', body);
      setForm(null);
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar el gabinete.');
    } finally { setSaving(false); }
  }
  async function uploadPhoto(e: FormEvent) {
    e.preventDefault();
    if (!file) { window.alert('Selecciona una imagen.'); return; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      await api.post('/cabinets/' + photoFor.id + '/photo', fd);
      setPhotoFor(null); setFile(null);
      await load();
    } catch { window.alert('No se pudo subir la foto.'); }
    finally { setUploading(false); }
  }
  async function viewPhoto(g: any) {
    try {
      const res = await api.get('/cabinets/' + g.id + '/photo', { responseType: 'blob' });
      // res.data ya es un Blob con su Content-Type; usarlo directo preserva el tipo imagen.
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch { window.alert('El gabinete no tiene foto.'); }
  }

  if (loading) return <div className="loading">Cargando gabinetes…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Gabinetes</h1>
          <p className="page-sub">{rows.length} gabinetes · rótulo, ubicación, foto y equipos montados</p>
        </div>
        {can('asset.update') && <button className="btn-primary" onClick={openNew}>+ Nuevo gabinete</button>}
      </div>

      <AvisoAmbito valor={ambito} total={rows.length} />

      <div className="filters">
        <FiltroAmbito valor={ambito} onChange={setAmbito} />
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Rótulo</th><th>Nombre</th><th>Ubicación</th><th>Referencia</th><th>Equipos</th><th>Foto</th>{can('asset.update') && <th></th>}</tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id}>
                <td style={{ fontWeight: 600 }}>{g.code}</td>
                <td>{g.name}</td>
                <td className="muted">{g.location?.name || '—'}</td>
                <td className="muted" style={{ fontSize: 12 }}>{g.referencePlace || '—'}</td>
                <td>{g.assetCount ?? 0}</td>
                <td>{g.hasPhoto ? <button className="btn-mini" onClick={() => viewPhoto(g)}>Ver</button> : <span className="muted" style={{ fontSize: 12 }}>—</span>}</td>
                {can('asset.update') && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-mini" onClick={() => openEdit(g)}>Editar</button>
                    <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => { setPhotoFor(g); setFile(null); }}>Foto</button>
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>Sin gabinetes. Crea uno con “+ Nuevo gabinete”.</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.id ? 'Editar gabinete' : 'Nuevo gabinete'} onClose={() => setForm(null)}>
          <form onSubmit={submit}>
            <label>Rótulo (código del gabinete)</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ej: GAB-T1-R01" required />
            <label>Nombre</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Gabinete R-01 (Tren 1)" required />
            <label>Ubicación</label>
            <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
              <option value="">— sin ubicación —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <label>Lugar de referencia</label>
            <input value={form.referencePlace} onChange={(e) => setForm({ ...form, referencePlace: e.target.value })} placeholder="Ej: Sala de equipos — Tren 1" />
            <label>Notas</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar gabinete'}</button>
          </form>
        </Modal>
      )}

      {photoFor && (
        <Modal title={'Foto del gabinete · ' + photoFor.code} onClose={() => setPhotoFor(null)}>
          <form onSubmit={uploadPhoto}>
            <div className="sign-note">Sube una foto del gabinete para ubicarlo e identificarlo en planta.</div>
            <label>Imagen (JPG / PNG)</label>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button className="btn" disabled={uploading}>{uploading ? 'Subiendo…' : 'Subir foto'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
