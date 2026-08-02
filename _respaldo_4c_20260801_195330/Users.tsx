import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';

export default function Users() {
  const [rows, setRows] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>({ email: '', fullName: '', password: '', roleId: '' });
  const { can } = useAuth();

  async function load() {
    setLoading(true);
    const [us, rl] = await Promise.all([
      api.get('/users').then((r) => r.data).catch(() => []),
      api.get('/users/roles').then((r) => r.data).catch(() => []),
    ]);
    setRows(us || []);
    setRoles(rl || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/users', form);
      setShowForm(false);
      setForm({ email: '', fullName: '', password: '', roleId: '' });
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'No se pudo crear el usuario.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading">Cargando usuarios…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-sub">{rows.length} usuarios</p>
        </div>
        {can('user.manage') && <button className="btn-primary" onClick={() => { setForm({ email: '', fullName: '', password: '', roleId: roles[0]?.id || '' }); setShowForm(true); }}>+ Nuevo usuario</button>}
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                <td className="muted">{u.email}</td>
                <td>{u.role?.name}</td>
                <td><span className={'badge ' + (u.active ? 'OPERATIVO' : 'FUERA_SERVICIO')}>{u.active ? 'Activo' : 'Inactivo'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Nuevo usuario" onClose={() => setShowForm(false)}>
          <form onSubmit={create}>
            <label>Nombre completo</label>
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            <label>Correo</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <label>Contraseña</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
            <label>Rol</label>
            <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} required>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {error && <div className="error">{error}</div>}
            <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Crear usuario'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
