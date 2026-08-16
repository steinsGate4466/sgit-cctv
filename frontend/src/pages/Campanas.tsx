import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import BotonPurgar from '../components/BotonPurgar';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';

/**
 * CAMPAÑAS DE MAPEO — el control de calidad del levantamiento.
 *
 * Contra un dato mal cargado ningún respaldo sirve: devuelve fielmente el
 * dato equivocado. Esta pantalla existe para que eso no entre.
 *
 * DOS COSAS QUE NO SE PUEDEN SALTAR, Y SE DICEN EN VOZ ALTA:
 *   · Quien revisa NO puede ser quien cargó.
 *   · Una zona con defectos bloqueantes NO se aprueba.
 *
 * Y el porcentaje de avance cuenta **sólo zonas aprobadas**. Contar las
 * "cargadas" sería la barra de progreso que esto existe para no ser: diría
 * 90 % con la mitad de las fichas mal.
 */

const ESTADO_ZONA: Record<string, string> = {
  PENDIENTE: 'Sin empezar', EN_CAMPO: 'En campo', CARGADA: 'Cargada, sin revisar',
  EN_REVISION: 'En revisión', APROBADA: 'Aprobada', DEVUELTA: 'Devuelta para corregir',
};
const ESTADO_CAMPANA: Record<string, string> = {
  PLANIFICADA: 'Planificada', EN_CURSO: 'En curso', EN_REVISION: 'En revisión',
  CERRADA: 'Cerrada', CANCELADA: 'Cancelada',
};

export default function Campanas() {
  const { can, user } = useAuth();
  const puedeGestionar = can('asset.update');

  const [lista, setLista] = useState<any[]>([]);
  const [abierta, setAbierta] = useState<any>(null);
  const [ubicaciones, setUbicaciones] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [nueva, setNueva] = useState<any>(null);
  const [repartir, setRepartir] = useState<any>(null);
  const [revision, setRevision] = useState<any>(null);
  const [obs, setObs] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const l = await api.get('/campanas').then((r) => r.data).catch(() => []);
    setLista(l || []);
  }, []);

  useEffect(() => {
    setCargando(true);
    cargar().finally(() => setCargando(false));
    api.get('/locations').then((r) => setUbicaciones(r.data?.items || r.data || [])).catch(() => setUbicaciones([]));
    api.get('/users').then((r) => setUsuarios(r.data || [])).catch(() => setUsuarios([]));
  }, [cargar]);

  async function abrir(id: string) {
    try { setAbierta(await api.get(`/campanas/${id}/avance`).then((r) => r.data)); setError(''); }
    catch { setError('No se pudo abrir la campaña.'); }
  }

  async function crear() {
    setOcupado(true); setError('');
    try {
      const r = await api.post('/campanas', nueva);
      setMsg(`Campaña ${r.data.codigo} creada. Ahora reparte las zonas.`);
      setNueva(null); await cargar();
    } catch (e: any) { setError(e?.response?.data?.message || 'No se pudo crear.'); }
    finally { setOcupado(false); }
  }

  async function guardarReparto() {
    setOcupado(true); setError('');
    try {
      await api.post(`/campanas/${repartir.campanaId}/zonas`, {
        zonas: repartir.filas.filter((f: any) => f.locationId).map((f: any) => ({
          locationId: f.locationId,
          asignadoAId: f.asignadoAId || undefined,
          esperados: f.esperados ? Number(f.esperados) : undefined,
          notas: f.notas || undefined,
        })),
      });
      setMsg('Zonas repartidas.');
      setRepartir(null);
      await abrir(repartir.campanaId); await cargar();
    } catch (e: any) { setError(e?.response?.data?.message || 'No se pudo repartir.'); }
    finally { setOcupado(false); }
  }

  async function verRevision(zonaId: string) {
    setObs(''); setError('');
    try { setRevision(await api.get(`/campanas/zona/${zonaId}`).then((r) => r.data)); }
    catch (e: any) { setError(e?.response?.data?.message || 'No se pudo revisar.'); }
  }

  async function decidir(aprobar: boolean) {
    setOcupado(true); setError('');
    try {
      await api.patch(`/campanas/zona/${revision.zona.id}/decidir`, { aprobar, observaciones: obs });
      setMsg(aprobar ? 'Zona aprobada.' : 'Zona devuelta con las observaciones.');
      setRevision(null);
      if (abierta) await abrir(abierta.campana.id);
    } catch (e: any) { setError(e?.response?.data?.message || 'No se pudo decidir.'); }
    finally { setOcupado(false); }
  }

  async function marcarCargada(zonaId: string) {
    try {
      await api.patch(`/campanas/zona/${zonaId}/cargada`, {});
      setMsg('Zona marcada como cargada. Ahora tiene que revisarla otra persona.');
      if (abierta) await abrir(abierta.campana.id);
    } catch (e: any) { setError(e?.response?.data?.message || 'No se pudo marcar.'); }
  }

  return (
    <div className="page">
      <div className="card explica">
        <b>Aquí se controla que el mapeo entre bien.</b> Contra un dato mal cargado
        ningún respaldo sirve: el respaldo devuelve fielmente el dato equivocado.
        <div style={{ marginTop: 8 }}>
          <b>Dos reglas que no se pueden saltar:</b> quien revisa <b>no puede ser</b> quien
          cargó, y una zona con defectos que impiden usar los equipos <b>no se aprueba</b>.
        </div>
        <div style={{ marginTop: 8 }}>
          El porcentaje cuenta <b>sólo las zonas aprobadas</b>. Contar las cargadas
          diría 90 % con la mitad de las fichas mal.
        </div>
      </div>

      {msg && <div className="aviso-ok" onClick={() => setMsg('')}>{msg}</div>}
      {error && <div className="aviso-error" onClick={() => setError('')}>{error}</div>}

      <div className="filters">
        {puedeGestionar && (
          <button className="btn-primary" onClick={() => {
            setError('');
            setNueva({ nombre: '', tren: '', descripcion: '', inicioPrevisto: '', finPrevisto: '' });
          }}>+ Nueva campaña</button>
        )}
      </div>

      {cargando ? <EsqueletoTabla filas={3} /> : lista.length === 0 ? (
        <div className="card vacio">
          <h3>No hay campañas de mapeo</h3>
          <p>
            Una campaña es un levantamiento repartido por zonas: «estas 300 cámaras
            del Tren 2 hay que darlas de alta». Se reparte, se carga en campo, y
            <b> otra persona revisa</b> antes de darla por buena.
          </p>
        </div>
      ) : (
        <table className="tabla">
          <thead><tr><th>Código</th><th>Nombre</th><th>Tren</th><th>Estado</th>
            <th className="num">Zonas</th><th className="num">Activos</th><th></th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.codigo}</strong></td>
                <td>{c.nombre}</td>
                <td>{c.tren || <span className="muted">—</span>}</td>
                <td><span className={'badge ' + c.estado}>{ESTADO_CAMPANA[c.estado]}</span></td>
                <td className="num">{c._count.zonas}</td>
                <td className="num">{c._count.activos}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn-mini" onClick={() => abrir(c.id)}>Abrir</button>
                  <BotonPurgar recurso="campana" id={c.id} onBorrado={() => cargar()} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ---------- AVANCE DE UNA CAMPAÑA ---------- */}
      {abierta && (
        <Modal title={`${abierta.campana.codigo} · ${abierta.campana.nombre}`} onClose={() => setAbierta(null)} ancho
          acciones={puedeGestionar ? (
            <button className="btn-primary" onClick={() => {
              setError('');
              setRepartir({ campanaId: abierta.campana.id, filas: [{ locationId: '', asignadoAId: '', esperados: '', notas: '' }] });
            }}>+ Repartir zonas</button>
          ) : undefined}>

          <div className="card" style={{ marginTop: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--navy)' }}>{abierta.pctAprobado}%</div>
              <div>
                <b>aprobado</b>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {abierta.porEstado.APROBADA ?? 0} de {abierta.total} zonas revisadas y dadas por buenas.
                  Las cargadas sin revisar <b>no cuentan</b>.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {Object.entries(abierta.porEstado).map(([e, n]) => (
                <span key={e} className="chip est-MANTENIMIENTO">{ESTADO_ZONA[e] ?? e}: {n as number}</span>
              ))}
            </div>
          </div>

          {abierta.zonas.length === 0 ? (
            <div className="card vacio"><h3>Sin zonas repartidas</h3>
              <p>Reparte las zonas para que cada técnico sepa qué le toca.</p></div>
          ) : (
            <table className="tabla">
              <thead><tr><th>Zona</th><th>Estado</th><th className="num">Esperados</th>
                <th>Cargada</th><th>Revisada</th><th></th></tr></thead>
              <tbody>
                {abierta.zonas.map((z: any) => (
                  <tr key={z.id}>
                    <td>
                      <strong>{z.ubicacion?.name || z.ubicacion?.code}</strong>
                      <div className="muted" style={{ fontSize: 11.5 }}>{z.ubicacion?.path}</div>
                      {z.observaciones && (
                        <div style={{ fontSize: 12, color: '#8c1414', marginTop: 4 }}>↩ {z.observaciones}</div>
                      )}
                    </td>
                    <td><span className={'badge ' + z.estado}>{ESTADO_ZONA[z.estado]}</span></td>
                    <td className="num">{z.esperados ?? <span className="muted">sin fijar</span>}</td>
                    <td className="muted">{z.cargadaEn ? new Date(z.cargadaEn).toLocaleDateString('es-PE') : '—'}</td>
                    <td className="muted">{z.revisadaEn ? new Date(z.revisadaEn).toLocaleDateString('es-PE') : '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn-mini" onClick={() => verRevision(z.id)}>Revisar</button>
                      {can('asset.create') && !['APROBADA', 'CARGADA'].includes(z.estado) && (
                        <button className="btn-mini" style={{ marginLeft: 4 }}
                          onClick={() => marcarCargada(z.id)}>Terminé</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {/* ---------- LA REVISIÓN ---------- */}
      {revision && (
        <Modal title={`Revisar ${revision.zona.ubicacion?.name || 'zona'}`} onClose={() => setRevision(null)} ancho
          acciones={
            <>
              <button className="btn-mini" onClick={() => setRevision(null)}>Cerrar</button>
              <button className="btn-mini btn-danger" onClick={() => decidir(false)}
                disabled={ocupado || obs.trim().length < 5}>Devolver para corregir</button>
              <button className="btn-primary" onClick={() => decidir(true)}
                disabled={ocupado || !revision.sePuedeAprobar}>Aprobar la zona</button>
            </>
          }>
          {error && <div className="aviso-error">{error}</div>}

          {revision.zona.cargadaPorId === user?.id && (
            <div className="card peligro">
              <b>Esta zona la cargaste tú.</b> No la puedes revisar: quien acaba de
              cargar 40 fichas ya las da por buenas en su cabeza, y ese es justo el
              motivo por el que existe la revisión. Que la mire otra persona.
            </div>
          )}

          <div className="card" style={{ marginTop: 0 }}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <div><b style={{ fontSize: 26 }}>{revision.total}</b><div className="muted" style={{ fontSize: 12 }}>cargados</div></div>
              <div><b style={{ fontSize: 26, color: 'var(--ok)' }}>{revision.limpios}</b><div className="muted" style={{ fontSize: 12 }}>sin nada que corregir</div></div>
              <div><b style={{ fontSize: 26, color: 'var(--crit)' }}>{revision.conBloqueantes}</b><div className="muted" style={{ fontSize: 12 }}>no se pueden usar así</div></div>
              <div><b style={{ fontSize: 26, color: 'var(--warn)' }}>{revision.conAvisos}</b><div className="muted" style={{ fontSize: 12 }}>con detalles menores</div></div>
              {revision.faltan != null && revision.faltan > 0 && (
                <div><b style={{ fontSize: 26 }}>{revision.faltan}</b><div className="muted" style={{ fontSize: 12 }}>faltan por cargar</div></div>
              )}
            </div>
          </div>

          {!revision.sePuedeAprobar && (
            <div className="card peligro">{revision.motivoSiNo}</div>
          )}

          {revision.activos.length > 0 && (
            <table className="tabla">
              <thead><tr><th>Activo</th><th>Tipo</th><th>Qué le pasa</th></tr></thead>
              <tbody>
                {[...revision.activos].sort((a: any, b: any) => b.bloqueantes - a.bloqueantes).map((a: any) => (
                  <tr key={a.id}>
                    <td><strong>{a.assetCode}</strong></td>
                    <td>{a.tipo}</td>
                    <td>
                      {a.ok ? <span className="chip ok">Correcto</span> : (
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.6 }}>
                          {a.defectos.map((d: any, k: number) => (
                            <li key={k} style={{ color: d.gravedad === 'BLOQUEANTE' ? '#8c1414' : 'inherit' }}>
                              {d.gravedad === 'BLOQUEANTE' && <b>[impide usarlo] </b>}{d.texto}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <label className="campo" style={{ marginTop: 14 }}>
            <span>Observaciones para quien lo cargó</span>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)}
              placeholder="Faltan las fotos de las 4 cámaras del lecho y AA-CAM-T2-014 está repetida." />
            <small className="muted">
              Obligatorio al devolver. Decir sólo «está mal» hace que la siguiente
              zona venga peor.
            </small>
          </label>
        </Modal>
      )}

      {/* ---------- NUEVA CAMPAÑA ---------- */}
      {nueva && (
        <Modal title="Nueva campaña de mapeo" onClose={() => setNueva(null)} ancho
          acciones={<>
            <button className="btn-mini" onClick={() => setNueva(null)}>Cancelar</button>
            <button className="btn-primary" onClick={crear} disabled={ocupado || nueva.nombre.trim().length < 3}>
              {ocupado ? 'Creando…' : 'Crear'}
            </button>
          </>}>
          {error && <div className="aviso-error">{error}</div>}
          <div className="form-grid">
            <label className="campo campo-ancho">
              <span>Nombre <b className="campo-req">*</b></span>
              <input value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
                placeholder="Levantamiento CCTV Tren 2 — agosto 2026" />
            </label>
            <label className="campo">
              <span>Tren</span>
              <select value={nueva.tren} onChange={(e) => setNueva({ ...nueva, tren: e.target.value })}>
                <option value="">Todos</option>
                {['T1', 'T2', 'T3'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Inicio previsto</span>
              <input type="date" value={nueva.inicioPrevisto}
                onChange={(e) => setNueva({ ...nueva, inicioPrevisto: e.target.value })} />
            </label>
            <label className="campo campo-ancho">
              <span>Descripción</span>
              <textarea value={nueva.descripcion} onChange={(e) => setNueva({ ...nueva, descripcion: e.target.value })} />
            </label>
          </div>
        </Modal>
      )}

      {/* ---------- REPARTIR ---------- */}
      {repartir && (
        <Modal title="Repartir zonas" onClose={() => setRepartir(null)} ancho
          acciones={<>
            <button className="btn-mini" onClick={() => setRepartir(null)}>Cancelar</button>
            <button className="btn-mini" onClick={() => setRepartir({
              ...repartir, filas: [...repartir.filas, { locationId: '', asignadoAId: '', esperados: '', notas: '' }],
            })}>+ Otra zona</button>
            <button className="btn-primary" onClick={guardarReparto} disabled={ocupado}>
              {ocupado ? 'Guardando…' : 'Repartir'}
            </button>
          </>}>
          {error && <div className="aviso-error">{error}</div>}
          <div className="card explica" style={{ marginTop: 0 }}>
            <b>«Cuántos esperas» puede quedar vacío.</b> Si no lo sabes, no pongas un
            número: se daría por bueno y «faltan 3» sería una alarma falsa para siempre.
          </div>
          {/* Bloque 40: se usa la ubicación elegida como clave y el índice
              sólo mientras la fila está en blanco. Con el índice a secas,
              quitar una fila del medio dejaba el texto escrito en la de
              debajo — el usuario borra una zona y ve cómo otra cambia sola. */}
          {repartir.filas.map((f: any, i: number) => (
            <div key={f.locationId || `vacia-${i}`} className="form-grid" style={{ borderTop: i ? '1px solid var(--border)' : 'none', paddingTop: i ? 12 : 0 }}>
              <label className="campo campo-ancho">
                <span>Zona</span>
                <select value={f.locationId} onChange={(e) => {
                  const filas = [...repartir.filas]; filas[i] = { ...f, locationId: e.target.value };
                  setRepartir({ ...repartir, filas });
                }}>
                  <option value="">Elegir ubicación…</option>
                  {ubicaciones.map((u: any) => <option key={u.id} value={u.id}>{u.path || u.name}</option>)}
                </select>
              </label>
              <label className="campo">
                <span>Quién la levanta</span>
                <select value={f.asignadoAId} onChange={(e) => {
                  const filas = [...repartir.filas]; filas[i] = { ...f, asignadoAId: e.target.value };
                  setRepartir({ ...repartir, filas });
                }}>
                  <option value="">Sin asignar</option>
                  {usuarios.map((u: any) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              </label>
              <label className="campo">
                <span>Cuántos esperas</span>
                <input type="number" min={0} value={f.esperados} onChange={(e) => {
                  const filas = [...repartir.filas]; filas[i] = { ...f, esperados: e.target.value };
                  setRepartir({ ...repartir, filas });
                }} placeholder="Déjalo vacío si no lo sabes" />
              </label>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
