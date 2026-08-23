import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';
import { EsqueletoTabla } from '../components/Esqueleto';

export default function Users() {
  const [rows, setRows] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>({ email: '', fullName: '', password: '', roleId: '' });
  // Ámbito: a qué trenes mira ese usuario.
  const [ambitoDe, setAmbitoDe] = useState<any>(null);
  const [trenes, setTrenes] = useState<string[]>([]);
  /* LOS TRENES SE LEEN DEL ÁRBOL, NO ESTÁN ESCRITOS AQUÍ.
     -------------------------------------------------------------------------
     Antes este diálogo tenía ['T1','T2','T3'] a mano. El árbol de planta usa
     el código completo —AASA-PISCO-T1— así que el servidor rechazaba el
     guardado con «estos trenes no existen en el árbol». El diálogo enseñaba
     «Ahora mismo: sólo T1» y debajo, en rojo, que T1 no existe: las dos frases
     eran suyas y se contradecían.

     Es el mismo fallo que este proyecto persigue en todas partes: dos sitios
     que dicen lo mismo y nada les obliga a coincidir. Y encima era invisible,
     porque con la lista escrita a mano las casillas SIEMPRE salen bien; lo que
     falla es el guardado, al final. */
  const [trenesDeLaPlanta, setTrenesDeLaPlanta] = useState<any[] | null>(null);
  const { can } = useAuth();

  function abrirAmbito(u: any) {
    setAmbitoDe(u);
    setTrenes(u.ambitoTrenes || []);
    setError('');
    /* Se piden al abrir y no al cargar la pantalla: la mayoría de las veces
       nadie toca el ámbito, y así no se gasta una consulta en cada entrada. */
    if (trenesDeLaPlanta === null) {
      api.get('/dashboard/infra/trenes')
        .then((r) => setTrenesDeLaPlanta(r.data?.trenes || []))
        .catch(() => setTrenesDeLaPlanta([]));
    }
  }

  async function guardarAmbito() {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/roles-admin/usuario/${ambitoDe.id}/ambito`, { trenes });
      setAmbitoDe(null);
      await load();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar el ámbito.');
    } finally {
      setSaving(false);
    }
  }

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

  if (loading) return <EsqueletoTabla filas={6} />;

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
                <td>
                  {/* Ámbito vacío = todos los trenes. Se dice con palabras y
                      no con un guion: un guion se lee como "sin datos". */}
                  {(u.ambitoTrenes?.length ?? 0) === 0
                    ? <span className="muted">Todos</span>
                    : u.ambitoTrenes.join(' · ')}
                  {can('user.manage') && (
                    <button className="btn-mini" style={{ marginLeft: 8 }}
                      onClick={() => abrirAmbito(u)}>Cambiar</button>
                  )}
                </td>
                <td><span className={'badge ' + (u.active ? 'OPERATIVO' : 'FUERA_SERVICIO')}>{u.active ? 'Activo' : 'Inactivo'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ambitoDe && (
        <Modal title={`Qué trenes ve ${ambitoDe.fullName}`} onClose={() => setAmbitoDe(null)}>
          {/* EL TEXTO DEPENDE DEL ROL. Con un rol sectorizado —Jefe de Tren—
              no marcar nada NO significa «ve toda la planta»: significa que no
              ve nada. Decir lo contrario haría que alguien guardara sin marcar
              creyendo que le está dando acceso completo. */}
          <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.55 }}>
            {ambitoDe.role?.exigeAmbito ? (
              <>
                Este rol está <b>sectorizado</b>: sin ningún tren marcado
                <b> no verá nada</b> y la aplicación se lo dirá. Marca el tren
                que le corresponde.
              </>
            ) : (
              <>
                Sin ningún tren marcado, ve <b>toda la planta</b>. Marca uno o
                varios para que sólo vea esos.
              </>
            )}
          </p>

          {trenesDeLaPlanta === null ? (
            <p className="muted" style={{ fontSize: 13 }}>Leyendo el árbol de planta…</p>
          ) : trenesDeLaPlanta.length === 0 ? (
            /* Sin árbol no se inventan casillas. Antes salían T1, T2 y T3
               aunque la planta no tuviera ninguno cargado. */
            <div className="card vacio">
              <h3>Todavía no hay trenes en el árbol de planta</h3>
              <p>Créalos en Ubicaciones y vuelve aquí a asignarlos.</p>
            </div>
          ) : trenesDeLaPlanta.map((t: any) => (
            <label key={t.code} className="permiso">
              <input
                type="checkbox"
                checked={trenes.includes(t.sigla || t.code)}
                onChange={() =>
                  /* Se guarda la SIGLA («T1»), no el código completo. Es lo
                     que va en el rótulo del equipo y lo que el resto del
                     sistema entiende por «qué tren es». */
                  setTrenes((prev) => {
                    const v = t.sigla || t.code;
                    return prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v];
                  })
                }
              />
              <span>
                <b>{t.nombre || t.code}</b>
                {t.sigla && <span className="muted" style={{ marginLeft: 6 }}>({t.sigla})</span>}
                <span className="permiso-explica">
                  Ve los activos, el tablero y las órdenes de este tren.
                </span>
              </span>
            </label>
          ))}

          <div className="sign-note" style={{ marginTop: 12 }}>
            {trenes.length === 0
              ? (ambitoDe.role?.exigeAmbito
                ? 'Ahora mismo: NO VE NADA. Marca su tren antes de guardar.'
                : 'Ahora mismo: ve TODA la planta.')
              : `Ahora mismo: ${trenes
                .map((c) => trenesDeLaPlanta?.find((t: any) => t.sigla === c || t.code === c)?.nombre || c)
                .join(', ')}. Lo que no esté ubicado ahí no lo verá.`}
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" onClick={guardarAmbito} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </Modal>
      )}

      {showForm && (
        <Modal title="Nuevo usuario" onClose={() => setShowForm(false)}>
          <form onSubmit={create}>
            <label>Nombre completo
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            </label>
            <label>Correo
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
            <label>Contraseña
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
            </label>
            <label>Rol
              <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} required>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            </label>
            {error && <div className="error">{error}</div>}
            <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Crear usuario'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
