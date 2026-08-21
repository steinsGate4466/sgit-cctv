import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import BotonPurgar from '../components/BotonPurgar';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';
import { useDialogos } from '../components/Dialogos';

/**
 * VENTANAS DE PARADA
 *
 * Producción avisa —por radio, por WhatsApp, de boca— y **la hora se mueve**,
 * muchas veces a última hora. Esta pantalla está hecha para eso:
 *
 *  · Apuntar la parada en treinta segundos, desde el celular, con lo mínimo.
 *  · Moverla las veces que haga falta, **con el motivo obligatorio**.
 *  · Ver, al final del mes, cuántas veces se movió y cuánto se desvió.
 *
 * Ese último punto es el que convierte «siempre nos mueven la parada» en un
 * número que se puede llevar a una reunión.
 */

const ESTADO_ES: Record<string, string> = {
  ANUNCIADA: 'Anunciada', CONFIRMADA: 'Confirmada', EN_CURSO: 'En curso',
  TERMINADA: 'Terminada', CANCELADA: 'Cancelada',
};
const ORIGEN_ES: Record<string, string> = {
  PRODUCCION: 'Producción', MANTENIMIENTO: 'Mantenimiento',
  FALLA: 'Falla', PROGRAMADA: 'Programada',
};
const CANALES = ['Radio', 'WhatsApp', 'Teléfono', 'De boca', 'Correo', 'Reunión'];

const fh = (v: any) => v ? new Date(v).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const paraInput = (v: any) => v ? new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

/** Minutos a "2 h 30 min", que es como lo dice la gente. */
function dur(min: number | null | undefined) {
  if (min == null) return '—';
  const s = min < 0 ? '−' : '';
  const m = Math.abs(min);
  const h = Math.floor(m / 60);
  return h ? `${s}${h} h ${m % 60} min` : `${s}${m} min`;
}

export default function Paradas() {
  const { pedirTexto } = useDialogos();
  const { can } = useAuth();
  const puede = can('wo.update');

  const [lista, setLista] = useState<any[]>([]);
  const [fiab, setFiab] = useState<any>(null);
  const [proximas, setProximas] = useState<any[]>([]);
  const [fTren, setFTren] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [nueva, setNueva] = useState<any>(null);
  const [detalle, setDetalle] = useState<any>(null);
  const [mover, setMover] = useState<any>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async (tren: string, estado: string) => {
    const [l, f, p] = await Promise.all([
      api.get('/paradas', { params: { tren: tren || undefined, estado: estado || undefined } })
        .then((r) => r.data).catch(() => []),
      api.get('/paradas/fiabilidad').then((r) => r.data).catch(() => null),
      // ESTO YA SE CALCULABA Y NO SE ENSEÑABA: el endpoint existía desde el
      // bloque 16 y ninguna vista lo llamaba. Es lo primero que mira el
      // ingeniero por la mañana, y estaba enterrado entre las 200 de la
      // tabla de abajo.
      api.get('/paradas/proximas', { params: { tren: tren || undefined } })
        .then((r) => r.data).catch(() => []),
    ]);
    setLista(l || []);
    setFiab(f);
    setProximas(p || []);
  }, []);

  useEffect(() => {
    setCargando(true);
    cargar(fTren, fEstado).finally(() => setCargando(false));
  }, [fTren, fEstado, cargar]);

  async function abrirDetalle(id: string) {
    try { setDetalle(await api.get(`/paradas/${id}`).then((r) => r.data)); }
    catch { setError('No se pudo abrir la parada.'); }
  }

  async function crear() {
    setGuardando(true); setError('');
    try {
      await api.post('/paradas', {
        tren: nueva.tren,
        inicioPrevisto: new Date(nueva.inicioPrevisto).toISOString(),
        finPrevisto: nueva.finPrevisto ? new Date(nueva.finPrevisto).toISOString() : undefined,
        origen: nueva.origen,
        motivo: nueva.motivo || undefined,
        avisadoPor: nueva.avisadoPor || undefined,
        canalAviso: nueva.canalAviso || undefined,
        notas: nueva.notas || undefined,
      });
      setMsg('Parada apuntada.');
      setNueva(null);
      await cargar(fTren, fEstado);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo apuntar.');
    } finally { setGuardando(false); }
  }

  async function confirmarMover() {
    setGuardando(true); setError('');
    try {
      const r = await api.patch(`/paradas/${mover.id}/mover`, {
        inicioPrevisto: mover.inicioPrevisto ? new Date(mover.inicioPrevisto).toISOString() : undefined,
        finPrevisto: mover.finPrevisto ? new Date(mover.finPrevisto).toISOString() : undefined,
        motivo: mover.motivo,
      });
      setMsg(`Parada movida. Van ${r.data.vecesMovida} cambio(s).`);
      setMover(null);
      if (detalle) await abrirDetalle(detalle.id);
      await cargar(fTren, fEstado);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo mover.');
    } finally { setGuardando(false); }
  }

  async function cambiarEstado(p: any, estado: string) {
    let motivo: string | undefined;
    if (estado === 'CANCELADA') {
      motivo = await pedirTexto('¿Por qué se cancela? La gente ya se había movilizado.') || '';
      if (!motivo.trim()) return;
    }
    try {
      await api.patch(`/paradas/${p.id}/estado`, { estado, motivo });
      setMsg(`Parada marcada como ${ESTADO_ES[estado]}.`);
      if (detalle) await abrirDetalle(p.id);
      await cargar(fTren, fEstado);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo cambiar el estado.');
    }
  }

  return (
    <div className="page">
      <div className="card explica">
        <b>Las paradas las avisa Producción, y la hora se mueve.</b> Esta pantalla está
        hecha para eso: apuntarla en treinta segundos y moverla las veces que haga falta.
        <div style={{ marginTop: 8 }}>
          <b>Al mover hay que decir por qué.</b> Cuesta cinco segundos, y es lo que
          convierte «siempre nos mueven la parada» en «se movió 14 veces este mes,
          9 por cambio de programa». Lo primero es una queja; lo segundo va a una reunión.
        </div>
      </div>

      {msg && <div role="status" className="aviso-ok aviso-cerrable" onClick={() => setMsg('')} title="Toca para cerrar este aviso">{msg}</div>}
      {error && <div role="alert" className="aviso-error aviso-cerrable" onClick={() => setError('')} title="Toca para cerrar este aviso">{error}</div>}

      {/* LO QUE VIENE. Va arriba del todo porque es la pregunta de la mañana:
          «¿cuándo puedo tocar la línea?» */}
      {proximas.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>Lo que viene</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
            {proximas.map((p) => {
              const faltan = Math.round((new Date(p.inicioPrevisto).getTime() - Date.now()) / 3600000);
              return (
                <div key={p.id} className="card" style={{ margin: 0, padding: 12, cursor: 'pointer' }}
                  onClick={() => abrirDetalle(p.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <b style={{ fontSize: 17, color: 'var(--navy)' }}>{p.tren}</b>
                    <span className={'badge ' + p.estado}>{ESTADO_ES[p.estado]}</span>
                  </div>
                  <div style={{ fontSize: 14, marginTop: 4 }}>{fh(p.inicioPrevisto)}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                    {p.estado === 'EN_CURSO' ? 'en curso ahora'
                      : faltan < 0 ? 'debería haber empezado'
                      : faltan < 24 ? `en ${faltan} h`
                      : `en ${Math.round(faltan / 24)} días`}
                    {p.duracionPrevistaMin ? ` · dura ${dur(p.duracionPrevistaMin)}` : ''}
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 6 }}>
                    {p.ordenes > 0
                      ? <><b>{p.ordenes}</b> orden(es) colgada(s)</>
                      : <span className="muted">sin trabajo colgado todavía</span>}
                    {p.vecesMovida > 0 && (
                      <span className="chip est-MANTENIMIENTO" style={{ marginLeft: 6 }}>
                        movida {p.vecesMovida}×
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            Las que están anunciadas, confirmadas o en curso. Si una no tiene trabajo
            colgado, es una ventana que se va a desaprovechar.
          </div>
        </div>
      )}

      {/* El número para la reunión. */}
      {fiab && fiab.trenes.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>Cómo se han portado las paradas (90 días)</div>
          <table className="tabla">
            <thead>
              <tr><th>Tren</th><th className="num">Paradas</th><th className="num">Movidas</th>
                <th className="num">Cambios por parada</th><th className="num">Desvío medio</th>
                <th className="num">Canceladas</th><th className="num">OM colgadas</th></tr>
            </thead>
            <tbody>
              {fiab.trenes.map((t: any) => (
                <tr key={t.tren}>
                  <td><strong>{t.tren}</strong></td>
                  <td className="num">{t.total}</td>
                  <td className="num">{t.pctMovidas}%</td>
                  <td className="num">{t.movimientosPorParada || '—'}</td>
                  <td className="num" title="Positivo = duró más de lo prometido">
                    {t.desviacionMediaMin == null ? <span className="muted">sin datos</span> : dur(t.desviacionMediaMin)}
                  </td>
                  <td className="num">{t.canceladas}</td>
                  <td className="num">{t.ordenesColgadas}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            El desvío medio sale de comparar lo que Producción anunció con lo que pasó de verdad.
            Sólo cuenta las paradas que se cerraron con hora real.
          </div>
        </div>
      )}

      <div className="filters">
        <div>
          <label>Tren</label>
          <select value={fTren} onChange={(e) => setFTren(e.target.value)}>
            <option value="">Todos</option>
            {['T1', 'T2', 'T3'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label>Estado</label>
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ESTADO_ES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {puede && (
          <button className="btn-primary" onClick={() => {
            setError('');
            setNueva({ tren: 'T1', origen: 'PRODUCCION', inicioPrevisto: paraInput(new Date()), finPrevisto: '', motivo: '', avisadoPor: '', canalAviso: 'Radio', notas: '' });
          }}>+ Apuntar parada</button>
        )}
      </div>

      {cargando ? <EsqueletoTabla filas={5} /> : lista.length === 0 ? (
        <div className="card vacio">
          <h3>No hay paradas apuntadas</h3>
          <p>
            En cuanto Producción avise de una, apúntala aquí aunque sea con la hora
            aproximada. Se puede mover después: para eso está.
          </p>
        </div>
      ) : (
        <table className="tabla">
          <thead>
            <tr><th>Tren</th><th>Prevista</th><th>Real</th><th>Duró</th><th>Desvío</th>
              <th>Estado</th><th>Origen</th><th className="num">Movida</th><th className="num">OM</th><th></th></tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.tren}</strong></td>
                <td>{fh(p.inicioPrevisto)}</td>
                <td>{fh(p.inicioReal)}</td>
                <td>{dur(p.duracionRealMin ?? p.duracionPrevistaMin)}</td>
                <td className={p.desviacionMin != null && p.desviacionMin > 0 ? '' : 'muted'}>
                  {p.desviacionMin == null ? '—' : dur(p.desviacionMin)}
                </td>
                <td><span className={'badge ' + p.estado}>{ESTADO_ES[p.estado]}</span></td>
                <td className="muted">{ORIGEN_ES[p.origen]}</td>
                <td className="num">{p.vecesMovida > 0
                  ? <span className="chip est-MANTENIMIENTO">{p.vecesMovida}×</span>
                  : <span className="muted">—</span>}</td>
                <td className="num">{p.ordenes || <span className="muted">—</span>}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn-mini" onClick={() => abrirDetalle(p.id)}>Ver</button>
                  {/* Borrado definitivo. Solo lo pinta si eres Jefe de Mantenimiento. */}
                  <BotonPurgar recurso="parada" id={p.id}
                    onBorrado={() => { setMsg('Parada borrada.'); cargar(fTren, fEstado); }} />
                  {puede && p.estado !== 'TERMINADA' && p.estado !== 'CANCELADA' && (
                    <button className="btn-mini" style={{ marginLeft: 4 }}
                      onClick={() => { setError(''); setMover({ id: p.id, inicioPrevisto: paraInput(p.inicioPrevisto), finPrevisto: paraInput(p.finPrevisto), motivo: '' }); }}>
                      Mover
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ---------- APUNTAR ---------- */}
      {nueva && (
        <Modal title="Apuntar una parada" onClose={() => setNueva(null)} ancho
          acciones={<>
            <button className="btn-mini" onClick={() => setNueva(null)}>Cancelar</button>
            <button className="btn-primary" onClick={crear} disabled={guardando || !nueva.inicioPrevisto}>
              {guardando ? 'Guardando…' : 'Apuntar'}
            </button>
          </>}>
          {error && <div role="alert" className="aviso-error">{error}</div>}
          <div className="card explica" style={{ marginTop: 0 }}>
            Apúntala con lo que sepas ahora. <b>La hora se puede mover después</b>,
            y cada movimiento queda registrado. Es mejor una parada apuntada con hora
            aproximada que una parada que sólo está en la cabeza de alguien.
          </div>
          <div className="form-grid">
            <label className="campo">
              <span>Tren <b className="campo-req">*</b></span>
              <select value={nueva.tren} onChange={(e) => setNueva({ ...nueva, tren: e.target.value })}>
                {['T1', 'T2', 'T3'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>¿Quién la pide?</span>
              <select value={nueva.origen} onChange={(e) => setNueva({ ...nueva, origen: e.target.value })}>
                {Object.entries(ORIGEN_ES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Inicio previsto <b className="campo-req">*</b></span>
              <input type="datetime-local" value={nueva.inicioPrevisto}
                onChange={(e) => setNueva({ ...nueva, inicioPrevisto: e.target.value })} />
              <small className="muted">Se acepta una hora ya pasada: muchas veces uno se entera cuando ya empezó.</small>
            </label>
            <label className="campo">
              <span>Fin previsto</span>
              <input type="datetime-local" value={nueva.finPrevisto}
                onChange={(e) => setNueva({ ...nueva, finPrevisto: e.target.value })} />
            </label>
            <label className="campo">
              <span>¿Quién avisó?</span>
              <input value={nueva.avisadoPor} onChange={(e) => setNueva({ ...nueva, avisadoPor: e.target.value })}
                placeholder="Nombre o puesto" />
            </label>
            <label className="campo">
              <span>¿Por dónde avisó?</span>
              <select value={nueva.canalAviso} onChange={(e) => setNueva({ ...nueva, canalAviso: e.target.value })}>
                {CANALES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <small className="muted">Dejarlo escrito es lo que convierte un recado en un dato.</small>
            </label>
            <label className="campo campo-ancho">
              <span>Motivo de la parada</span>
              <input value={nueva.motivo} onChange={(e) => setNueva({ ...nueva, motivo: e.target.value })}
                placeholder="Cambio de canal, cambio de producto, mantenimiento mecánico…" />
            </label>
            <label className="campo campo-ancho">
              <span>Notas</span>
              <textarea value={nueva.notas} onChange={(e) => setNueva({ ...nueva, notas: e.target.value })} />
            </label>
          </div>
        </Modal>
      )}

      {/* ---------- MOVER ---------- */}
      {mover && (
        <Modal title="Mover la parada" onClose={() => setMover(null)}
          acciones={<>
            <button className="btn-mini" onClick={() => setMover(null)}>Cancelar</button>
            <button className="btn-primary" onClick={confirmarMover}
              disabled={guardando || (mover.motivo || '').trim().length < 3}>
              {guardando ? 'Guardando…' : 'Mover'}
            </button>
          </>}>
          {error && <div role="alert" className="aviso-error">{error}</div>}
          <label className="campo">
            <span>Nuevo inicio previsto</span>
            <input type="datetime-local" value={mover.inicioPrevisto}
              onChange={(e) => setMover({ ...mover, inicioPrevisto: e.target.value })} />
          </label>
          <label className="campo">
            <span>Nuevo fin previsto</span>
            <input type="datetime-local" value={mover.finPrevisto}
              onChange={(e) => setMover({ ...mover, finPrevisto: e.target.value })} />
          </label>
          <label className="campo">
            <span>¿Por qué se mueve? <b className="campo-req">*</b></span>
            <input value={mover.motivo} onChange={(e) => setMover({ ...mover, motivo: e.target.value })}
              placeholder="Se alargó la colada, cambio de programa, falta el repuesto…" />
            <small className="muted">
              Obligatorio. Sin el motivo, a fin de mes no se puede demostrar por qué
              el trabajo no se hizo.
            </small>
          </label>
        </Modal>
      )}

      {/* ---------- DETALLE ---------- */}
      {detalle && (
        <Modal title={`Parada ${detalle.tren} · ${fh(detalle.inicioPrevisto)}`} onClose={() => setDetalle(null)} ancho
          acciones={puede ? <>
            {detalle.estado === 'ANUNCIADA' && <button className="btn-mini" onClick={() => cambiarEstado(detalle, 'CONFIRMADA')}>Confirmar</button>}
            {['ANUNCIADA', 'CONFIRMADA'].includes(detalle.estado) && <button className="btn-mini" onClick={() => cambiarEstado(detalle, 'EN_CURSO')}>Empezó</button>}
            {detalle.estado === 'EN_CURSO' && <button className="btn-primary" onClick={() => cambiarEstado(detalle, 'TERMINADA')}>Terminó</button>}
            {!['TERMINADA', 'CANCELADA'].includes(detalle.estado) && <button className="btn-mini btn-danger" onClick={() => cambiarEstado(detalle, 'CANCELADA')}>Cancelar parada</button>}
          </> : undefined}>
          <div className="form-grid">
            <div><b>Estado</b><div>{ESTADO_ES[detalle.estado]}</div></div>
            <div><b>Origen</b><div>{ORIGEN_ES[detalle.origen]}</div></div>
            <div><b>Prevista</b><div>{fh(detalle.inicioPrevisto)} → {fh(detalle.finPrevisto)}</div></div>
            <div><b>Real</b><div>{fh(detalle.inicioReal)} → {fh(detalle.finReal)}</div></div>
            <div><b>Duró</b><div>{dur(detalle.duracionRealMin)} <span className="muted">(prevista {dur(detalle.duracionPrevistaMin)})</span></div></div>
            <div><b>Arrancó desviada</b><div>{dur(detalle.arranqueDesviadoMin)}</div></div>
            <div><b>Avisó</b><div>{detalle.avisadoPor || '—'} {detalle.canalAviso ? `· ${detalle.canalAviso}` : ''}</div></div>
            <div><b>Motivo</b><div>{detalle.motivo || '—'}</div></div>
          </div>

          {detalle.ordenes?.length > 0 && (
            <>
              <div className="section-title">Trabajo colgado de esta ventana</div>
              <table className="tabla">
                <thead><tr><th>OM</th><th>Tipo</th><th>Equipo</th><th>Estado</th><th className="num">Avance</th></tr></thead>
                <tbody>
                  {detalle.ordenes.map((o: any) => (
                    <tr key={o.id}>
                      <td><strong>{o.code}</strong></td>
                      <td>{o.type}</td>
                      <td>{o.asset?.assetCode || <span className="muted">—</span>}</td>
                      <td>{o.status}</td>
                      <td className="num">{o.progressPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="section-title">Historial de movimientos ({detalle.cambios?.length || 0})</div>
          {!detalle.cambios?.length ? (
            <p className="muted" style={{ fontSize: 13 }}>Esta parada no se ha movido.</p>
          ) : (
            <table className="tabla">
              <thead><tr><th>Cuándo</th><th>Qué</th><th>De</th><th>A</th><th>Por qué</th></tr></thead>
              <tbody>
                {detalle.cambios.map((c: any) => (
                  <tr key={c.id}>
                    <td className="muted">{fh(c.en)}</td>
                    <td>{c.campo}</td>
                    <td className="muted">{fh(c.valorAntes)}</td>
                    <td>{fh(c.valorDespues)}</td>
                    <td>{c.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}
