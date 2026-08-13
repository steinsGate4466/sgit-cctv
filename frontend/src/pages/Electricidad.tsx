import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import BotonPurgar from '../components/BotonPurgar';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';

/**
 * ELECTRICIDAD — tableros, circuitos y qué cuelga de cada llave.
 *
 * La pregunta que esta pantalla existe para contestar, y que hoy nadie puede:
 *
 *     «Saltó el térmico 12 del MCC del T2. ¿Qué se apagó?»
 *     «¿Qué llave le corta la luz a ESTA cámara?»
 *
 * La segunda es la que ahorra tiempo de verdad: el técnico sube al manlift y,
 * si no sabe qué breaker bajar, o trabaja con tensión —que no se hace— o baja
 * a preguntar.
 */

const TIPO_TABLERO: Record<string, string> = {
  MCC: 'MCC (centro de motores)', DISTRIBUCION: 'Distribución', CONTROL: 'Control',
  ILUMINACION: 'Iluminación', UPS: 'UPS', TRANSFORMADOR: 'Transformador', OTRO: 'Otro',
};
const PROTECCION: Record<string, string> = {
  TERMOMAGNETICO: 'Termomagnético', DIFERENCIAL: 'Diferencial', FUSIBLE: 'Fusible',
  GUARDAMOTOR: 'Guardamotor', SECCIONADOR: 'Seccionador', OTRO: 'Otro',
};
const ESTADO_CIRC: Record<string, string> = {
  ACTIVO: 'Activo', FUERA_SERVICIO: 'Fuera de servicio', RESERVA: 'Reserva', DESCONOCIDO: 'Sin comprobar',
};

export default function Electricidad() {
  const { can } = useAuth();
  const puedeEditar = can('asset.update');

  const [tableros, setTableros] = useState<any[]>([]);
  const [resumen, setResumen] = useState<any>(null);
  const [texto, setTexto] = useState('');
  const [fTren, setFTren] = useState('');
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [detalle, setDetalle] = useState<any>(null);
  const [nuevoTablero, setNuevoTablero] = useState<any>(null);
  const [nuevoCircuito, setNuevoCircuito] = useState<any>(null);
  const [colgando, setColgando] = useState<any>(null);
  const [impacto, setImpacto] = useState<any>(null);
  const [midiendo, setMidiendo] = useState<any>(null);
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [ubicaciones, setUbicaciones] = useState<any[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async (t: string, tren: string) => {
    const [l, r] = await Promise.all([
      api.get('/electricidad/tableros', { params: { texto: t || undefined, tren: tren || undefined } })
        .then((x) => x.data).catch(() => []),
      api.get('/electricidad/resumen').then((x) => x.data).catch(() => null),
    ]);
    setTableros(l || []); setResumen(r);
  }, []);

  useEffect(() => {
    setCargando(true);
    const id = setTimeout(() => { cargar(texto, fTren).finally(() => setCargando(false)); }, 300);
    return () => clearTimeout(id);
  }, [texto, fTren, cargar]);

  useEffect(() => {
    api.get('/locations').then((r) => setUbicaciones(r.data?.items || r.data || [])).catch(() => setUbicaciones([]));
  }, []);

  async function abrir(id: string) {
    try { setDetalle(await api.get(`/electricidad/tableros/${id}`).then((r) => r.data)); setError(''); }
    catch { setError('No se pudo abrir el tablero.'); }
  }

  async function guardarTablero() {
    setOcupado(true); setError('');
    try {
      await api.post('/electricidad/tableros', nuevoTablero);
      setMsg('Tablero registrado. Ahora declara sus circuitos.');
      setNuevoTablero(null); await cargar(texto, fTren);
    } catch (e: any) { setError(e?.response?.data?.message || 'No se pudo guardar.'); }
    finally { setOcupado(false); }
  }

  async function guardarCircuito() {
    setOcupado(true); setError('');
    try {
      await api.post(`/electricidad/tableros/${nuevoCircuito.tableroId}/circuitos`, nuevoCircuito);
      setMsg('Circuito declarado.');
      setNuevoCircuito(null); await abrir(detalle.id);
    } catch (e: any) { setError(e?.response?.data?.message || 'No se pudo guardar.'); }
    finally { setOcupado(false); }
  }

  async function buscarActivos(q: string) {
    if (q.trim().length < 2) { setCandidatos([]); return; }
    const r = await api.get('/assets', { params: { q, pageSize: 20 } }).then((x) => x.data).catch(() => null);
    setCandidatos(r?.items || r?.data || []);
  }

  async function colgar(assetId: string, viaPoe: boolean) {
    setOcupado(true); setError('');
    try {
      await api.post(`/electricidad/circuitos/${colgando.circuitoId}/activos`, { assetId, viaPoe });
      setMsg('Equipo colgado del circuito.');
      setColgando(null); setCandidatos([]); await abrir(detalle.id);
    } catch (e: any) { setError(e?.response?.data?.message || 'No se pudo colgar.'); }
    finally { setOcupado(false); }
  }

  /* HUECO QUE ESTABA ABIERTO: el tablero de arriba enseña los puntos
     calientes de termografía... y no había forma de cargarlos. El endpoint
     existía desde el bloque 18 y ninguna pantalla lo llamaba. Un indicador
     que nadie puede alimentar es un indicador que siempre dice cero, y a la
     tercera vez que alguien lo mira vacío deja de mirarlo. */
  async function guardarMedicion() {
    setOcupado(true); setError('');
    try {
      await api.post('/electricidad/mediciones', {
        circuitoId: midiendo.circuitoId || undefined,
        tableroId: midiendo.circuitoId ? undefined : midiendo.tableroId,
        tensionV: midiendo.tensionV || undefined,
        corrienteA: midiendo.corrienteA || undefined,
        temperaturaC: midiendo.temperaturaC || undefined,
        observacion: midiendo.observacion || undefined,
      });
      const t = Number(midiendo.temperaturaC);
      setMsg(t >= 60
        ? `Medición guardada. ${t} °C está por encima del umbral: sale como punto caliente.`
        : 'Medición guardada.');
      setMidiendo(null);
      await cargar(texto, fTren);
      if (detalle) await abrir(detalle.id);
    } catch (e: any) { setError(e?.response?.data?.message || 'No se pudo guardar.'); }
    finally { setOcupado(false); }
  }

  async function verImpacto(circuitoId: string) {
    try { setImpacto(await api.get(`/electricidad/circuitos/${circuitoId}/impacto`).then((r) => r.data)); }
    catch (e: any) { setError(e?.response?.data?.message || 'No se pudo calcular.'); }
  }

  async function descolgar(enlaceId: string) {
    if (!confirm('¿Quitar este equipo del circuito?\n\nNo borra el equipo: sólo deja de decir que cuelga de esta llave.')) return;
    try {
      await api.delete(`/electricidad/activos/${enlaceId}`);
      setMsg('Quitado.'); await abrir(detalle.id);
    } catch (e: any) { setError(e?.response?.data?.message || 'No se pudo quitar.'); }
  }

  return (
    <div className="page">
      <div className="card explica">
        <b>La causa número uno de «se cayeron ocho cámaras de golpe» no es la red: es que saltó una llave.</b>
        <div style={{ marginTop: 8 }}>
          Aquí se declara qué tableros hay, qué circuitos tiene cada uno y —lo que
          de verdad importa— <b>qué equipo cuelga de qué llave</b>. Con eso el sistema
          contesta «si salta este térmico, se apagan estas 14 cámaras» y, al revés,
          «para tocar esta cámara hay que bajar esta llave».
        </div>
        <div style={{ marginTop: 8 }}>
          <b>Ojo con las cámaras PoE:</b> no cuelgan del breaker, cuelgan del switch,
          que sí. Por eso se marca aparte — si no, alguien va a bajar la llave
          equivocada creyendo que corta la cámara.
        </div>
      </div>

      {msg && <div className="aviso-ok" onClick={() => setMsg('')}>{msg}</div>}
      {error && <div className="aviso-error" onClick={() => setError('')}>{error}</div>}

      {resumen && (
        <div className="card">
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <div><b style={{ fontSize: 26 }}>{resumen.tableros}</b><div className="muted" style={{ fontSize: 12 }}>tableros</div></div>
            <div><b style={{ fontSize: 26 }}>{resumen.circuitos}</b><div className="muted" style={{ fontSize: 12 }}>circuitos</div></div>
            <div><b style={{ fontSize: 26, color: 'var(--steel)' }}>{resumen.circuitosCctv}</b><div className="muted" style={{ fontSize: 12 }}>alimentan CCTV</div></div>
            <div>
              <b style={{ fontSize: 26, color: resumen.sinAlimentacionDeclarada ? 'var(--crit)' : 'var(--ok)' }}>
                {resumen.sinAlimentacionDeclarada}
              </b>
              <div className="muted" style={{ fontSize: 12 }}>equipos sin saber de qué llave cuelgan</div>
            </div>
          </div>
          {resumen.sinAlimentacionDeclarada > 0 && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
              Cada uno de esos es un equipo que, cuando falle por electricidad, va a
              costar horas encontrar. Es la lista de trabajo.
            </div>
          )}
          {resumen.puntosCalientes?.length > 0 && (
            <div className="card peligro" style={{ marginTop: 12 }}>
              <b>Puntos calientes en termografía (≥ 60 °C):</b>
              <ul style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.7 }}>
                {resumen.puntosCalientes.map((p: any) => (
                  <li key={p.id}>
                    <b>{p.temperaturaC} °C</b> — {p.donde}
                    {p.observacion ? ` · ${p.observacion}` : ''}
                    <span className="muted"> ({new Date(p.fecha).toLocaleDateString('es-PE')})</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 6, fontSize: 12.5 }}>
                Un borne caliente es una avería con fecha, no un riesgo. Se aprieta o se cambia.
              </div>
            </div>
          )}
        </div>
      )}

      <div className="filters">
        <div><label>Buscar</label>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, nombre o referencia…" style={{ minWidth: 220 }} /></div>
        <div><label>Tren</label>
          <select value={fTren} onChange={(e) => setFTren(e.target.value)}>
            <option value="">Todos</option>
            {['T1', 'T2', 'T3'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select></div>
        {can('asset.create') && (
          <button className="btn-primary" onClick={() => {
            setError('');
            setNuevoTablero({ codigo: '', nombre: '', tipo: 'DISTRIBUCION', tren: '', locationId: '', referencia: '', comoLlegar: '', tensionV: '', fases: '', riesgos: '', requierePermiso: true });
          }}>+ Registrar tablero</button>
        )}
      </div>

      {cargando ? <EsqueletoTabla filas={4} /> : tableros.length === 0 ? (
        <div className="card vacio">
          <h3>No hay tableros registrados</h3>
          <p>
            Empieza por los que alimentan CCTV: el MCC de cada tren y los tableros de
            distribución de las salas eléctricas. Con cinco tableros bien declarados
            ya se contesta la mitad de las caídas.
          </p>
        </div>
      ) : (
        <table className="tabla">
          <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Dónde</th>
            <th className="num">Circuitos</th><th></th></tr></thead>
          <tbody>
            {tableros.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.codigo}</strong>{t.tren && <span className="muted"> · {t.tren}</span>}</td>
                <td>{t.nombre}
                  {t.referencia && <div className="muted" style={{ fontSize: 11.5 }}>{t.referencia}</div>}</td>
                <td>{TIPO_TABLERO[t.tipo] || t.tipo}</td>
                <td className="muted" style={{ fontSize: 12 }}>{t.location?.name || '—'}</td>
                <td className="num">{t._count.circuitos}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn-mini" onClick={() => abrir(t.id)}>Abrir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ---------- DETALLE DEL TABLERO ---------- */}
      {detalle && (
        <Modal title={`${detalle.codigo} · ${detalle.nombre}`} onClose={() => setDetalle(null)} ancho
          acciones={puedeEditar ? (
            <>
              <button className="btn-mini" onClick={() => {
                setError('');
                setMidiendo({ circuitoId: '', numero: '', tableroId: detalle.id, tensionV: '', corrienteA: '', temperaturaC: '', observacion: '' });
              }}>Medir el tablero</button>
              <button className="btn-primary" onClick={() => {
                setError('');
                setNuevoCircuito({ tableroId: detalle.id, numero: '', designacion: '', proteccion: 'TERMOMAGNETICO', amperajeA: '', polos: '', estado: 'ACTIVO', esCctv: false });
              }}>+ Declarar circuito</button>
            </>
          ) : undefined}>

          {detalle.requierePermiso && (
            <div className="card peligro" style={{ marginTop: 0 }}>
              <b>Este tablero se abre con permiso eléctrico y bloqueo (LOTO).</b>
              {detalle.riesgos ? <div style={{ marginTop: 4 }}>{detalle.riesgos}</div> : null}
            </div>
          )}

          <div className="form-grid">
            <div><b style={{ fontSize: 12 }}>Tipo</b><div>{TIPO_TABLERO[detalle.tipo]}</div></div>
            <div><b style={{ fontSize: 12 }}>Tensión</b><div>{detalle.tensionV ? `${detalle.tensionV} V` : '—'}{detalle.fases ? ` · ${detalle.fases}F` : ''}</div></div>
            <div><b style={{ fontSize: 12 }}>Dónde</b><div>{detalle.location?.name || '—'}</div></div>
            <div><b style={{ fontSize: 12 }}>Alimentado de</b><div>{detalle.alimentadoDe?.codigo || <span className="muted">no declarado</span>}</div></div>
            <div><b style={{ fontSize: 12 }}>Equipos CCTV colgados</b><div><b>{detalle.equiposCctv}</b></div></div>
          </div>

          {detalle.comoLlegar && <>
            <div className="section-title">Cómo se llega</div>
            <p style={{ fontSize: 13.5, marginTop: 0 }}>{detalle.comoLlegar}</p>
          </>}

          {/* Lo que está atornillado DENTRO. Distinto de lo que alimenta:
              eso puede estar a cien metros. */}
          {detalle.mediciones?.length > 0 && (
            <>
              <div className="section-title">Últimas mediciones</div>
              <table className="tabla">
                <thead><tr><th>Fecha</th><th>Dónde</th><th className="num">Tensión</th>
                  <th className="num">Corriente</th><th className="num">Temperatura</th><th>Observación</th></tr></thead>
                <tbody>
                  {detalle.mediciones.map((m: any) => (
                    <tr key={m.id}>
                      <td className="muted">{new Date(m.fecha).toLocaleDateString('es-PE')}</td>
                      <td>{m.circuitoId
                        ? (detalle.circuitos.find((c: any) => c.id === m.circuitoId)?.numero
                            ? `circuito ${detalle.circuitos.find((c: any) => c.id === m.circuitoId).numero}`
                            : 'circuito')
                        : 'el tablero'}</td>
                      <td className="num">{m.tensionV != null ? `${m.tensionV} V` : '—'}</td>
                      <td className="num">{m.corrienteA != null ? `${m.corrienteA} A` : '—'}</td>
                      <td className="num" style={{ color: m.temperaturaC >= 60 ? 'var(--crit)' : undefined, fontWeight: m.temperaturaC >= 60 ? 700 : 400 }}>
                        {m.temperaturaC != null ? `${m.temperaturaC} °C` : '—'}
                      </td>
                      <td className="muted" style={{ fontSize: 12.5 }}>{m.observacion || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="section-title">Equipos montados dentro del tablero</div>
          {(!detalle.equiposMontados || detalle.equiposMontados.length === 0) ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Ninguno declarado. Si hay un switch pequeño atornillado aquí dentro,
              regístralo en Activos y elige este tablero en «…o dentro de un tablero
              eléctrico». No hace falta inventar un gabinete.
            </p>
          ) : (
            <table className="tabla">
              <thead><tr><th>Equipo</th><th>Tipo</th><th>Marca / modelo</th><th>Estado</th></tr></thead>
              <tbody>
                {detalle.equiposMontados.map((a: any) => (
                  <tr key={a.id}>
                    <td><strong>{a.assetCode}</strong></td>
                    <td>{a.type}</td>
                    <td className="muted">{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</td>
                    <td><span className={'badge ' + a.status}>{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="section-title">Circuitos</div>
          {detalle.circuitos.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Todavía no hay circuitos. Declara los que estén rotulados en la puerta,
              con el mismo número que tienen ahí.
            </p>
          ) : (
            <table className="tabla">
              <thead><tr><th>N°</th><th>Qué alimenta</th><th>Protección</th><th>Estado</th>
                <th>Equipos</th><th></th></tr></thead>
              <tbody>
                {detalle.circuitos.map((c: any) => (
                  <tr key={c.id}>
                    <td><strong>{c.numero}</strong>{c.esCctv && <span className="chip info" style={{ marginLeft: 4 }}>CCTV</span>}</td>
                    <td>{c.designacion || <span className="muted">sin rotular</span>}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {PROTECCION[c.proteccion]}{c.amperajeA ? ` ${c.amperajeA}A` : ''}{c.polos ? ` ${c.polos}P` : ''}
                    </td>
                    <td>{ESTADO_CIRC[c.estado]}</td>
                    <td>
                      {c.alimenta.length === 0 ? <span className="muted">—</span> : (
                        <ul style={{ margin: 0, paddingLeft: 14, fontSize: 12.5 }}>
                          {c.alimenta.map((a: any) => (
                            <li key={a.id}>
                              {a.asset.assetCode}
                              {a.viaPoe && <span className="muted"> (por PoE)</span>}
                              {puedeEditar && (
                                <button className="btn-mini" style={{ marginLeft: 6, padding: '2px 6px' }}
                                  onClick={() => descolgar(a.id)}>✕</button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn-mini" onClick={() => verImpacto(c.id)}>¿Qué se apaga?</button>
                      {puedeEditar && (
                        <button className="btn-mini" style={{ marginLeft: 4 }} title="Termografía y medidas"
                          onClick={() => { setError(''); setMidiendo({ circuitoId: c.id, numero: c.numero, tableroId: detalle.id, tensionV: '', corrienteA: '', temperaturaC: '', observacion: '' }); }}>
                          Medir
                        </button>
                      )}
                      {puedeEditar && (
                        <button className="btn-mini" style={{ marginLeft: 4 }}
                          onClick={() => { setColgando({ circuitoId: c.id, numero: c.numero, q: '' }); setCandidatos([]); }}>
                          + Equipo
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {/* ---------- IMPACTO ---------- */}
      {impacto && (
        <Modal title={`Si salta el circuito ${impacto.circuito.numero}`} onClose={() => setImpacto(null)}>
          <div className="card peligro" style={{ marginTop: 0 }}>
            <b style={{ fontSize: 18 }}>Se apagan {impacto.total} equipo(s)</b>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              {impacto.circuito.tablero.codigo} · {PROTECCION[impacto.circuito.proteccion]}
              {impacto.circuito.amperajeA ? ` ${impacto.circuito.amperajeA}A` : ''}
            </div>
          </div>
          {impacto.aviso && <div className="card explica">{impacto.aviso}</div>}

          <div className="section-title">Directamente</div>
          {impacto.directos.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>Nada declarado.</p> : (
            <ul style={{ fontSize: 13, lineHeight: 1.8 }}>
              {impacto.directos.map((d: any) => (
                <li key={d.id}><b>{d.assetCode}</b> <span className="muted">({d.tipo}{d.viaPoe ? ', por PoE' : ''})</span></li>
              ))}
            </ul>
          )}

          {impacto.indirectos.length > 0 && <>
            <div className="section-title">Y además, por colgar de un switch que se queda sin luz</div>
            <ul style={{ fontSize: 13, lineHeight: 1.8 }}>
              {impacto.indirectos.map((d: any) => (
                <li key={d.id}><b>{d.assetCode}</b> <span className="muted">({d.tipo})</span></li>
              ))}
            </ul>
          </>}
        </Modal>
      )}

      {/* ---------- COLGAR UN EQUIPO ---------- */}
      {colgando && (
        <Modal title={`Colgar un equipo del circuito ${colgando.numero}`} onClose={() => { setColgando(null); setCandidatos([]); }}>
          {error && <div className="aviso-error">{error}</div>}
          <div className="card explica" style={{ marginTop: 0 }}>
            Si es una <b>cámara PoE</b>, no marques que cuelga del breaker directamente:
            cuelga del switch. Marca «por PoE» para que quede claro y nadie baje la
            llave equivocada.
          </div>
          <label className="campo">
            <span>Buscar equipo</span>
            <input value={colgando.q} autoComplete="off"
              onChange={(e) => { setColgando({ ...colgando, q: e.target.value }); buscarActivos(e.target.value); }}
              placeholder="Código del activo…" />
          </label>
          {candidatos.length > 0 && (
            <ul className="lista-elegir">
              {candidatos.map((a: any) => (
                <li key={a.id}>
                  <b>{a.assetCode}</b> <span className="muted">{a.type}</span>
                  <span style={{ float: 'right' }}>
                    <button className="btn-mini" disabled={ocupado} onClick={() => colgar(a.id, false)}>Directo</button>
                    <button className="btn-mini" style={{ marginLeft: 4 }} disabled={ocupado}
                      onClick={() => colgar(a.id, true)}>Por PoE</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {/* ---------- MEDICIÓN / TERMOGRAFÍA ---------- */}
      {midiendo && (
        <Modal
          title={midiendo.circuitoId ? `Medir el circuito ${midiendo.numero}` : 'Medir el tablero'}
          onClose={() => setMidiendo(null)}
          acciones={<>
            <button className="btn-mini" onClick={() => setMidiendo(null)}>Cancelar</button>
            <button className="btn-primary" onClick={guardarMedicion}
              disabled={ocupado || (!midiendo.tensionV && !midiendo.corrienteA && !midiendo.temperaturaC)}>
              {ocupado ? 'Guardando…' : 'Guardar medición'}
            </button>
          </>}>
          {error && <div className="aviso-error">{error}</div>}
          <div className="card explica" style={{ marginTop: 0 }}>
            <b>La temperatura es la que más avisa.</b> Un borne por encima de 60 °C no
            es un riesgo: es una avería con fecha. Se aprieta o se cambia antes de que
            se abra el circuito solo, casi siempre de madrugada.
            <div style={{ marginTop: 6 }}>
              Basta con rellenar uno de los tres. No hay que medirlo todo cada vez.
            </div>
          </div>
          <div className="form-grid">
            <label className="campo"><span>Tensión (V)</span>
              <input type="number" step="any" value={midiendo.tensionV}
                onChange={(e) => setMidiendo({ ...midiendo, tensionV: e.target.value })} /></label>
            <label className="campo"><span>Corriente (A)</span>
              <input type="number" step="any" value={midiendo.corrienteA}
                onChange={(e) => setMidiendo({ ...midiendo, corrienteA: e.target.value })} /></label>
            <label className="campo"><span>Temperatura (°C)</span>
              <input type="number" step="any" value={midiendo.temperaturaC}
                onChange={(e) => setMidiendo({ ...midiendo, temperaturaC: e.target.value })}
                placeholder="Del termógrafo" />
              <small className="muted">Desde 60 °C sale marcado como punto caliente.</small></label>
            <label className="campo campo-ancho"><span>Observación</span>
              <textarea value={midiendo.observacion}
                onChange={(e) => setMidiendo({ ...midiendo, observacion: e.target.value })}
                placeholder="Borne del polo R más caliente que los otros dos." /></label>
          </div>
        </Modal>
      )}

      {/* ---------- NUEVO TABLERO ---------- */}
      {nuevoTablero && (
        <Modal title="Registrar tablero eléctrico" onClose={() => setNuevoTablero(null)} ancho
          acciones={<>
            <button className="btn-mini" onClick={() => setNuevoTablero(null)}>Cancelar</button>
            <button className="btn-primary" onClick={guardarTablero}
              disabled={ocupado || nuevoTablero.codigo.trim().length < 3}>
              {ocupado ? 'Guardando…' : 'Guardar'}
            </button>
          </>}>
          {error && <div className="aviso-error">{error}</div>}
          <div className="form-grid">
            <label className="campo">
              <span>Código <b className="campo-req">*</b></span>
              <input value={nuevoTablero.codigo} autoComplete="off"
                onChange={(e) => setNuevoTablero({ ...nuevoTablero, codigo: e.target.value.toUpperCase() })}
                placeholder="TAB-T2-MCC-01" />
              <small className="muted">El que está rotulado en el tablero, si lo tiene.</small>
            </label>
            <label className="campo">
              <span>Nombre</span>
              <input value={nuevoTablero.nombre} onChange={(e) => setNuevoTablero({ ...nuevoTablero, nombre: e.target.value })}
                placeholder="MCC sala eléctrica Tren 2" />
            </label>
            <label className="campo">
              <span>Tipo</span>
              <select value={nuevoTablero.tipo} onChange={(e) => setNuevoTablero({ ...nuevoTablero, tipo: e.target.value })}>
                {Object.entries(TIPO_TABLERO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Tren</span>
              <select value={nuevoTablero.tren} onChange={(e) => setNuevoTablero({ ...nuevoTablero, tren: e.target.value })}>
                <option value="">No aplica</option>
                {['T1', 'T2', 'T3'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="campo campo-ancho">
              <span>Ubicación</span>
              <select value={nuevoTablero.locationId} onChange={(e) => setNuevoTablero({ ...nuevoTablero, locationId: e.target.value })}>
                <option value="">Sin especificar</option>
                {ubicaciones.map((u: any) => <option key={u.id} value={u.id}>{u.path || u.name}</option>)}
              </select>
            </label>
            <label className="campo"><span>Tensión (V)</span>
              <input type="number" value={nuevoTablero.tensionV}
                onChange={(e) => setNuevoTablero({ ...nuevoTablero, tensionV: e.target.value })} placeholder="440" /></label>
            <label className="campo"><span>Fases</span>
              <input type="number" min={1} max={3} value={nuevoTablero.fases}
                onChange={(e) => setNuevoTablero({ ...nuevoTablero, fases: e.target.value })} /></label>
            <label className="campo campo-ancho"><span>Dónde está exactamente</span>
              <input value={nuevoTablero.referencia}
                onChange={(e) => setNuevoTablero({ ...nuevoTablero, referencia: e.target.value })}
                placeholder="Sala eléctrica T2, pared norte, tercer tablero" /></label>
            <label className="campo campo-ancho"><span>Cómo se llega</span>
              <textarea value={nuevoTablero.comoLlegar}
                onChange={(e) => setNuevoTablero({ ...nuevoTablero, comoLlegar: e.target.value })} /></label>
            <label className="campo campo-ancho"><span>Riesgos</span>
              <textarea value={nuevoTablero.riesgos}
                onChange={(e) => setNuevoTablero({ ...nuevoTablero, riesgos: e.target.value })}
                placeholder="Barras energizadas al abrir. Riesgo de arco." /></label>
          </div>
        </Modal>
      )}

      {/* ---------- NUEVO CIRCUITO ---------- */}
      {nuevoCircuito && (
        <Modal title="Declarar circuito" onClose={() => setNuevoCircuito(null)} ancho
          acciones={<>
            <button className="btn-mini" onClick={() => setNuevoCircuito(null)}>Cancelar</button>
            <button className="btn-primary" onClick={guardarCircuito}
              disabled={ocupado || !nuevoCircuito.numero.trim()}>
              {ocupado ? 'Guardando…' : 'Guardar'}
            </button>
          </>}>
          {error && <div className="aviso-error">{error}</div>}
          <div className="form-grid">
            <label className="campo">
              <span>Número <b className="campo-req">*</b></span>
              <input value={nuevoCircuito.numero} autoComplete="off"
                onChange={(e) => setNuevoCircuito({ ...nuevoCircuito, numero: e.target.value })}
                placeholder="12" />
              <small className="muted">El MISMO que está rotulado en la puerta del tablero.</small>
            </label>
            <label className="campo campo-ancho">
              <span>Qué alimenta, según el rótulo</span>
              <input value={nuevoCircuito.designacion}
                onChange={(e) => setNuevoCircuito({ ...nuevoCircuito, designacion: e.target.value })}
                placeholder="Tomacorrientes sala CCTV" />
            </label>
            <label className="campo">
              <span>Protección</span>
              <select value={nuevoCircuito.proteccion}
                onChange={(e) => setNuevoCircuito({ ...nuevoCircuito, proteccion: e.target.value })}>
                {Object.entries(PROTECCION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="campo"><span>Amperaje (A)</span>
              <input type="number" step="any" value={nuevoCircuito.amperajeA}
                onChange={(e) => setNuevoCircuito({ ...nuevoCircuito, amperajeA: e.target.value })} /></label>
            <label className="campo"><span>Polos</span>
              <input type="number" min={1} max={4} value={nuevoCircuito.polos}
                onChange={(e) => setNuevoCircuito({ ...nuevoCircuito, polos: e.target.value })} /></label>
            <label className="campo">
              <span>Estado</span>
              <select value={nuevoCircuito.estado}
                onChange={(e) => setNuevoCircuito({ ...nuevoCircuito, estado: e.target.value })}>
                {Object.entries(ESTADO_CIRC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
