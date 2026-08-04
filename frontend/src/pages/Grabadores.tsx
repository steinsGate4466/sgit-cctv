import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import Icono from '../components/Iconos';
import FiltroAmbito, { Ambito, AMBITO_VACIO, conAmbito } from '../components/FiltroAmbito';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';

/**
 * GRABADORES Y CANALES (bloques 6a y 6b).
 *
 * LA PREGUNTA QUE CONTESTA
 * Por radio llega "el canal 7 está negro". Hasta hoy, la respuesta era
 * preguntar a quien llevara más tiempo en planta. Esta pantalla es la tabla
 * de traducción: canal → cámara → dónde está → qué hacer.
 *
 * TRES COSAS, EN ESTE ORDEN
 *   1. El buscador de arriba: se escribe lo que dijeron por radio.
 *   2. La lista de grabadores, con sus huecos y sus problemas de carga.
 *   3. La rejilla: el dibujo del grabador tal cual, canal por canal.
 *
 * El buscador va PRIMERO a propósito. Es lo que se usa con prisa; lo demás
 * se usa sentado.
 */
export default function Grabadores() {
  const { can } = useAuth();
  const puedeEditar = can('asset.update');

  const [ambito, setAmbito] = useState<Ambito>(AMBITO_VACIO);
  const [lista, setLista] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');

  // Buscador "lo que dijo el púlpito"
  const [texto, setTexto] = useState('');
  const [hallados, setHallados] = useState<any[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  // Rejilla abierta
  const [abierto, setAbierto] = useState<any>(null);
  const [rejilla, setRejilla] = useState<any>(null);
  const [cargandoRejilla, setCargandoRejilla] = useState(false);

  // Alta de enlace
  const [enlazando, setEnlazando] = useState<{ canal: number | null } | null>(null);
  const [candidatas, setCandidatas] = useState<any[]>([]);
  const [busca, setBusca] = useState('');
  const [elegida, setElegida] = useState('');
  const [nombrePulpito, setNombrePulpito] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState('');

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/grabadores', { params: conAmbito({}, ambito) });
      setLista(r.data?.grabadores || []);
      setFallo('');
    } catch (e: any) {
      setFallo(
        e?.response?.status === 403
          ? 'Tu usuario no tiene permiso para ver los grabadores.'
          : 'No se pudo cargar la lista de grabadores. Vuelve a intentarlo.',
      );
    }
  }, [ambito]);

  useEffect(() => { setCargando(true); cargar().finally(() => setCargando(false)); }, [cargar]);

  async function buscar(e?: any) {
    e?.preventDefault?.();
    const q = texto.trim();
    if (!q) { setHallados(null); return; }
    setBuscando(true);
    try {
      const r = await api.get('/grabadores/traducir', { params: { q } });
      setHallados(r.data || []);
    } catch {
      setHallados([]);
    } finally {
      setBuscando(false);
    }
  }

  async function abrir(g: any) {
    setAbierto(g);
    setRejilla(null);
    setCargandoRejilla(true);
    try {
      const r = await api.get(`/grabadores/${g.id}/rejilla`);
      setRejilla(r.data);
    } catch {
      setRejilla({ error: true });
    } finally {
      setCargandoRejilla(false);
    }
  }

  async function pedirCandidatas(q: string) {
    if (!abierto) return;
    try {
      const r = await api.get(`/grabadores/${abierto.id}/candidatas`, { params: q ? { q } : {} });
      setCandidatas(r.data || []);
    } catch {
      setCandidatas([]);
    }
  }

  function abrirEnlace(canal: number | null) {
    setEnlazando({ canal });
    setElegida('');
    setNombrePulpito('');
    setBusca('');
    setErrorModal('');
    pedirCandidatas('');
  }

  async function guardarEnlace() {
    if (!abierto || !elegida) return;
    setGuardando(true);
    setErrorModal('');
    try {
      await api.post(`/grabadores/${abierto.id}/enlazar`, {
        assetId: elegida,
        canal: enlazando?.canal ?? null,
        nombreEnGrabador: nombrePulpito.trim() || null,
      });
      setEnlazando(null);
      await abrir(abierto);
      await cargar();
    } catch (e: any) {
      // El servidor manda mensajes escritos para que se entiendan
      // ("el canal 7 ya lo ocupa X"). Se enseñan tal cual: reemplazarlos por
      // "error al guardar" sería tirar la única pista útil.
      setErrorModal(e?.response?.data?.message || 'No se pudo enlazar. Revisa los datos.');
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(assetId: string, code: string) {
    if (!abierto) return;
    if (!confirm(`¿Sacar ${code} del grabador ${abierto.code}?\n\nLa cámara NO se borra: sólo deja de estar asignada a este grabador.`)) return;
    try {
      await api.delete(`/grabadores/${abierto.id}/camaras/${assetId}`);
      await abrir(abierto);
      await cargar();
    } catch {
      alert('No se pudo quitar. Vuelve a intentarlo.');
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <FiltroAmbito valor={ambito} onChange={setAmbito} />
      </div>

      {/* ---- 1. LO QUE DIJO EL PÚLPITO ---- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginTop: 0 }}>
          <Icono n="ojo" /> ¿Qué te dijeron por radio?
        </div>
        <form onSubmit={buscar} className="fila-busqueda">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder='Ej: "canal 7", "la de la grúa", "AA-CAM-T2-045"'
            aria-label="Buscar cámara por canal, nombre o código"
          />
          <button className="btn-primary" type="submit" disabled={buscando}>
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
          {hallados !== null && (
            <button type="button" className="btn-mini" onClick={() => { setHallados(null); setTexto(''); }}>
              Limpiar
            </button>
          )}
        </form>

        {hallados !== null && (
          hallados.length === 0 ? (
            <div className="vacio" style={{ padding: 14 }}>
              Nada coincide con «{texto}». Puede que esa cámara todavía no tenga
              registrado su canal ni su nombre del púlpito: eso se arregla abajo,
              abriendo su grabador.
            </div>
          ) : (
            <table className="tabla" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Canal</th><th>Nombre en el púlpito</th><th>Código</th>
                  <th>Grabador</th><th>Dónde está</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {hallados.map((c: any) => (
                  <tr key={c.assetId}>
                    <td><strong>{c.canal ?? '—'}</strong></td>
                    <td>{c.nombreEnGrabador || <span className="muted">sin nombre</span>}</td>
                    <td>{c.code}</td>
                    <td>{c.grabador || '—'}</td>
                    <td>{c.lugar || '—'}</td>
                    <td><span className={`chip est-${c.estado}`}>{c.estado}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* ---- 2. LOS GRABADORES ---- */}
      <div className="section-title">Grabadores</div>

      {fallo && <div className="card aviso-error">{fallo}</div>}
      {cargando && <EsqueletoTabla filas={4} />}

      {!cargando && !fallo && lista.length === 0 && (
        <div className="card vacio">
          <h3>No hay grabadores registrados</h3>
          <p>
            Esta pantalla dibuja los canales de cada NVR. Para que aparezca algo
            hace falta dar de alta los grabadores como activos de tipo <strong>NVR</strong>
            {' '}en la pantalla de Activos, y anotar en su ficha <strong>cuántos canales</strong> tienen.
          </p>
        </div>
      )}

      {!cargando && lista.length > 0 && (
        <div className="rejilla-tarjetas">
          {lista.map((g) => {
            const problemas = (g.sinCanal || 0) + (g.sinNombre || 0);
            return (
              <button key={g.id} className="tarjeta-grabador" onClick={() => abrir(g)}>
                <div className="tg-cabecera">
                  <strong>{g.code}</strong>
                  <span className={`chip est-${g.estado}`}>{g.estado}</span>
                </div>
                <div className="tg-sitio">{g.lugar || g.modelo || '—'}</div>
                <div className="tg-cifras">
                  <div><b>{g.conCanal}</b><span>en canal</span></div>
                  <div><b>{g.capacidad ?? '—'}</b><span>canales</span></div>
                  <div className={g.libres === 0 ? 'lleno' : ''}>
                    <b>{g.libres ?? '?'}</b><span>libres</span>
                  </div>
                </div>
                {g.capacidad == null && (
                  <div className="tg-aviso">Falta registrar cuántos canales tiene</div>
                )}
                {problemas > 0 && (
                  <div className="tg-aviso">
                    {g.sinCanal > 0 && `${g.sinCanal} sin canal`}
                    {g.sinCanal > 0 && g.sinNombre > 0 && ' · '}
                    {g.sinNombre > 0 && `${g.sinNombre} sin nombre`}
                  </div>
                )}
                {g.tren && <div className="tg-tren">{g.tren}{g.etapa ? ` · ${g.etapa}` : ''}</div>}
              </button>
            );
          })}
        </div>
      )}

      {/* ---- 3. LA REJILLA ---- */}
      {abierto && (
        <Modal
          title={`Canales de ${abierto.code}`}
          ancho
          onClose={() => { setAbierto(null); setRejilla(null); }}
          acciones={
            puedeEditar && rejilla && !rejilla.error ? (
              <button className="btn-primary" onClick={() => abrirEnlace(null)}>
                Añadir cámara sin canal
              </button>
            ) : null
          }
        >
          {cargandoRejilla && <EsqueletoTabla filas={3} />}
          {rejilla?.error && <div className="aviso-error">No se pudo cargar la rejilla.</div>}

          {rejilla && !rejilla.error && (
            <>
              {rejilla.problemas?.length > 0 && (
                <div className="lista-problemas">
                  {rejilla.problemas.map((p: any, i: number) => (
                    <div key={i} className="problema">
                      <Icono n="alerta" /> {p.texto}
                    </div>
                  ))}
                </div>
              )}

              {rejilla.total === 0 ? (
                <div className="vacio" style={{ padding: 18 }}>
                  <h4>Este grabador no tiene ni canales registrados ni cámaras</h4>
                  <p>
                    Anota en la ficha del activo cuántos canales tiene y aquí
                    aparecerá la rejilla para ir colocando las cámaras.
                  </p>
                </div>
              ) : (
                <div className="rejilla-canales">
                  {rejilla.celdas.map((c: any) => (
                    <div
                      key={c.canal}
                      className={`canal ${c.camara ? 'ocupado' : 'libre'} ${c.duplicado ? 'conflicto' : ''} ${c.camara ? `est-${c.camara.estado}` : ''}`}
                    >
                      <div className="canal-num">{c.canal}</div>
                      {c.camara ? (
                        <>
                          <div className="canal-nombre">
                            {c.camara.nombreEnGrabador || <em>sin nombre</em>}
                          </div>
                          <div className="canal-code">{c.camara.code}</div>
                          {puedeEditar && (
                            <button
                              className="canal-quitar"
                              title="Sacar del grabador"
                              onClick={() => quitar(c.camara.assetId, c.camara.code)}
                            >
                              ×
                            </button>
                          )}
                        </>
                      ) : (
                        puedeEditar ? (
                          <button className="canal-vacio" onClick={() => abrirEnlace(c.canal)}>
                            + poner cámara
                          </button>
                        ) : (
                          <div className="canal-nombre muted">libre</div>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}

              {rejilla.sinCanal?.length > 0 && (
                <>
                  <div className="section-title">Entran a este grabador pero sin canal</div>
                  <table className="tabla">
                    <tbody>
                      {rejilla.sinCanal.map((c: any) => (
                        <tr key={c.assetId}>
                          <td>{c.code}</td>
                          <td>{c.nombreEnGrabador || <span className="muted">sin nombre</span>}</td>
                          <td>{c.lugar || '—'}</td>
                          {puedeEditar && (
                            <td style={{ textAlign: 'right' }}>
                              <button className="btn-mini" onClick={() => quitar(c.assetId, c.code)}>
                                Quitar
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </Modal>
      )}

      {/* ---- ENLAZAR ---- */}
      {enlazando && (
        <Modal
          title={enlazando.canal ? `Poner cámara en el canal ${enlazando.canal}` : 'Añadir cámara sin canal'}
          onClose={() => setEnlazando(null)}
          acciones={
            <>
              <button className="btn-mini" onClick={() => setEnlazando(null)}>Cancelar</button>
              <button className="btn-primary" onClick={guardarEnlace} disabled={!elegida || guardando}>
                {guardando ? 'Guardando…' : 'Enlazar'}
              </button>
            </>
          }
        >
          {errorModal && <div className="aviso-error" style={{ marginBottom: 10 }}>{errorModal}</div>}

          <label className="campo">
            <span>Buscar la cámara</span>
            <input
              value={busca}
              onChange={(e) => { setBusca(e.target.value); pedirCandidatas(e.target.value); }}
              placeholder="Código, nombre o sitio"
            />
          </label>

          {candidatas.length === 0 ? (
            <div className="vacio" style={{ padding: 14 }}>
              No hay cámaras libres para este grabador. Sólo se ofrecen las que
              todavía no entran a ningún grabador y son del mismo tren.
            </div>
          ) : (
            <div className="lista-elegir">
              {candidatas.map((c) => (
                <label key={c.id} className={`fila-elegir ${elegida === c.id ? 'sel' : ''}`}>
                  <input
                    type="radio"
                    name="camara"
                    checked={elegida === c.id}
                    onChange={() => setElegida(c.id)}
                  />
                  <span><strong>{c.code}</strong> — {c.lugar || c.modelo || 'sin sitio'}</span>
                </label>
              ))}
            </div>
          )}

          <label className="campo">
            <span>Nombre que se ve en el púlpito</span>
            <input
              value={nombrePulpito}
              onChange={(e) => setNombrePulpito(e.target.value)}
              placeholder="Ej: GRUA 2 PATIO"
              maxLength={120}
            />
            <small className="muted">
              Es el nombre con el que el operador la llama por radio. Sin él, cada
              aviso hay que traducirlo preguntando.
            </small>
          </label>
        </Modal>
      )}
    </div>
  );
}
