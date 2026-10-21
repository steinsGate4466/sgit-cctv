import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import BotonPurgar from '../components/BotonPurgar';
import MenuDeBorrado from '../components/MenuDeBorrado';
import { EsqueletoTabla } from '../components/Esqueleto';
import ElegirConClics from '../components/ElegirConClics';
import { ComoSeCalcula } from '../components/Patron';
import { useAuth } from '../auth/AuthContext';
import { fecha, paraInput } from '../fechas';
import BotonConMotivo from '../components/BotonConMotivo';
import { mensajeDeError, queFalta } from '../avisos';
import { OpcionesDeTrenDePlanta, OpcionesDeUbicacion, nombreDeTrenDePlanta, siglaDeTrenDePlanta } from '../ubicaciones';
import AvisoDeRecorte, { Recorte, recorteDe } from '../components/AvisoDeRecorte';
import { plural } from '../formato';

/**
 * CAMPAÑAS — bloque 175: de cualquier tipo, y planificables.
 *
 * Antes eran sólo de mapeo. El usuario: «que se pueda crear campaña de
 * instalación, campaña de rotulado… a libre albedrío, pero que se pueda
 * planificar correctamente». El TIPO es libre (se elige con un clic entre los
 * ya usados o se escribe uno nuevo); lo que la hace planificable es lo mismo
 * para todas: cada zona con QUIÉN, DESDE, HASTA y CUÁNTO.
 *
 * LO QUE NO CAMBIA, Y SE DICE:
 *   · Quien revisa NO puede ser quien cargó (o quien hizo el trabajo).
 *   · El avance cuenta sólo zonas APROBADAS: lo «dicho» no cuenta.
 *   · En MAPEO, una zona con fichas defectuosas no se aprueba, y lo hecho son
 *     los equipos cargados (se cuenta solo, no se escribe).
 */

const ESTADO_ZONA: Record<string, string> = {
  PENDIENTE: 'Sin empezar', EN_CAMPO: 'En campo', CARGADA: 'Terminada, sin revisar',
  EN_REVISION: 'En revisión', APROBADA: 'Aprobada', DEVUELTA: 'Devuelta para corregir',
};
const ESTADO_CAMPANA: Record<string, string> = {
  PLANIFICADA: 'Planificada', EN_CURSO: 'En curso', EN_REVISION: 'En revisión',
  CERRADA: 'Cerrada', CANCELADA: 'Cancelada',
};
const PLAN: Record<string, { texto: string; clase: string }> = {
  TERMINADA: { texto: 'Hecha', clase: 'chip ok' },
  ATRASADA: { texto: 'Atrasada', clase: 'chip crit' },
  EN_PLAZO: { texto: 'En plazo', clase: 'chip plan-en-plazo' },
  POR_EMPEZAR: { texto: 'Por empezar', clase: 'chip sindatos' },
  SIN_PLAN: { texto: 'Sin fechas', clase: 'chip sindatos' },
};
/* Los ejemplos que dio el usuario. Se ofrecen junto a los ya usados; no son
   datos de planta, son nombres de trabajo. */
const TIPOS_DE_ARRANQUE = ['Mapeo', 'Instalación', 'Rotulado'];
const UNIDADES = ['equipos', 'cámaras', 'rótulos', 'gabinetes', 'metros', 'puntos'];

const cerrada = (estado?: string) => estado === 'CERRADA' || estado === 'CANCELADA';

/** La barra del plan de una zona dentro del tramo de toda la campaña. */
function BarraDelPlan({ z, rango }: { z: any; rango: { desde: string; hasta: string } | null }) {
  if (!rango || !z.inicioPrevisto || !z.finPrevisto) return null;
  const a = new Date(rango.desde).getTime();
  const b = Math.max(new Date(rango.hasta).getTime(), a + 86_400_000);
  const pos = (t: number) => Math.min(100, Math.max(0, ((t - a) / (b - a)) * 100));
  const ini = pos(new Date(z.inicioPrevisto).getTime());
  const fin = pos(new Date(z.finPrevisto).getTime() + 86_400_000 / 2);
  const hoy = Date.now();
  return (
    <div className="plan-linea" title={`${fecha(z.inicioPrevisto)} → ${fecha(z.finPrevisto)}`}>
      <div className={'plan-tramo ' + z.plan} style={{ left: `${ini}%`, width: `${Math.max(2, fin - ini)}%` }} />
      {hoy >= a && hoy <= b && <div className="plan-hoy" style={{ left: `${pos(hoy)}%` }} />}
    </div>
  );
}

export default function Campanas() {
  const { can, user } = useAuth();
  const puedeGestionar = can('asset.update');
  const puedeTrabajar = can('asset.create') || can('wo.update');

  const [lista, setLista] = useState<any[]>([]);
  const [tipos, setTipos] = useState<{ tipo: string; n: number }[]>([]);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [abierta, setAbierta] = useState<any>(null);
  const [ubicaciones, setUbicaciones] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [ficha, setFicha] = useState<any>(null);      // nueva o editar campaña
  const [repartir, setRepartir] = useState<any>(null);
  const [planZona, setPlanZona] = useState<any>(null);
  const [avanceZona, setAvanceZona] = useState<any>(null);
  const [cambioEstado, setCambioEstado] = useState<any>(null);
  const [revision, setRevision] = useState<any>(null);
  const [obs, setObs] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [recorte, setRecorte] = useState<Recorte | null>(null);

  const cargar = useCallback(async (tipo: string) => {
    const l = await api.get('/campanas', { params: tipo ? { tipo } : {} })
      .then((r) => { setRecorte(recorteDe(r)); return r.data; }).catch(() => []);
    setLista(l || []);
    const t = await api.get('/campanas/tipos').then((r) => r.data).catch(() => []);
    setTipos(t || []);
  }, []);

  /* Bloque 115: guardia contra respuestas que llegan tarde al cambiar de filtro. */
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    cargar(filtroTipo).finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [cargar, filtroTipo]);

  useEffect(() => {
    let vivo = true;
    api.get('/locations')
      .then((r) => { if (vivo) setUbicaciones(r.data?.items || r.data || []); })
      .catch(() => { if (vivo) setUbicaciones([]); });
    api.get('/users/ejecutores') // bloque 172: a quién se le reparte una zona
      .then((r) => { if (vivo) setUsuarios(r.data || []); })
      .catch(() => { if (vivo) setUsuarios([]); });
    return () => { vivo = false; };
  }, []);

  const opcionesDeTipo = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const t of [...tipos.map((x) => x.tipo), ...TIPOS_DE_ARRANQUE]) {
      const k = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (!vistos.has(k)) vistos.set(k, t);
    }
    return [...vistos.values()].map((t) => ({ valor: t, texto: t }));
  }, [tipos]);

  async function recargarAbierta(id?: string) {
    const cid = id ?? abierta?.campana?.id;
    if (!cid) return;
    setAbierta(await api.get(`/campanas/${cid}/avance`).then((r) => r.data));
  }

  async function abrir(id: string) {
    try { await recargarAbierta(id); setError(''); }
    catch (e: any) { setError(mensajeDeError(e, 'abrir la campaña')); }
  }

  async function guardarFicha() {
    setOcupado(true); setError('');
    try {
      const { id, ...cuerpo } = ficha;
      if (id) {
        await api.patch(`/campanas/${id}`, cuerpo);
        setMsg('Plan de la campaña guardado.');
        await recargarAbierta(id);
      } else {
        const r = await api.post('/campanas', cuerpo);
        setMsg(`Campaña ${r.data.codigo} creada. Ahora reparte las zonas.`);
        await recargarAbierta(r.data.id);
      }
      setFicha(null); await cargar(filtroTipo);
    } catch (e: any) { setError(mensajeDeError(e, 'guardar la campaña')); }
    finally { setOcupado(false); }
  }

  async function guardarEstado() {
    setOcupado(true); setError('');
    try {
      await api.patch(`/campanas/${abierta.campana.id}`, { estado: cambioEstado.estado, motivo: cambioEstado.motivo || undefined });
      setMsg(`Campaña ${ESTADO_CAMPANA[cambioEstado.estado].toLowerCase()}.`);
      setCambioEstado(null);
      await recargarAbierta(); await cargar(filtroTipo);
    } catch (e: any) { setError(mensajeDeError(e, 'cambiar el estado')); }
    finally { setOcupado(false); }
  }

  async function guardarReparto() {
    setOcupado(true); setError('');
    try {
      const r = await api.post(`/campanas/${repartir.campanaId}/zonas`, {
        zonas: repartir.filas.filter((f: any) => f.locationId).map((f: any) => ({
          locationId: f.locationId,
          asignadoAId: f.asignadoAId || undefined,
          esperados: f.esperados === '' ? undefined : Number(f.esperados),
          inicioPrevisto: f.inicioPrevisto || undefined,
          finPrevisto: f.finPrevisto || undefined,
        })),
      });
      setMsg(r.data?.yaEstaban
        ? `Zonas repartidas: ${r.data.creadas}. ${r.data.yaEstaban} ya estaban en la campaña y no se duplicaron.`
        : `Zonas repartidas: ${r.data?.creadas ?? 0}.`);
      setRepartir(null);
      await recargarAbierta(); await cargar(filtroTipo);
    } catch (e: any) { setError(mensajeDeError(e, 'repartir')); }
    finally { setOcupado(false); }
  }

  async function guardarPlanZona() {
    setOcupado(true); setError('');
    try {
      const { id, ...cuerpo } = planZona;
      await api.patch(`/campanas/zona/${id}`, cuerpo);
      setMsg('Plan de la zona guardado.');
      setPlanZona(null); await recargarAbierta();
    } catch (e: any) { setError(mensajeDeError(e, 'guardar el plan de la zona')); }
    finally { setOcupado(false); }
  }

  async function guardarAvance() {
    setOcupado(true); setError('');
    try {
      await api.patch(`/campanas/zona/${avanceZona.id}/avance`, { hechos: Number(avanceZona.hechos), notas: avanceZona.notas });
      setMsg('Avance anotado.');
      setAvanceZona(null); await recargarAbierta();
    } catch (e: any) { setError(mensajeDeError(e, 'anotar el avance')); }
    finally { setOcupado(false); }
  }

  async function verRevision(zonaId: string) {
    setObs(''); setError('');
    try { setRevision(await api.get(`/campanas/zona/${zonaId}`).then((r) => r.data)); }
    catch (e: any) { setError(mensajeDeError(e, 'revisar')); }
  }

  async function decidir(aprobar: boolean) {
    setOcupado(true); setError('');
    try {
      await api.patch(`/campanas/zona/${revision.zona.id}/decidir`, { aprobar, observaciones: obs });
      setMsg(aprobar ? 'Zona aprobada.' : 'Zona devuelta con las observaciones.');
      setRevision(null);
      await recargarAbierta(); await cargar(filtroTipo);
    } catch (e: any) { setError(mensajeDeError(e, 'decidir')); }
    finally { setOcupado(false); }
  }

  async function marcarTerminada(zonaId: string) {
    setError('');
    try {
      await api.patch(`/campanas/zona/${zonaId}/cargada`, {});
      setMsg('Zona marcada como terminada. Ahora tiene que revisarla otra persona.');
      await recargarAbierta();
    } catch (e: any) { setError(mensajeDeError(e, 'marcar')); }
  }

  const c = abierta?.campana;
  const unidad = c?.unidad || 'unidades';

  return (
    <div className="page">
      <div className="card explica"
        title="El tipo es libre: mapeo, instalación, rotulado o lo que haga falta. Quien revisa no puede ser quien hizo el trabajo, y el avance cuenta sólo zonas aprobadas.">
        Trabajos repartidos por zonas, <b>con fechas y meta</b>, y revisados por otra persona.
      </div>

      {msg && <div role="status" className="aviso-ok aviso-cerrable" onClick={() => setMsg('')} title="Toca para cerrar este aviso">{msg}</div>}
      <AvisoDeRecorte recorte={recorte} cuales="campañas más recientes" como="Las anteriores siguen guardadas." />
      {error && !ficha && !repartir && !planZona && !avanceZona && !cambioEstado && !revision && (
        <div role="alert" className="aviso-error aviso-cerrable" onClick={() => setError('')} title="Toca para cerrar este aviso">{error}</div>
      )}

      <div className="filters">
        <div className="chips-elegir" role="group" aria-label="Filtrar por tipo" style={{ margin: 0 }}>
          <button type="button" className={filtroTipo ? undefined : 'activo'} aria-pressed={!filtroTipo}
            onClick={() => setFiltroTipo('')}>Todas</button>
          {tipos.map((t) => (
            <button key={t.tipo} type="button" className={filtroTipo === t.tipo ? 'activo' : undefined}
              aria-pressed={filtroTipo === t.tipo} onClick={() => setFiltroTipo(t.tipo)}>
              {t.tipo} · {t.n}
            </button>
          ))}
        </div>
        {puedeGestionar && (
          <button className="btn-primary" onClick={() => {
            setError('');
            setFicha({ nombre: '', tipo: filtroTipo, unidad: '', tren: '', responsableId: '', descripcion: '', inicioPrevisto: '', finPrevisto: '' });
          }}>+ Nueva campaña</button>
        )}
      </div>

      {cargando && !lista.length ? <EsqueletoTabla filas={3} /> : lista.length === 0 ? (
        <div className="card vacio">
          <h3>No hay campañas{filtroTipo ? ` de ${filtroTipo.toLowerCase()}` : ''}</h3>
          <p>Un trabajo grande repartido por zonas: quién, cuándo y cuánto en cada una.</p>
        </div>
      ) : (
        <div className="desliza"><table className="tabla">
          <thead><tr><th>Campaña</th><th>Tren</th><th>Plan</th><th>Estado</th>
            <th className="num">Aprobado</th><th></th></tr></thead>
          <tbody>
            {lista.map((x) => (
              <tr key={x.id}>
                <td>
                  <strong>{x.codigo}</strong> · {x.nombre}
                  <div><span className="chip sindatos" style={{ fontSize: 11 }}>{x.tipo}</span></div>
                </td>
                <td>{nombreDeTrenDePlanta(x.tren) || <span className="muted">Todos</span>}</td>
                <td className="muted">
                  {x.inicioPrevisto || x.finPrevisto ? `${fecha(x.inicioPrevisto, '…')} → ${fecha(x.finPrevisto, '…')}` : 'sin fechas'}
                </td>
                <td>
                  <span className={'badge ' + x.estado}>{ESTADO_CAMPANA[x.estado]}</span>
                  {x.atrasadas > 0 && !cerrada(x.estado) && (
                    <div><span className="chip crit" style={{ fontSize: 11 }}>{plural(x.atrasadas, 'zona atrasada', 'zonas atrasadas')}</span></div>
                  )}
                </td>
                <td className="num" title={`${x.aprobadas} de ${x._count.zonas} zonas aprobadas`}>
                  {x._count.zonas ? `${x.pctAprobado}%` : <span className="muted">sin zonas</span>}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn-mini" onClick={() => abrir(x.id)}>Abrir</button>
                  <MenuDeBorrado><BotonPurgar recurso="campana" id={x.id} onBorrado={() => cargar(filtroTipo)} /></MenuDeBorrado>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {/* ---------- UNA CAMPAÑA: SU PLAN Y SU AVANCE ---------- */}
      {abierta && (
        <Modal title={`${c.codigo} · ${c.nombre}`} onClose={() => setAbierta(null)} ancho
          acciones={puedeGestionar ? (
            <>
              {cerrada(c.estado) ? (
                <button className="btn-mini" onClick={() => { setError(''); setCambioEstado({ estado: 'EN_CURSO', motivo: '' }); }}>Reabrir</button>
              ) : (
                <>
                  <button className="btn-mini" onClick={() => { setError(''); setCambioEstado({ estado: 'CANCELADA', motivo: '' }); }}>Cancelar campaña</button>
                  <button className="btn-mini" onClick={() => { setError(''); setCambioEstado({ estado: 'CERRADA', motivo: '' }); }}>Cerrar campaña</button>
                  <button className="btn-mini" onClick={() => {
                    setError('');
                    setFicha({
                      id: c.id, nombre: c.nombre, tipo: c.tipo, unidad: c.unidad || '', tren: c.tren || '',
                      responsableId: c.responsableId || '', descripcion: c.descripcion || '',
                      inicioPrevisto: paraInput(c.inicioPrevisto), finPrevisto: paraInput(c.finPrevisto),
                    });
                  }}>Editar plan</button>
                  <button className="btn-primary" onClick={() => {
                    setError('');
                    setRepartir({
                      campanaId: c.id, tren: c.tren,
                      filas: [{ locationId: '', asignadoAId: '', esperados: '', inicioPrevisto: paraInput(c.inicioPrevisto), finPrevisto: paraInput(c.finPrevisto) }],
                    });
                  }}>+ Repartir zonas</button>
                </>
              )}
            </>
          ) : undefined}>

          {error && !ficha && !repartir && !planZona && !avanceZona && !cambioEstado && !revision && (
            <div role="alert" className="aviso-error">{error}</div>
          )}

          <div className="card" style={{ marginTop: 0, padding: 14 }}>
            <div className="campana-cabeza">
              <div>
                <div className="campana-pct">{abierta.pctAprobado}%</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {abierta.porEstado.APROBADA ?? 0} de {abierta.total} zonas aprobadas
                </div>
              </div>
              <div className="campana-datos">
                <span className="chip sindatos">{c.tipo}</span>
                <span className={'badge ' + c.estado}>{ESTADO_CAMPANA[c.estado]}</span>
                {abierta.atrasadas > 0 && <span className="chip crit">{plural(abierta.atrasadas, 'atrasada')}</span>}
                <div className="muted" style={{ fontSize: 12.5, flexBasis: '100%' }}>
                  Plan: {fecha(c.inicioPrevisto, '…')} → {fecha(c.finPrevisto, '…')}
                  {' · '}Responsable: {c.responsable || 'sin asignar'}
                  {' · '}Tren: {nombreDeTrenDePlanta(c.tren) || 'todos'}
                </div>
                <div style={{ fontSize: 12.5, flexBasis: '100%' }}
                  title="Lo hecho contra la meta de cada zona. Si alguna zona no tiene meta, el porcentaje no se calcula: sumar sólo las que la tienen inventaría un avance.">
                  Meta: <b>{abierta.meta.hechos}</b> de {abierta.meta.sinMeta ? 'una meta incompleta' : abierta.meta.esperados} {unidad}
                  {abierta.meta.pct != null && <> · <b>{abierta.meta.pct}%</b></>}
                  {abierta.meta.sinMeta > 0 && <span className="muted"> ({plural(abierta.meta.sinMeta, 'zona')} sin meta)</span>}
                </div>
              </div>
            </div>
            {c.descripcion && <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>{c.descripcion}</p>}
          </div>

          {abierta.zonas.length === 0 ? (
            <div className="card vacio"><h3>Sin zonas repartidas</h3>
              <p>Reparte las zonas: quién, cuándo y cuánto en cada una.</p></div>
          ) : (
            <div className="desliza"><table className="tabla">
              <thead><tr><th>Zona</th><th>Plan</th><th className="num">Avance</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {abierta.zonas.map((z: any) => (
                  <tr key={z.id}>
                    <td>
                      <strong>{z.ubicacion?.name || z.ubicacion?.code}</strong>
                      <div className="muted" style={{ fontSize: 11.5 }}>{z.asignado || 'sin asignar'}</div>
                      {z.observaciones && (
                        <div style={{ fontSize: 12, color: 'var(--crit-texto)', marginTop: 4 }}>↩ {z.observaciones}</div>
                      )}
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <span className={PLAN[z.plan]?.clase} style={{ fontSize: 11 }}>{PLAN[z.plan]?.texto}</span>
                      <span className="muted" style={{ fontSize: 11.5 }}> {fecha(z.inicioPrevisto, '…')} → {fecha(z.finPrevisto, '…')}</span>
                      <BarraDelPlan z={z} rango={abierta.rango} />
                    </td>
                    <td className="num" title={c.esMapeo ? 'Equipos cargados en la zona: se cuentan solos.' : 'Lo anota quien trabaja la zona.'}>
                      {z.hechos ?? 0}{z.esperados != null ? ` / ${z.esperados}` : ''}
                    </td>
                    <td><span className={'badge ' + z.estado}>{ESTADO_ZONA[z.estado]}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="campana-acciones">
                        <button className="btn-mini" onClick={() => verRevision(z.id)}>Revisar</button>
                        {!cerrada(c.estado) && z.estado !== 'APROBADA' && (
                          <>
                            {!c.esMapeo && puedeTrabajar && (
                              <button className="btn-mini" onClick={() => { setError(''); setAvanceZona({ id: z.id, hechos: String(z.hechos ?? ''), notas: z.notas || '' }); }}>Avance</button>
                            )}
                            {puedeTrabajar && z.estado !== 'CARGADA' && (
                              <button className="btn-mini" onClick={() => marcarTerminada(z.id)}>Terminé</button>
                            )}
                            {puedeGestionar && (
                              <button className="btn-mini" onClick={() => {
                                setError('');
                                setPlanZona({
                                  id: z.id, asignadoAId: z.asignadoAId || '', esperados: z.esperados ?? '',
                                  inicioPrevisto: paraInput(z.inicioPrevisto), finPrevisto: paraInput(z.finPrevisto),
                                });
                              }}>Plan</button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <ComoSeCalcula>
            El porcentaje grande cuenta sólo zonas <b>aprobadas</b> por otra persona: lo terminado sin revisar no cuenta.
            Una zona está <b>atrasada</b> cuando su último día ya pasó y nadie la aprobó.
            {c.esMapeo
              ? ' En mapeo, el avance son los equipos cargados en la zona, y una zona con fichas defectuosas no se aprueba.'
              : ' El avance lo anota quien trabaja la zona; quien la revisa lo confirma.'}
          </ComoSeCalcula>
        </Modal>
      )}

      {/* ---------- LA REVISIÓN ---------- */}
      {revision && (
        <Modal title={`Revisar ${revision.zona.ubicacion?.name || 'zona'}`} onClose={() => setRevision(null)} ancho
          acciones={
            <>
              <button className="btn-mini" onClick={() => setRevision(null)}>Cerrar</button>
              <BotonConMotivo className="btn-mini btn-danger" onClick={() => decidir(false)} ocupado={ocupado}
                falta={queFalta([obs.trim().length < 5,
                  'Escribe qué hay que corregir. Devolver sin decir qué hace que vuelva igual.'])}>
                Devolver para corregir
              </BotonConMotivo>
              <BotonConMotivo onClick={() => decidir(true)} ocupado={ocupado}
                falta={queFalta([!revision.sePuedeAprobar,
                  'Esta zona todavía no se puede aprobar. Mira el detalle de arriba.'])}>
                Aprobar la zona
              </BotonConMotivo>
            </>
          }>
          {error && <div role="alert" className="aviso-error">{error}</div>}

          {revision.zona.cargadaPorId === user?.id && (
            <div className="card peligro">
              <b>Esta zona la terminaste tú.</b> Que la revise otra persona.
            </div>
          )}

          <div className="card" style={{ marginTop: 0 }}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <div><b style={{ fontSize: 26 }}>{revision.total}</b><div className="muted" style={{ fontSize: 12 }}>{revision.unidad || 'hechos'}</div></div>
              {revision.esMapeo && (
                <>
                  <div><b style={{ fontSize: 26, color: 'var(--ok)' }}>{revision.limpios}</b><div className="muted" style={{ fontSize: 12 }}>sin nada que corregir</div></div>
                  <div><b style={{ fontSize: 26, color: 'var(--crit)' }}>{revision.conBloqueantes}</b><div className="muted" style={{ fontSize: 12 }}>no se pueden usar así</div></div>
                  <div><b style={{ fontSize: 26, color: 'var(--warn)' }}>{revision.conAvisos}</b><div className="muted" style={{ fontSize: 12 }}>con detalles menores</div></div>
                </>
              )}
              {revision.faltan != null && revision.faltan > 0 && (
                <div><b style={{ fontSize: 26 }}>{revision.faltan}</b><div className="muted" style={{ fontSize: 12 }}>faltan para la meta</div></div>
              )}
            </div>
            {revision.zona.notas && <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>{revision.zona.notas}</p>}
          </div>

          {!revision.sePuedeAprobar && (
            <div className="card peligro">{revision.motivoSiNo}</div>
          )}

          {revision.activos.length > 0 && (
            <div className="desliza"><table className="tabla">
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
                            <li key={k} style={{ color: d.gravedad === 'BLOQUEANTE' ? 'var(--crit-texto)' : 'inherit' }}>
                              {d.gravedad === 'BLOQUEANTE' && <b>[impide usarlo] </b>}{d.texto}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}

          <label className="campo" style={{ marginTop: 14 }}>
            <span>Observaciones para quien la trabajó</span>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)}
              placeholder="Faltan los rótulos de los 4 gabinetes del lecho." />
            <small className="muted">Obligatorio al devolver.</small>
          </label>
        </Modal>
      )}

      {/* ---------- NUEVA / EDITAR CAMPAÑA ---------- */}
      {ficha && (
        <Modal title={ficha.id ? 'Editar el plan de la campaña' : 'Nueva campaña'} onClose={() => setFicha(null)} ancho
          acciones={<>
            <button className="btn-mini" onClick={() => setFicha(null)}>Cancelar</button>
            <BotonConMotivo onClick={guardarFicha} ocupado={ocupado}
              falta={queFalta(
                [ficha.tipo.trim().length < 3, 'Elige o escribe de qué es la campaña.'],
                [ficha.nombre.trim().length < 3, 'Ponle un nombre a la campaña, de 3 letras o más.'],
                [!!(ficha.inicioPrevisto && ficha.finPrevisto && ficha.finPrevisto < ficha.inicioPrevisto), 'El fin no puede ser antes del inicio.'],
              )}>
              {ocupado ? 'Guardando…' : ficha.id ? 'Guardar' : 'Crear'}
            </BotonConMotivo>
          </>}>
          {error && <div role="alert" className="aviso-error">{error}</div>}
          <ElegirConClics etiqueta="¿De qué es?" opciones={opcionesDeTipo} valor={ficha.tipo ? [ficha.tipo] : []}
            onChange={(v) => setFicha({ ...ficha, tipo: v[0] ?? '' })} />
          <div className="form-grid">
            <label className="campo">
              <span>Tipo <b className="campo-req">*</b></span>
              <input value={ficha.tipo} maxLength={60} onChange={(e) => setFicha({ ...ficha, tipo: e.target.value })}
                placeholder="O escribe uno nuevo" />
            </label>
            <label className="campo">
              <span>Meta medida en</span>
              <input value={ficha.unidad} maxLength={40} list="unidades-campana"
                onChange={(e) => setFicha({ ...ficha, unidad: e.target.value })} placeholder="equipos, rótulos…" />
              <datalist id="unidades-campana">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
            </label>
            <label className="campo campo-ancho">
              <span>Nombre <b className="campo-req">*</b></span>
              <input value={ficha.nombre} maxLength={200} onChange={(e) => setFicha({ ...ficha, nombre: e.target.value })}
                placeholder="Rotulado de gabinetes Tren 2 — noviembre" />
            </label>
            <label className="campo">
              <span>Tren</span>
              <select value={ficha.tren} onChange={(e) => setFicha({ ...ficha, tren: e.target.value })}>
                <option value="">Todos</option>
                <OpcionesDeTrenDePlanta />
              </select>
            </label>
            <label className="campo">
              <span>Responsable</span>
              <select value={ficha.responsableId} onChange={(e) => setFicha({ ...ficha, responsableId: e.target.value })}>
                <option value="">Sin asignar</option>
                {usuarios.map((u: any) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Inicio previsto</span>
              <input type="date" value={ficha.inicioPrevisto}
                onChange={(e) => setFicha({ ...ficha, inicioPrevisto: e.target.value })} />
            </label>
            <label className="campo">
              <span>Fin previsto</span>
              <input type="date" value={ficha.finPrevisto} min={ficha.inicioPrevisto || undefined}
                onChange={(e) => setFicha({ ...ficha, finPrevisto: e.target.value })} />
            </label>
            <label className="campo campo-ancho">
              <span>Descripción</span>
              <textarea value={ficha.descripcion} onChange={(e) => setFicha({ ...ficha, descripcion: e.target.value })} />
            </label>
          </div>
        </Modal>
      )}

      {/* ---------- CERRAR · CANCELAR · REABRIR ---------- */}
      {cambioEstado && (
        <Modal title={cambioEstado.estado === 'CERRADA' ? 'Cerrar la campaña' : cambioEstado.estado === 'CANCELADA' ? 'Cancelar la campaña' : 'Reabrir la campaña'}
          onClose={() => setCambioEstado(null)}
          acciones={<>
            <button className="btn-mini" onClick={() => setCambioEstado(null)}>Volver</button>
            <BotonConMotivo onClick={guardarEstado} ocupado={ocupado}
              falta={queFalta([cambioEstado.estado === 'CANCELADA' && cambioEstado.motivo.trim().length < 5,
                'Di por qué se cancela.'])}>
              Confirmar
            </BotonConMotivo>
          </>}>
          {error && <div role="alert" className="aviso-error">{error}</div>}
          <p style={{ marginTop: 0 }}>
            {cambioEstado.estado === 'CERRADA'
              ? 'Sólo con todas sus zonas aprobadas.'
              : cambioEstado.estado === 'CANCELADA'
                ? 'Lo hecho se conserva.'
                : 'Vuelve a quedar en curso.'}
          </p>
          {cambioEstado.estado === 'CANCELADA' && (
            <label className="campo">
              <span>Motivo <b className="campo-req">*</b></span>
              <textarea value={cambioEstado.motivo} onChange={(e) => setCambioEstado({ ...cambioEstado, motivo: e.target.value })} />
            </label>
          )}
        </Modal>
      )}

      {/* ---------- REPARTIR ---------- */}
      {repartir && (
        <Modal title="Repartir zonas" onClose={() => setRepartir(null)} ancho
          acciones={<>
            <button className="btn-mini" onClick={() => setRepartir(null)}>Cancelar</button>
            <button className="btn-mini" onClick={() => setRepartir({
              ...repartir,
              filas: [...repartir.filas, { ...repartir.filas[repartir.filas.length - 1], locationId: '' }],
            })}>+ Otra zona</button>
            <BotonConMotivo onClick={guardarReparto} ocupado={ocupado}
              falta={queFalta(
                [!repartir.filas.some((f: any) => f.locationId), 'Elige al menos una zona.'],
                [repartir.filas.some((f: any) => f.inicioPrevisto && f.finPrevisto && f.finPrevisto < f.inicioPrevisto), 'Hay una zona con el fin antes del inicio.'],
              )}>
              {ocupado ? 'Guardando…' : 'Repartir'}
            </BotonConMotivo>
          </>}>
          {error && <div role="alert" className="aviso-error">{error}</div>}
          <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}
            title="Un número inventado deja una alarma falsa para siempre. Cada fila nueva copia las fechas y la persona de la anterior.">
            La meta puede quedar vacía si no se sabe.
          </p>
          {/* Bloque 40: clave por ubicación elegida, y el índice sólo mientras la
              fila está en blanco. Con el índice a secas, quitar una fila del
              medio dejaba el texto escrito en la de debajo. */}
          {repartir.filas.map((f: any, i: number) => {
            const poner = (cambio: any) => {
              const filas = [...repartir.filas]; filas[i] = { ...f, ...cambio };
              setRepartir({ ...repartir, filas });
            };
            return (
              <div key={f.locationId || `vacia-${i}`} className="form-grid" style={{ borderTop: i ? '1px solid var(--border)' : 'none', paddingTop: i ? 12 : 0 }}>
                <label className="campo campo-ancho">
                  <span>Zona</span>
                  <select value={f.locationId} onChange={(e) => poner({ locationId: e.target.value })}>
                    <option value="">Elegir ubicación…</option>
                    {/* Bloque 172 · sólo zonas del tren de la campaña. */}
                    <OpcionesDeUbicacion uso="trabajo" lista={ubicaciones} tren={siglaDeTrenDePlanta(repartir.tren)} actual={f.locationId} />
                  </select>
                </label>
                <label className="campo">
                  <span>Quién la trabaja</span>
                  <select value={f.asignadoAId} onChange={(e) => poner({ asignadoAId: e.target.value })}>
                    <option value="">Sin asignar</option>
                    {usuarios.map((u: any) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </select>
                </label>
                <label className="campo">
                  <span>Meta ({unidad})</span>
                  <input type="number" min={0} step={1} value={f.esperados} onChange={(e) => poner({ esperados: e.target.value })}
                    placeholder="Vacío si no se sabe" />
                </label>
                <label className="campo">
                  <span>Desde</span>
                  <input type="date" value={f.inicioPrevisto} onChange={(e) => poner({ inicioPrevisto: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Hasta</span>
                  <input type="date" value={f.finPrevisto} min={f.inicioPrevisto || undefined} onChange={(e) => poner({ finPrevisto: e.target.value })} />
                </label>
              </div>
            );
          })}
        </Modal>
      )}

      {/* ---------- EL PLAN DE UNA ZONA ---------- */}
      {planZona && (
        <Modal title="Plan de la zona" onClose={() => setPlanZona(null)}
          acciones={<>
            <button className="btn-mini" onClick={() => setPlanZona(null)}>Cancelar</button>
            <BotonConMotivo onClick={guardarPlanZona} ocupado={ocupado}
              falta={queFalta([!!(planZona.inicioPrevisto && planZona.finPrevisto && planZona.finPrevisto < planZona.inicioPrevisto), 'El fin no puede ser antes del inicio.'])}>
              Guardar
            </BotonConMotivo>
          </>}>
          {error && <div role="alert" className="aviso-error">{error}</div>}
          <div className="form-grid">
            <label className="campo campo-ancho">
              <span>Quién la trabaja</span>
              <select value={planZona.asignadoAId} onChange={(e) => setPlanZona({ ...planZona, asignadoAId: e.target.value })}>
                <option value="">Sin asignar</option>
                {usuarios.map((u: any) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Desde</span>
              <input type="date" value={planZona.inicioPrevisto} onChange={(e) => setPlanZona({ ...planZona, inicioPrevisto: e.target.value })} />
            </label>
            <label className="campo">
              <span>Hasta</span>
              <input type="date" value={planZona.finPrevisto} min={planZona.inicioPrevisto || undefined}
                onChange={(e) => setPlanZona({ ...planZona, finPrevisto: e.target.value })} />
            </label>
            <label className="campo">
              <span>Meta ({unidad})</span>
              <input type="number" min={0} step={1} value={planZona.esperados}
                onChange={(e) => setPlanZona({ ...planZona, esperados: e.target.value })} placeholder="Vacío si no se sabe" />
            </label>
          </div>
          <small className="muted" title="Así una zona atrasada no se «pone al día» moviendo la fecha sin que quede rastro.">Queda en la auditoría.</small>
        </Modal>
      )}

      {/* ---------- ANOTAR AVANCE ---------- */}
      {avanceZona && (
        <Modal title="Anotar avance" onClose={() => setAvanceZona(null)}
          acciones={<>
            <button className="btn-mini" onClick={() => setAvanceZona(null)}>Cancelar</button>
            <BotonConMotivo onClick={guardarAvance} ocupado={ocupado}
              falta={queFalta([avanceZona.hechos === '' || Number(avanceZona.hechos) < 0 || !Number.isInteger(Number(avanceZona.hechos)),
                'Pon cuántos llevas hechos: un número entero.'])}>
              Guardar
            </BotonConMotivo>
          </>}>
          {error && <div role="alert" className="aviso-error">{error}</div>}
          <label className="campo">
            <span>Hechos hasta ahora ({unidad})</span>
            <input type="number" min={0} step={1} value={avanceZona.hechos}
              onChange={(e) => setAvanceZona({ ...avanceZona, hechos: e.target.value })} />
          </label>
          <label className="campo">
            <span>Nota (opcional)</span>
            <textarea value={avanceZona.notas} onChange={(e) => setAvanceZona({ ...avanceZona, notas: e.target.value })}
              placeholder="Falta el gabinete G-04: sin acceso hasta la parada." />
          </label>
        </Modal>
      )}
    </div>
  );
}
