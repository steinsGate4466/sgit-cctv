import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import Icono from '../components/Iconos';
import FiltroAmbito, { Ambito, AMBITO_VACIO, conAmbito } from '../components/FiltroAmbito';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';
import { useDialogos } from '../components/Dialogos';

/**
 * CONEXIONES DE RED (bloque 12.1).
 *
 * LA PANTALLA QUE FALTABA.
 * El mapa y el análisis de impacto llevaban semanas construidos, pero no
 * había dónde decir qué está conectado con qué. Aquí se declara, y todo lo
 * demás empieza a funcionar solo.
 *
 * DOS PESTAÑAS, PORQUE SON DOS COSAS DISTINTAS
 *   · PUERTOS — el switch dibujado puerto por puerto. Es el dato bueno,
 *     el que se anota al cablear.
 *   · ENLACES — lo que no pasa por un puerto numerado: el anillo de fibra,
 *     un radioenlace entre naves.
 */

const TIPO: Record<string, string> = {
  CAMERA: 'Cámara', NVR: 'NVR', SWITCH: 'Switch', WIRELESS: 'Enlace', ROUTER: 'Router',
  FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', FIBER: 'Fibra', CABINET: 'Gabinete',
  DECODER: 'Decodificador', PC: 'PC / iVMS', OTHER: 'Otro',
};
const MEDIO: Record<string, string> = {
  FIBRA: 'Fibra', COBRE: 'Cobre', INALAMBRICO: 'Inalámbrico',
};

export default function Conexiones() {
  const { confirmar, avisar } = useDialogos();
  const { can } = useAuth();
  const puedeEditar = can('asset.update');

  const [pestana, setPestana] = useState<'puertos' | 'enlaces'>('puertos');
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_VACIO);
  const [switches, setSwitches] = useState<any[]>([]);
  const [enlaces, setEnlaces] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');

  // Edición de un puerto
  const [editando, setEditando] = useState<any>(null);
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [busca, setBusca] = useState('');
  const [elegido, setElegido] = useState('');
  const [poe, setPoe] = useState(false);
  const [vlan, setVlan] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState('');

  // Alta de enlace
  const [nuevoEnlace, setNuevoEnlace] = useState(false);
  const [ladoA, setLadoA] = useState('');
  const [ladoB, setLadoB] = useState('');
  const [medio, setMedio] = useState('FIBRA');
  const [anillo, setAnillo] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [todos, setTodos] = useState<any[]>([]);

  const cargar = useCallback(async () => {
    try {
      const [sw, en] = await Promise.all([
        api.get('/conexiones/switches', { params: conAmbito({}, ambito) }).then((r) => r.data),
        api.get('/conexiones/enlaces', { params: conAmbito({}, ambito) }).then((r) => r.data),
      ]);
      setSwitches(sw || []);
      setEnlaces(en || []);
      setFallo('');
    } catch (e: any) {
      setFallo(e?.response?.status === 403
        ? 'Tu usuario no tiene permiso para ver la red.'
        : 'No se pudieron cargar las conexiones. Vuelve a intentarlo.');
    }
  }, [ambito]);

  useEffect(() => { setCargando(true); cargar().finally(() => setCargando(false)); }, [cargar]);

  async function pedirCandidatos(q: string) {
    try {
      const r = await api.get('/conexiones/candidatos', { params: q ? { q } : {} });
      setCandidatos(r.data || []);
    } catch { setCandidatos([]); }
  }

  function abrirPuerto(sw: any, numero: number, puerto: any) {
    setEditando({ sw, numero, puerto });
    setElegido(puerto?.equipo?.id || '');
    setPoe(!!puerto?.poe);
    setVlan(puerto?.vlan ? String(puerto.vlan) : '');
    setBusca('');
    setErrorModal('');
    pedirCandidatos('');
  }

  async function guardarPuerto() {
    if (!editando) return;
    setGuardando(true);
    setErrorModal('');
    try {
      await api.post('/conexiones/puertos', {
        switchId: editando.sw.id,
        numero: editando.numero,
        connectedAssetId: elegido || null,
        poe,
        vlan: vlan.trim() ? Number(vlan) : null,
      });
      setEditando(null);
      await cargar();
    } catch (e: any) {
      setErrorModal(e?.response?.data?.message || 'No se pudo guardar. Revisa los datos.');
    } finally { setGuardando(false); }
  }

  async function vaciar(puertoId: string, code: string) {
    if (!(await confirmar(`¿Desenchufar ${code}?\n\nEl equipo NO se borra: sólo deja de estar en este puerto.`))) return;
    try { await api.delete(`/conexiones/puertos/${puertoId}`); await cargar(); }
    catch { await avisar('No se pudo desenchufar.'); }
  }

  async function abrirNuevoEnlace() {
    setNuevoEnlace(true);
    setLadoA(''); setLadoB(''); setMedio('FIBRA'); setAnillo(false);
    setDescripcion(''); setErrorModal('');
    try {
      const r = await api.get('/conexiones/candidatos');
      setTodos(r.data || []);
    } catch { setTodos([]); }
  }

  async function guardarEnlace() {
    setGuardando(true);
    setErrorModal('');
    try {
      await api.post('/conexiones/enlaces', {
        endpointAId: ladoA, endpointBId: ladoB, medium: medio,
        isRing: anillo, description: descripcion.trim() || undefined,
      });
      setNuevoEnlace(false);
      await cargar();
    } catch (e: any) {
      setErrorModal(e?.response?.data?.message || 'No se pudo crear el enlace.');
    } finally { setGuardando(false); }
  }

  async function borrarEnlace(id: string, texto: string) {
    if (!(await confirmar(`¿Borrar el enlace ${texto}?`))) return;
    try { await api.delete(`/conexiones/enlaces/${id}`); await cargar(); }
    catch { await avisar('No se pudo borrar.'); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <FiltroAmbito valor={ambito} onChange={setAmbito} />
      </div>

      <div className="card explica">
        <b>Aquí se declara qué está conectado con qué.</b> De esto salen el mapa
        de la red y el cálculo de qué se deja de ver si un equipo cae. Sin esto,
        el mapa son cajas sueltas.
        <div style={{ marginTop: 6, fontSize: 12.5 }}>
          <b>Puertos</b> para lo que va a un puerto numerado del switch — es el dato bueno.{' '}
          <b>Enlaces</b> para el anillo de fibra y los radioenlaces.{' '}
          Las cámaras se enlazan a su grabador en la pantalla <b>Grabadores</b>.
        </div>
      </div>

      <div className="pestanas">
        <button className={pestana === 'puertos' ? 'act' : ''} onClick={() => setPestana('puertos')}>
          Puertos de switch ({switches.length})
        </button>
        <button className={pestana === 'enlaces' ? 'act' : ''} onClick={() => setPestana('enlaces')}>
          Enlaces declarados ({enlaces.length})
        </button>
      </div>

      {fallo && <div className="card aviso-error">{fallo}</div>}
      {cargando && <EsqueletoTabla filas={4} />}

      {/* ---------- PUERTOS ---------- */}
      {!cargando && pestana === 'puertos' && (
        switches.length === 0 ? (
          <div className="card vacio">
            <h3>No hay switches registrados</h3>
            <p>
              Da de alta los switches como activos de tipo <strong>SWITCH</strong> en
              la pantalla de Activos, y anota en su ficha <strong>cuántos puertos</strong>{' '}
              tienen. Entonces aparecerán aquí para ir enchufando equipos.
            </p>
          </div>
        ) : (
          switches.map((sw) => (
            <div key={sw.id} className="card" style={{ marginBottom: 14 }}>
              <div className="sw-cabecera">
                <div>
                  <strong>{sw.code}</strong>
                  <span className={`chip est-${sw.estado}`} style={{ marginLeft: 8 }}>{sw.estado}</span>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {sw.lugar || sw.modelo || '—'}{sw.tren ? ` · ${sw.tren}` : ''}
                  </div>
                </div>
                <div className="sw-cifras">
                  <div><b>{sw.ocupados}</b><span>ocupados</span></div>
                  <div><b>{sw.capacidad ?? '—'}</b><span>puertos</span></div>
                  <div className={sw.libres === 0 ? 'lleno' : ''}>
                    <b>{sw.libres ?? '?'}</b><span>libres</span>
                  </div>
                </div>
              </div>

              {sw.capacidad == null && (
                <div className="tg-aviso" style={{ marginTop: 8 }}>
                  Falta el número de puertos del switch. Sin ese dato no se calculan los libres.
                </div>
              )}

              <div className="rejilla-puertos">
                {Array.from({ length: Math.max(sw.capacidad || 0, ...sw.puertos.map((p: any) => p.numero), 0) }, (_, i) => i + 1).map((n) => {
                  const p = sw.puertos.find((x: any) => x.número === n);
                  const eq = p?.equipo;
                  return (
                    <div
                      key={n}
                      className={`puerto ${eq ? 'ocupado' : 'libre'} ${eq ? `est-${eq.estado}` : ''}`}
                      onClick={puedeEditar ? () => abrirPuerto(sw, n, p) : undefined}
                      role={puedeEditar ? 'button' : undefined}
                    >
                      <div className="p-num">{n}{p?.poe && <span className="p-poe" title="Puerto con PoE">PoE</span>}</div>
                      {eq ? (
                        <>
                          <div className="p-code">{eq.code}</div>
                          <div className="p-tipo">{TIPO[eq.tipo] || eq.tipo}</div>
                          {puedeEditar && (
                            <button
                              className="canal-quitar"
                              title="Desenchufar"
                              onClick={(e) => { e.stopPropagation(); vaciar(p.id, eq.code); }}
                            >×</button>
                          )}
                        </>
                      ) : (
                        <div className="p-libre">{puedeEditar ? '+ enchufar' : 'libre'}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )
      )}

      {/* ---------- ENLACES ---------- */}
      {!cargando && pestana === 'enlaces' && (
        <>
          {puedeEditar && (
            <button className="btn-primary" style={{ marginBottom: 12 }} onClick={abrirNuevoEnlace}>
              <Icono n="cableado" size={16} /> Declarar un enlace
            </button>
          )}
          {enlaces.length === 0 ? (
            <div className="card vacio">
              <h3>No hay enlaces declarados</h3>
              <p>
                Aquí van la fibra del anillo del core y los radioenlaces entre naves.
                Marcar un tramo como <strong>anillo</strong> es lo que permite al
                análisis entender que hay camino alternativo — y por eso un anillo
                bien montado da impacto cero.
              </p>
            </div>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Medio</th><th>Extremo A</th><th>Extremo B</th>
                  <th>Anillo</th><th>Detalle</th>{puedeEditar && <th></th>}
                </tr>
              </thead>
              <tbody>
                {enlaces.map((e) => (
                  <tr key={e.id}>
                    <td>{MEDIO[e.medio] || e.medio}</td>
                    <td><strong>{e.a.code}</strong></td>
                    <td><strong>{e.b.code}</strong></td>
                    <td>{e.esAnillo ? 'Sí' : '—'}</td>
                    <td>{e.descripcion || '—'}</td>
                    {puedeEditar && (
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn-mini" onClick={() => borrarEnlace(e.id, `${e.a.code} ↔ ${e.b.code}`)}>
                          Borrar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* ---------- MODAL: PUERTO ---------- */}
      {editando && (
        <Modal
          title={`Puerto ${editando.numero} de ${editando.sw.code}`}
          onClose={() => setEditando(null)}
          acciones={
            <>
              <button className="btn-mini" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn-primary" onClick={guardarPuerto} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          }
        >
          {errorModal && <div role="alert" className="aviso-error" style={{ marginBottom: 10 }}>{errorModal}</div>}

          <label className="campo">
            <span>Buscar el equipo</span>
            <input
              value={busca}
              onChange={(e) => { setBusca(e.target.value); pedirCandidatos(e.target.value); }}
              placeholder="Código, modelo o sitio"
            />
            <small className="muted">
              Sólo salen los equipos que no están ya en otro puerto.
            </small>
          </label>

          <div className="lista-elegir">
            <label className={`fila-elegir ${elegido === '' ? 'sel' : ''}`}>
              <input type="radio" name="eq" checked={elegido === ''} onChange={() => setElegido('')} />
              <span><em>Dejar el puerto libre</em></span>
            </label>
            {candidatos.map((c) => (
              <label key={c.id} className={`fila-elegir ${elegido === c.id ? 'sel' : ''}`}>
                <input type="radio" name="eq" checked={elegido === c.id} onChange={() => setElegido(c.id)} />
                <span><strong>{c.code}</strong> — {TIPO[c.tipo] || c.tipo}{c.lugar ? ` · ${c.lugar}` : ''}</span>
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={poe} onChange={(e) => setPoe(e.target.checked)} />
              Este puerto entrega PoE
            </label>
            <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
              VLAN
              <input
                type="number" min={1} value={vlan}
                onChange={(e) => setVlan(e.target.value)}
                style={{ width: 90 }} placeholder="—"
              />
            </label>
          </div>
        </Modal>
      )}

      {/* ---------- MODAL: ENLACE ---------- */}
      {nuevoEnlace && (
        <Modal
          title="Declarar un enlace"
          onClose={() => setNuevoEnlace(false)}
          acciones={
            <>
              <button className="btn-mini" onClick={() => setNuevoEnlace(false)}>Cancelar</button>
              <button className="btn-primary" onClick={guardarEnlace} disabled={!ladoA || !ladoB || guardando}>
                {guardando ? 'Guardando…' : 'Crear enlace'}
              </button>
            </>
          }
        >
          {errorModal && <div role="alert" className="aviso-error" style={{ marginBottom: 10 }}>{errorModal}</div>}

          <label className="campo">
            <span>Extremo A</span>
            <select value={ladoA} onChange={(e) => setLadoA(e.target.value)}>
              <option value="">— elegir —</option>
              {todos.map((c) => <option key={c.id} value={c.id}>{c.code} ({TIPO[c.tipo] || c.tipo})</option>)}
            </select>
          </label>

          <label className="campo">
            <span>Extremo B</span>
            <select value={ladoB} onChange={(e) => setLadoB(e.target.value)}>
              <option value="">— elegir —</option>
              {todos.filter((c) => c.id !== ladoA).map((c) => (
                <option key={c.id} value={c.id}>{c.code} ({TIPO[c.tipo] || c.tipo})</option>
              ))}
            </select>
          </label>

          <label className="campo">
            <span>Medio</span>
            <select value={medio} onChange={(e) => setMedio(e.target.value)}>
              <option value="FIBRA">Fibra</option>
              <option value="COBRE">Cobre</option>
              <option value="INALAMBRICO">Inalámbrico</option>
            </select>
          </label>

          <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13, margin: '10px 0' }}>
            <input type="checkbox" checked={anillo} onChange={(e) => setAnillo(e.target.checked)} />
            Es un tramo del anillo de fibra
          </label>
          <small className="muted" style={{ display: 'block', marginBottom: 10 }}>
            Marcarlo permite detectar camino alternativo. Un anillo declarado da impacto cero.
          </small>

          <label className="campo">
            <span>Detalle (opcional)</span>
            <input
              value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: tramo Púlpito T1 → Sala de servidores" maxLength={200}
            />
          </label>
        </Modal>
      )}
    </div>
  );
}
