import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import BorrarDefinitivo from '../components/BorrarDefinitivo';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';
import { Titular } from '../components/Patron';
import { plural } from '../formato';
import { fecha } from '../fechas';
import { mensajeDeError } from '../avisos';

/**
 * LIMPIEZA DE DATOS (bloque 15) — exige el permiso «Borrar definitivamente».
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
 * escribir el código a mano. Un `confirm()` del navegador se acepta por reflejo; escribir
 * el código obliga a mirar cuál se está borrando.
 */
export default function Limpieza() {
  const { can } = useAuth();
  const puedePurgar = can('purga.definitiva');

  const [pestana, setPestana] = useState<'activos' | 'om' | 'usuarios' | 'auditoria' | 'todo'>('activos');
  // Bloque 39: dejar la base como el primer día, antes del despliegue real.
  const [operativos, setOperativos] = useState<any>(null);
  const [fraseVaciarTodo, setFraseVaciarTodo] = useState('');
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [candidatosOm, setCandidatosOm] = useState<any[]>([]);
  const [resumenOm, setResumenOm] = useState<any>(null);
  const [vaciando, setVaciando] = useState(false);
  const [fraseVaciar, setFraseVaciar] = useState('');
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');
  const [hecho, setHecho] = useState('');

  const [aBorrar, setABorrar] = useState<{ tipo: 'activo' | 'om' | 'usuario'; id: string } | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [errorModal, setErrorModal] = useState('');

  // Auditoría
  const [antesDe, setAntesDe] = useState('');
  const [previaAudit, setPreviaAudit] = useState<any>(null);

  const cargar = useCallback(async () => {
    try {
      const [c, om, res, u] = await Promise.all([
        api.get('/purga/candidatos').then((r) => r.data).catch(() => []),
        api.get('/purga/candidatos-om').then((r) => r.data).catch(() => []),
        api.get('/purga/resumen-om').then((r) => r.data).catch(() => null),
        api.get('/users').then((r) => r.data?.items || r.data || []).catch(() => []),
      ]);
      setCandidatos(c || []);
      setCandidatosOm(om || []);
      setResumenOm(res);
      setUsuarios(u || []);
      setFallo('');
    } catch {
      setFallo('No se pudo cargar. Vuelve a intentarlo.');
    }
  }, []);

  useEffect(() => { setCargando(true); cargar().finally(() => setCargando(false)); }, [cargar]);

  /* DEJAR LA BASE COMO EL PRIMER DÍA (bloque 39).
     Es lo que se usa el día del despliegue real: se borra todo lo que se cargó
     para la demo y quedan los usuarios, los roles, el árbol de planta, los
     catálogos y la auditoría. */
  async function vaciarTodo() {
    setVaciando(true); setErrorModal('');
    try {
      const r = await api.post('/purga/vaciar-todo', { confirmacion: fraseVaciarTodo });
      setHecho(`Base vacía: ${plural(r.data.total, 'registro')} borrados. Los usuarios y el árbol de planta siguen ahí.`);
      setFraseVaciarTodo('');
      setOperativos(null);
      await cargar();
    } catch (e: any) {
      setErrorModal(mensajeDeError(e, 'vaciar'));
    } finally { setVaciando(false); }
  }

  async function vaciarOrdenes() {
    setVaciando(true); setErrorModal('');
    try {
      const r = await api.post('/purga/vaciar-om', { confirmacion: fraseVaciar });
      setHecho(`Borradas ${r.data.borradas} órdenes (${r.data.cerradas} estaban cerradas). La sección quedó vacía.`);
      setFraseVaciar('');
      await cargar();
    } catch (e: any) {
      setErrorModal(mensajeDeError(e, 'vaciar'));
    } finally { setVaciando(false); }
  }

  async function verPreviaAudit() {
    if (!antesDe) return;
    setErrorModal('');
    try {
      const r = await api.get('/purga/auditoria', { params: { antesDe: new Date(antesDe).toISOString() } });
      setPreviaAudit(r.data);
    } catch (e: any) {
      setPreviaAudit(null);
      setErrorModal(mensajeDeError(e, 'consultar'));
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
      setErrorModal(mensajeDeError(e, 'depurar'));
    } finally { setBorrando(false); }
  }

  if (!can('asset.delete') && !can('user.manage') && !can('audit.read')) {
    return <div className="card vacio"><h3>Sin acceso</h3><p>Para ver la limpieza hace falta poder eliminar activos, administrar usuarios o leer la auditoría.</p></div>;
  }

  return (
    <div className="page">
      <Titular
        tono={puedePurgar ? 'grave' : 'sindatos'}
        texto="Aquí se borra de verdad, y no hay vuelta atrás"
        apoyo={puedePurgar
          ? 'Nada de esto se recupera. Antes de cada borrado se enseña qué se lleva por delante.'
          : 'Puedes mirar, pero no borrar: te falta el permiso «Borrar definitivamente».'}
      />

      {hecho && <div className="card" style={{ borderColor: '#7fbf8f', background: '#eef8f0' }}>{hecho}</div>}
      {fallo && <div className="card aviso-error">{fallo}</div>}

      <div className="pestanas">
        <button className={pestana === 'activos' ? 'act' : ''} onClick={() => setPestana('activos')}>
          Activos sospechosos ({candidatos.length})
        </button>
        <button className={pestana === 'om' ? 'act' : ''} onClick={() => setPestana('om')}>
          Órdenes sin usar ({candidatosOm.length})
        </button>
        <button className={pestana === 'usuarios' ? 'act' : ''} onClick={() => setPestana('usuarios')}>
          Usuarios
        </button>
        <button className={pestana === 'auditoria' ? 'act' : ''} onClick={() => setPestana('auditoria')}>
          Auditoría antigua
        </button>
        <button className={pestana === 'todo' ? 'act' : ''} onClick={() => setPestana('todo')}>
          Dejar la base vacía
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
                    <td>{fecha(a.creado)}</td>
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

      {/* ---------- ÓRDENES DE MANTENIMIENTO ---------- */}
      {!cargando && pestana === 'om' && (
        candidatosOm.length === 0 ? (
          <div className="card vacio">
            <h3>No hay órdenes en blanco</h3>
            <p>
              Aquí sólo salen las que <strong>no tienen avance, ni material, ni
              fotos, ni checklist</strong>. Una orden abierta esperando la parada
              del tren no es basura y no aparece.
            </p>
          </div>
        ) : (
          <>
            <div className="card explica">
              Aquí salen <b>todas</b> las órdenes, incluidas las cerradas. Las que
              llevan firma o material retirado se pueden borrar igual, pero piden
              una <b>segunda confirmación</b> y quedan marcadas como forzadas en
              la auditoría.
            </div>

            {/* VACIAR TODO — antes del estreno, borrar de una en una son cien
                clics, y al clic treinta nadie lee lo que escribe. */}
            {resumenOm && resumenOm.total > 0 && (
              <div className="card peligro">
                <b>Vaciar la sección entera ({resumenOm.total} órdenes)</b>
                <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>
                  Para dejar Órdenes <b>en blanco</b> y empezar a llenarla con trabajo
                  real. Se van <b>todas</b>, incluidas las{' '}
                  {resumenOm.porEstado.map((e: any) => `${e.n} ${e.estado}`).join(', ')}.
                  <div style={{ marginTop: 6 }}>
                    <b>Los activos NO se borran</b>: los levantados en órdenes de mapeo
                    siguen ahí, sólo pierden el enlace.
                  </div>
                  {resumenOm.lineasConRetiro > 0 && (
                    <div style={{ marginTop: 6 }}>
                      Hay <b>{resumenOm.lineasConRetiro}</b> línea(s) con material retirado.
                      Los <b>movimientos de almacén se quedan</b>: esto no revierte el stock.
                      Si el almacén también es de prueba, cuádralo desde Inventario.
                    </div>
                  )}
                </div>
                <label className="campo" style={{ marginTop: 10, maxWidth: 420 }}>
                  <span>Escribe <code>VACIAR TODAS LAS ORDENES</code></span>
                  <input value={fraseVaciar} onChange={(e) => setFraseVaciar(e.target.value)}
                         autoComplete="off" placeholder="La frase completa" />
                </label>
                <button className="btn-peligro" onClick={vaciarOrdenes}
                        title="Escribe arriba la frase VACIAR TODAS LAS ORDENES, tal cual, para que se active."
                        disabled={vaciando || fraseVaciar.trim().toUpperCase().replace(/\s+/g, ' ') !== 'VACIAR TODAS LAS ORDENES'}>
                  {vaciando ? 'Vaciando…' : `Vaciar las ${resumenOm.total} órdenes`}
                </button>
              </div>
            )}
            <table className="tabla">
              <thead>
                <tr><th>Código</th><th>Tipo</th><th>Estado</th><th>Equipo</th><th>Creada</th><th>Señales</th><th></th></tr>
              </thead>
              <tbody>
                {candidatosOm.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.code}</strong>
                      {o.actividad && <div className="muted" style={{ fontSize: 11.5 }}>{o.actividad}</div>}
                    </td>
                    <td>{o.tipo}</td>
                    <td><span className={'badge ' + o.estado}>{o.estado}</span></td>
                    <td>{o.equipo || <span className="muted">—</span>}</td>
                    <td className="muted">{fecha(o.creada)}</td>
                    <td>
                      {o.razones.length === 0 ? <span className="muted">—</span> :
                        o.razones.map((r: string) => <span key={r} className="chip est-MANTENIMIENTO" style={{ marginRight: 4 }}>{r}</span>)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className={o.exigeForzar ? 'btn-mini btn-danger' : 'btn-mini'}
                              title={o.exigeForzar ? 'Tiene avisos: pedirá una segunda confirmación' : undefined}
                              onClick={() => setABorrar({ tipo: 'om', id: o.id })}>
                        Revisar y borrar
                      </button>
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

      {/* ---------- DEJAR LA BASE VACÍA (bloque 39) ---------- */}
      {!cargando && pestana === 'todo' && (
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>
            Dejar la base como el primer día
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>
            Para el día del despliegue real. Borra lo operativo —activos,
            incidencias, órdenes, almacén— y <b>conserva usuarios, roles, el
            árbol de planta, los catálogos y la auditoría</b>.
          </p>

          {!operativos ? (
            <button className="btn" style={{ marginTop: 14 }}
              onClick={async () => {
                const r = await api.get('/purga/operativos').then((x) => x.data).catch(() => null);
                setOperativos(r ?? {});
              }}>
              Ver qué hay ahora mismo
            </button>
          ) : (
            <>
              {/* NADIE BORRA A CIEGAS. Primero se enseña el precio. */}
              <div className="card explica" style={{ marginTop: 14 }}>
                <b>Esto es lo que se va a borrar:</b>
                <ul style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.7 }}>
                  {Object.entries(operativos)
                    .filter(([, n]) => (n as number) > 0)
                    .map(([k, n]) => <li key={k}><b>{n as number}</b> {k}</li>)}
                  {Object.values(operativos).every((n) => !n) && (
                    <li>Nada. La base ya está vacía de datos operativos.</li>
                  )}
                </ul>
              </div>

              {Object.values(operativos).some((n) => (n as number) > 0) && (
                <div style={{ marginTop: 14 }}>
                  <label>Escribe <code>DEJAR LA BASE VACIA</code> para confirmar</label>
                  <input aria-label="Escribe la frase de confirmación" value={fraseVaciarTodo}
                    onChange={(e) => setFraseVaciarTodo(e.target.value)}
                    placeholder="DEJAR LA BASE VACIA" autoComplete="off" />
                  <button className="btn-peligro" style={{ marginTop: 10 }}
                    onClick={vaciarTodo}
                    title="Escribe arriba la frase DEJAR LA BASE VACIA, tal cual, para que se active."
                    disabled={vaciando
                      || fraseVaciarTodo.trim().toUpperCase().replace(/\s+/g, ' ') !== 'DEJAR LA BASE VACIA'}>
                    {vaciando ? 'Vaciando…' : 'Dejar la base vacía'}
                  </button>
                </div>
              )}
            </>
          )}

          {errorModal && <div className="card peligro" style={{ marginTop: 12 }}>{errorModal}</div>}
        </div>
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

          {errorModal && <div role="alert" className="aviso-error" style={{ margin: '10px 0' }}>{errorModal}</div>}

          <label className="campo">
            <span>Borrar registros anteriores a</span>
            <input type="date" value={antesDe} onChange={(e) => { setAntesDe(e.target.value); setPreviaAudit(null); }} />
          </label>
          <button className="btn-mini" onClick={verPreviaAudit} disabled={!antesDe}>Ver cuántos son</button>

          {previaAudit && (
            <div style={{ marginTop: 14 }}>
              <div className="tg-aviso">
                Se borrarían <b>{previaAudit.total}</b> registros.
                {previaAudit.masAntiguo && ` El más antiguo es del ${fecha(previaAudit.masAntiguo)}.`}
              </div>
              <label className="campo" style={{ marginTop: 10 }}>
                <span>Escribe <code>DEPURAR AUDITORIA</code> para confirmar</span>
                <input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
              </label>
              <button className="btn-peligro" onClick={purgarAudit}
                      title="Escribe arriba la frase DEPURAR AUDITORIA, tal cual, para que se active."
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
              aBorrar.tipo === 'usuario'
                ? `Borrado el usuario ${r.email}.`
                : `Borrado ${r.code} y ${plural(r.arrastrado, 'registro')} asociados.`
                  + (r.conservado ? ` Se conservaron ${plural(r.conservado, 'registro')} que no dependen de la orden.` : ''),
            );
            setABorrar(null);
            cargar();
          }}
        />
      )}

    </div>
  );
}
