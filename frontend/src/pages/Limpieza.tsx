import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import BorrarDefinitivo from '../components/BorrarDefinitivo';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';

/**
 * LIMPIEZA DE DATOS (bloque 15) — sólo el Jefe de Mantenimiento.
 *
 * DOS COSAS DISTINTAS, Y LA PANTALLA LO DICE EN VOZ ALTA
 *   · BAJA    — el equipo existió y salió de planta. Conserva su historial.
 *   · PURGA   — el registro nunca debió existir (prueba, duplicado, tecleo).
 *               Se borra de verdad, con todo lo que cuelgue.
 *
 * Confundirlas es el error caro: purgar un equipo real borra el historial
 * que costó meses juntar.
 *
 * Antes de borrar SIEMPRE se enseña qué se lleva por delante, y hay que
 * escribir el código a mano. Un `confirm()` se acepta por reflejo; escribir
 * el código obliga a mirar cuál se está borrando.
 */
export default function Limpieza() {
  const { can, user } = useAuth();
  const esJefe = user?.role === 'Jefe de Mantenimiento';

  const [pestana, setPestana] = useState<'activos' | 'usuarios' | 'auditoria'>('activos');
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');
  const [hecho, setHecho] = useState('');

  const [aBorrar, setABorrar] = useState<{ tipo: 'activo' | 'usuario'; id: string } | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [errorModal, setErrorModal] = useState('');

  // Auditoría
  const [antesDe, setAntesDe] = useState('');
  const [previaAudit, setPreviaAudit] = useState<any>(null);

  const cargar = useCallback(async () => {
    try {
      const [c, u] = await Promise.all([
        api.get('/purga/candidatos').then((r) => r.data).catch(() => []),
        api.get('/users').then((r) => r.data?.items || r.data || []).catch(() => []),
      ]);
      setCandidatos(c || []);
      setUsuarios(u || []);
      setFallo('');
    } catch {
      setFallo('No se pudo cargar. Vuelve a intentarlo.');
    }
  }, []);

  useEffect(() => { setCargando(true); cargar().finally(() => setCargando(false)); }, [cargar]);

  async function verPreviaAudit() {
    if (!antesDe) return;
    setErrorModal('');
    try {
      const r = await api.get('/purga/auditoria', { params: { antesDe: new Date(antesDe).toISOString() } });
      setPreviaAudit(r.data);
    } catch (e: any) {
      setPreviaAudit(null);
      setErrorModal(e?.response?.data?.message || 'No se pudo consultar.');
    }
  }

  async function purgarAudit() {
    if (!previaAudit) return;
    setBorrando(true); setErrorModal('');
    try {
      const r = await api.post('/purga/auditoria', {
        antesDe: new Date(antesDe).toISOString(),
        confirmacion,
      });
      setHecho(`Depurados ${r.data.borrados} registros de auditoría.`);
      setPreviaAudit(null); setConfirmacion('');
    } catch (e: any) {
      setErrorModal(e?.response?.data?.message || 'No se pudo depurar.');
    } finally { setBorrando(false); }
  }

  if (!can('asset.delete') && !can('user.manage') && !can('audit.read')) {
    return <div className="card vacio"><h3>Sin acceso</h3><p>Esta pantalla es del Jefe de Mantenimiento.</p></div>;
  }

  return (
    <div className="page">
      <div className="card peligro">
        <b>Aquí se borra de verdad, y no hay vuelta atrás.</b>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
          <b>Dar de baja</b> es para un equipo que existió y salió de planta: desaparece
          de los listados y <b>conserva su historial</b>. Eso se hace desde Activos.<br />
          <b>Borrar definitivamente</b> (esta pantalla) es para un registro que
          <b> nunca debió existir</b>: una prueba, un duplicado, un código mal tecleado.
        </div>
        {!esJefe && (
          <div className="tg-aviso" style={{ marginTop: 10 }}>
            Aunque veas esta pantalla, el borrado definitivo <b>sólo lo ejecuta el
            Jefe de Mantenimiento</b>. Es una operación sin vuelta y pide dos llaves:
            el permiso y el rol.
          </div>
        )}
      </div>

      {hecho && <div className="card" style={{ borderColor: '#7fbf8f', background: '#eef8f0' }}>{hecho}</div>}
      {fallo && <div className="card aviso-error">{fallo}</div>}

      <div className="pestanas">
        <button className={pestana === 'activos' ? 'act' : ''} onClick={() => setPestana('activos')}>
          Activos sospechosos ({candidatos.length})
        </button>
        <button className={pestana === 'usuarios' ? 'act' : ''} onClick={() => setPestana('usuarios')}>
          Usuarios
        </button>
        <button className={pestana === 'auditoria' ? 'act' : ''} onClick={() => setPestana('auditoria')}>
          Auditoría antigua
        </button>
      </div>

      {cargando && <EsqueletoTabla filas={4} />}

      {/* ---------- ACTIVOS ---------- */}
      {!cargando && pestana === 'activos' && (
        candidatos.length === 0 ? (
          <div className="card vacio">
            <h3>No hay activos sospechosos de ser basura</h3>
            <p>
              Aquí sólo salen los que <strong>no tienen ninguna orden ni incidencia</strong>.
              Si un equipo tiene trabajo registrado, es real: no aparece.
            </p>
          </div>
        ) : (
          <>
            <div className="card explica">
              Estos activos <b>no tienen ninguna orden ni incidencia</b>. Se ordenan por
              señales de que podrían ser basura: sin ubicación, sin historial, o con un
              código que no sigue el patrón <code>AA-XXX-…</code>. Es una <b>pista para
              ordenar</b>, no un juicio: mira el código antes de borrar.
            </div>
            <table className="tabla">
              <thead>
                <tr><th>Código</th><th>Tipo</th><th>Dónde</th><th>Creado</th><th>Señales</th><th></th></tr>
              </thead>
              <tbody>
                {candidatos.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.code}</strong>{a.yaEstaDeBaja && <span className="chip est-BAJA" style={{ marginLeft: 6 }}>de baja</span>}</td>
                    <td>{a.tipo}</td>
                    <td>{a.lugar || <span className="muted">—</span>}</td>
                    <td>{new Date(a.creado).toLocaleDateString('es-PE')}</td>
                    <td>
                      {a.razones.length === 0 ? <span className="muted">—</span> :
                        a.razones.map((r: string) => <span key={r} className="chip est-MANTENIMIENTO" style={{ marginRight: 4 }}>{r}</span>)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-mini" onClick={() => setABorrar({ tipo: 'activo', id: a.id })}>Revisar y borrar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      )}

      {/* ---------- USUARIOS ---------- */}
      {!cargando && pestana === 'usuarios' && (
        <>
          <div className="card explica">
            Una persona que <b>firmó algo</b> —cerró una orden, autorizó un trabajo en
            altura— <b>no se puede borrar</b>: dejaría documentos firmados por nadie.
            A esas se las desactiva desde Usuarios.
          </div>
          <table className="tabla">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {usuarios.map((u: any) => (
                <tr key={u.id}>
                  <td><strong>{u.fullName}</strong></td>
                  <td>{u.email}</td>
                  <td>{u.role?.name || u.role || '—'}</td>
                  <td>{u.active ? 'Activo' : 'Desactivado'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-mini" onClick={() => setABorrar({ tipo: 'usuario', id: u.id })}>Revisar y borrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ---------- AUDITORÍA ---------- */}
      {!cargando && pestana === 'auditoria' && (
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>Depurar auditoría antigua</div>
          <p style={{ fontSize: 13 }}>
            La auditoría es el registro de quién hizo qué. Se puede depurar lo viejo
            para que no crezca sin límite, con tres frenos:
          </p>
          <ul style={{ fontSize: 13, lineHeight: 1.7 }}>
            <li><b>Nunca lo reciente:</b> mínimo 90 días de antigüedad. Poder borrar lo de hoy convertiría la auditoría en un adorno.</li>
            <li><b>La depuración queda registrada</b> con quién la hizo y cuántas filas borró. El hueco se ve.</li>
            <li><b>Los registros de borrados anteriores nunca se van.</b> Esa cadena no se rompe.</li>
          </ul>

          {errorModal && <div className="aviso-error" style={{ margin: '10px 0' }}>{errorModal}</div>}

          <label className="campo">
            <span>Borrar registros anteriores a</span>
            <input type="date" value={antesDe} onChange={(e) => { setAntesDe(e.target.value); setPreviaAudit(null); }} />
          </label>
          <button className="btn-mini" onClick={verPreviaAudit} disabled={!antesDe}>Ver cuántos son</button>

          {previaAudit && (
            <div style={{ marginTop: 14 }}>
              <div className="tg-aviso">
                Se borrarían <b>{previaAudit.total}</b> registros.
                {previaAudit.masAntiguo && ` El más antiguo es del ${new Date(previaAudit.masAntiguo).toLocaleDateString('es-PE')}.`}
              </div>
              <label className="campo" style={{ marginTop: 10 }}>
                <span>Escribe <code>DEPURAR AUDITORIA</code> para confirmar</span>
                <input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
              </label>
              <button className="btn-peligro" onClick={purgarAudit}
                      disabled={borrando || confirmacion.trim().toUpperCase() !== 'DEPURAR AUDITORIA'}>
                {borrando ? 'Depurando…' : `Depurar ${previaAudit.total} registros`}
              </button>
            </div>
          )}
        </div>
      )}

      {aBorrar && (
        <BorrarDefinitivo
          tipo={aBorrar.tipo}
          id={aBorrar.id}
          onCerrar={() => setABorrar(null)}
          onBorrado={(r) => {
            setHecho(
              aBorrar.tipo === 'activo'
                ? `Borrado ${r.code} y ${r.arrastrado} registro(s) asociados.`
                : `Borrado el usuario ${r.email}.`,
            );
            setABorrar(null);
            cargar();
          }}
        />
      )}

    </div>
  );
}
