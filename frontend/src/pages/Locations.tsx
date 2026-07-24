import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';

const TYPES = ['EMPRESA', 'PLANTA', 'TREN', 'AREA', 'SALA', 'ZONA', 'RACK'];
const TYPE_ES: Record<string, string> = {
  EMPRESA: 'Empresa', PLANTA: 'Planta', TREN: 'Tren', AREA: 'Área', SALA: 'Sala', ZONA: 'Zona', RACK: 'Gabinete/Rack',
};

export default function Locations() {
  const { can } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const l = await api.get('/locations').then((r) => r.data).catch(() => []);
    setRows(l || []);
  }
  useEffect(() => { load().then(() => setLoading(false)); }, []);

  function openNew() { setForm({ code: '', name: '', type: 'AREA', parentId: '', responsibleArea: '' }); }
  function openEdit(l: any) { setForm({ id: l.id, code: l.code, name: l.name, type: l.type, parentId: l.parentId || '', responsibleArea: l.responsibleArea || '' }); }
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

  if (loading) return <div className="loading">Cargando ubicaciones…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Ubicaciones</h1>
          <p className="page-sub">{rows.length} ubicaciones · regístralas poco a poco; luego se eligen (obligatorio) al crear un activo</p>
        </div>
        {can('asset.update') && <button className="btn-primary" onClick={openNew}>+ Nueva ubicación</button>}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Pertenece a</th><th>Activos</th>{can('asset.update') && <th></th>}</tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td style={{ fontWeight: 600 }}>{l.code}</td>
                <td>{l.name}</td>
                <td className="muted">{TYPE_ES[l.type] || l.type}</td>
                <td className="muted">{l.parent?.name || '—'}</td>
                <td>{l._count?.assets ?? 0}</td>
                {can('asset.update') && <td><button className="btn-mini" onClick={() => openEdit(l)}>Editar</button></td>}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>Sin ubicaciones. Crea una con “+ Nueva ubicación”.</td></tr>}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}
