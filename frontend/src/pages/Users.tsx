import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';
import { EsqueletoTabla } from '../components/Esqueleto';
import { mensajeDeError } from '../avisos';
import { fechaHora } from '../fechas';
import { useDialogos } from '../components/Dialogos';

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
  /* BLOQUE 96 · editar a una persona ya creada: su nombre, su rol y si sigue
     activa. Hasta aquí sólo se podía cambiar el ámbito de trenes: para mover
     a alguien de puesto había que crearle otro usuario, y entonces quedan dos
     personas con el mismo nombre y la firma de las órdenes deja de decir quién
     hizo qué. */
  const [editaUsuario, setEditaUsuario] = useState<any>(null);
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
  /* CUENTAS BLOQUEADAS — bloque 104. Hasta aquí un bloqueo por intentos
     fallidos eran 15 minutos en los que el técnico esperaba: no había ni forma
     de VERLO desde aquí, ni de levantarlo. Ahora se ve y se levanta. */
  const [bloqueadas, setBloqueadas] = useState<Record<string, string>>({});
  const [desbloqueando, setDesbloqueando] = useState('');
  const { can } = useAuth();
  const { pedirTexto } = useDialogos();

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

  async function desbloquear(u: any) {
    if (desbloqueando) return;                 // dos pulsaciones = dos peticiones
    const motivo = await pedirTexto({
      titulo: `Levantar el bloqueo de ${u.email}`,
      mensaje: 'Podrá volver a entrar en el acto. Escribe por qué: queda en la auditoría con tu nombre.',
      aceptar: 'Desbloquear',
      obligatorio: true,
      valorInicial: '',
    });
    if (motivo === null) return;               // canceló
    setDesbloqueando(u.id); setError('');
    try {
      await api.post(`/users/${u.id}/desbloquear`, { motivo });
      await load();
    } catch (e: any) {
      setError(mensajeDeError(e, 'desbloquear esta cuenta'));
    } finally { setDesbloqueando(''); }
  }

  async function guardarUsuario() {
    if (saving) return;                    // dos pulsaciones = dos peticiones
    setSaving(true); setError('');
    try {
      /* Se manda SÓLO lo que cambia. El endpoint ya sube `permisosVersion`
         cuando toca el rol o el estado (bloque 82), así que el cambio llega a
         quien ya está dentro sin tener que cerrarle la sesión. */
      await api.patch(`/users/${editaUsuario.id}`, {
        fullName: editaUsuario.fullName,
        roleId: editaUsuario.roleId,
        active: editaUsuario.active,
      });
      setEditaUsuario(null);
      await load();
    } catch (e: any) {
      setError(mensajeDeError(e, 'guardar los cambios de este usuario'));
    } finally { setSaving(false); }
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
    const [us, rl, bl] = await Promise.all([
      api.get('/users').then((r) => r.data).catch(() => []),
      api.get('/users/roles').then((r) => r.data).catch(() => []),
      /* Si esta falla no se rompe la pantalla: se deja de ver el bloqueo, que
         es peor que verlo pero mucho mejor que no poder abrir Usuarios. */
      api.get('/users/bloqueadas').then((r) => r.data).catch(() => []),
    ]);
    setRows(us || []);
    setRoles(rl || []);
    const mapa: Record<string, string> = {};
    for (const b of bl || []) mapa[String(b.email).toLowerCase()] = b.hasta;
    setBloqueadas(mapa);
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
          {/* TABLA DESCUADRADA — arreglado en el bloque 66.
              Había CUATRO encabezados y CINCO columnas de datos: faltaba
              «Trenes». El resultado es que «Estado» quedaba escrito encima de
              la columna del ámbito, y la columna de estado sin título. Se ve
              raro pero no rompe nada, así que había sobrevivido a todas las
              revisiones — hasta que se contaron `<th>` contra `<td>`. */}
          <thead>
            <tr>
              <th>Nombre</th><th>Correo</th><th>Rol</th><th>Trenes</th><th>Estado</th>
            </tr>
          </thead>
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
                <td>
                  <span className={'badge ' + (u.active ? 'OPERATIVO' : 'FUERA_SERVICIO')}>{u.active ? 'Activo' : 'Inactivo'}</span>
                  {/* EL BLOQUEO SE VE, Y SE LEVANTA. Sin esto, «se me bloqueó»
                      no se podía ni comprobar ni resolver desde aquí. */}
                  {bloqueadas[String(u.email).toLowerCase()] && (
                    <>
                      <span className="badge FUERA_SERVICIO" style={{ marginLeft: 6 }}
                        title={`Bloqueada por intentos fallidos hasta ${fechaHora(bloqueadas[String(u.email).toLowerCase()])}`}>
                        Bloqueada
                      </span>
                      {can('user.manage') && (
                        <button className="btn-mini" style={{ marginLeft: 6 }}
                          onClick={() => desbloquear(u)} disabled={desbloqueando === u.id}
                          title="Levanta el bloqueo ahora. Queda auditado con tu nombre y el motivo.">
                          {desbloqueando === u.id ? 'Desbloqueando…' : 'Desbloquear'}
                        </button>
                      )}
                    </>
                  )}
                  {can('user.manage') && (
                    <button className="btn-mini" style={{ marginLeft: 8 }}
                      onClick={() => setEditaUsuario({
                        id: u.id, fullName: u.fullName, email: u.email,
                        roleId: u.role?.id || '', rolActual: u.role?.name || '', active: u.active,
                      })}
                      title="Cambiar su nombre, su rol o darle de baja">Editar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editaUsuario && (
        <Modal title={`Editar a ${editaUsuario.email}`} onClose={() => setEditaUsuario(null)}>
          {/* MOVER A ALGUIEN DE PUESTO ES CAMBIARLE EL ROL, NO CREARLE OTRO
              USUARIO. Con dos usuarios para la misma persona, la firma de las
              órdenes deja de decir quién hizo qué — y eso es justo lo que este
              software existe para saber. */}
          <div className="form-grid">
            <label>Nombre y apellido
              <input value={editaUsuario.fullName}
                onChange={(e) => setEditaUsuario({ ...editaUsuario, fullName: e.target.value })} />
            </label>
            <label>Rol
              <select value={editaUsuario.roleId}
                onChange={(e) => setEditaUsuario({ ...editaUsuario, roleId: e.target.value })}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <input type="checkbox" checked={editaUsuario.active} style={{ width: 'auto' }}
              onChange={(e) => setEditaUsuario({ ...editaUsuario, active: e.target.checked })} />
            Sigue trabajando aquí
          </label>
          {/* SE DESACTIVA, NO SE BORRA. Quien firmó una orden no se puede
              borrar o quedan documentos firmados por nadie (bloque 15). */}
          <p className="muted" style={{ fontSize: 11.5 }}>
            Al desmarcarlo pierde el acceso en el acto. No se borra: su firma en las órdenes se conserva.
          </p>

          {error && <div className="error">{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn-primary" onClick={guardarUsuario} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button className="btn-mini" onClick={() => setEditaUsuario(null)} disabled={saving}>Cancelar</button>
          </div>
        </Modal>
      )}

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
