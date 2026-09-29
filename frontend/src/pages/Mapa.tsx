import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import LienzoPlano from '../components/mapa/LienzoPlano';
import Marcador, { ConoDeVision, IconoEquipo, NOMBRE_ICONO, iconoDe } from '../components/mapa/Marcador';
import TarjetaEquipo from '../components/mapa/TarjetaEquipo';
import TarjetaZona from '../components/mapa/TarjetaZona';
import VistaDePlanta from '../components/mapa/VistaDePlanta';
import ZonasDelPlano, { Zona, nombreCorto } from '../components/mapa/ZonasDelPlano';
import { hora } from '../fechas';

/**
 * EL MAPA — bloque 151. El plano real de la zona con cada equipo en su sitio.
 *
 * Palabras del usuario: «quiero como si fuese un plano real, ubicación exacta,
 * métricas, para que los técnicos vayan rápido». Y de Producción, en la
 * presentación: «queremos un mapa».
 *
 * Qué NO hace, a propósito: no crea nada. Ve y manda (§58). Los botones de la
 * tarjeta llevan a Órdenes o a la ficha. Lo vigila `verificar:mapa`.
 *
 * Se refresca cada 30 s mientras está a la vista. Si no hay monitoreo
 * automático, cada punto dice que su color es lo DECLARADO, no una medición.
 */
const REFRESCO_MS = 30_000;
const ORDEN: Record<string, number> = { caida: 0, alerta: 1, sindato: 2, ok: 3 };
const NOMBRE: Record<string, string> = { ok: 'operativos', alerta: 'con alerta', caida: 'sin servicio', sindato: 'sin dato' };

export default function Mapa() {
  const { can } = useAuth();
  const [planos, setPlanos] = useState<any[] | null>(null);
  const [planoId, setPlanoId] = useState<string>(() => {
    try { return localStorage.getItem('sgit:mapa-plano') || ''; } catch { return ''; }
  });
  const [vista, setVista] = useState<any>(null);
  const [imagen, setImagen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string>('');
  const [conos, setConos] = useState(true);
  const [etiquetas, setEtiquetas] = useState(false);
  const [enfocar, setEnfocar] = useState<{ x: number; y: number; n: number; w?: number } | null>(null);
  /* Bloque 165 · la vista de planta (todos los planos) y la zona elegida. */
  const [modo, setModo] = useState<'planta' | 'plano'>(() => {
    try { return localStorage.getItem('sgit:mapa-modo') === 'plano' ? 'plano' : 'planta'; } catch { return 'planta'; }
  });
  const [planta, setPlanta] = useState<any[] | null>(null);
  const [zonaSel, setZonaSel] = useState<string | null>(null);

  // 1. Los planos que esta persona puede ver.
  useEffect(() => {
    let vivo = true;
    api.get('/planos')
      .then((r) => {
        if (!vivo) return;
        const publicados = (r.data || []).filter((p: any) => p.estado === 'PUBLICADO');
        setPlanos(publicados);
        setPlanoId((actual) => (publicados.some((p: any) => p.id === actual) ? actual : publicados[0]?.id || ''));
      })
      .catch(() => { if (vivo) { setPlanos([]); setError('No se pudieron cargar los planos.'); } });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!planoId) return;
    try { localStorage.setItem('sgit:mapa-plano', planoId); } catch { /* sin persistencia */ }
  }, [planoId]);

  useEffect(() => {
    try { localStorage.setItem('sgit:mapa-modo', modo); } catch { /* sin persistencia */ }
  }, [modo]);

  // 1b. La planta de un vistazo (bloque 165): sólo si hay más de un plano, y se refresca con el mapa.
  const hayVariosPlanos = (planos?.length ?? 0) > 1;
  useEffect(() => {
    if (!hayVariosPlanos || modo !== 'planta') return;
    let vivo = true;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      api.get('/planos/planta').then((r) => { if (vivo) setPlanta(r.data || []); }).catch(() => { if (vivo) setPlanta([]); });
    };
    tick();
    const t = setInterval(tick, REFRESCO_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [hayVariosPlanos, modo]);

  function abrirPlano(id: string) {
    setPlanoId(id); setModo('plano'); setSel(null); setZonaSel(null); setFiltro(''); setEnfocar(null);
    if (id !== planoId) setVista(null);
  }

  // 2. La imagen del plano, con la sesión (no es un enlace público).
  useEffect(() => {
    if (!planoId) return;
    let vivo = true;
    let url: string | null = null;
    api.get(`/planos/${planoId}/imagen`, { responseType: 'blob' })
      .then((r) => { if (!vivo) return; url = URL.createObjectURL(r.data); setImagen(url); })
      .catch(() => { if (vivo) setImagen(null); });
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [planoId]);

  // 3. Los equipos y su estado, cada 30 s mientras la pestaña se ve.
  const cargarVista = useCallback(async (id: string) => {
    const r = await api.get(`/planos/${id}/vista`).then((x) => x.data).catch(() => null);
    return r;
  }, []);
  useEffect(() => {
    if (!planoId) return;
    let vivo = true;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      cargarVista(planoId).then((r) => { if (vivo && r) setVista(r); if (vivo && !r) setError('No se pudo cargar el estado del plano.'); });
    };
    tick();
    const t = setInterval(tick, REFRESCO_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [planoId, cargarVista]);

  const equipos: any[] = useMemo(() => vista?.equipos ?? [], [vista]);
  const zonas: Zona[] = useMemo(() => vista?.zonas ?? [], [vista]);
  const zona = zonaSel ? zonas.find((z) => z.id === zonaSel) ?? null : null;
  const visibles = equipos
    .filter((e) => !filtro || e.estado === filtro)
    .filter((e) => !zona || zona.equipos.includes(e.assetId));
  const atencion = equipos.filter((e) => e.estado !== 'ok').sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado]);
  const elegido = sel ? equipos.find((e) => e.assetId === sel) : null;
  const mpp = vista?.plano?.metrosPorPx ?? null;

  function irA(e: any) {
    setSel(e.assetId);
    setEnfocar({ x: e.xPx, y: e.yPx, n: Date.now() });
  }

  function elegirZona(id: string | null) {
    const z = id ? zonas.find((x) => x.id === id) : null;
    setZonaSel(z ? z.id : null); setSel(null);
    if (z) setEnfocar({ x: z.caja.cx, y: z.caja.cy, n: Date.now(), w: z.caja.w });
  }

  if (planos === null) return <div className="card" style={{ padding: 24 }}>Cargando planos…</div>;
  if (!planos.length) {
    return (
      <div className="card vacio">
        <h3>Todavía no hay un plano publicado</h3>
        <p>El mapa necesita el plano de un área (exportado de AutoCAD a PNG o SVG), calibrado y con sus equipos colocados.</p>
        {can('location.manage') && <Link className="btn-primary" to="/planos">Subir el plano de un área</Link>}
        {/* Bloque 166: sin plano real todavía, la demostración se carga desde la app (también en Railway). */}
        {can('asset.delete') && <Link className="btn-mini" to="/limpieza?pestana=demo" style={{ marginLeft: 8 }}>Cargar la demostración</Link>}
        {/* Bloque 160: Producción entra aquí. Sin plano, que no se quede mirando una pantalla vacía. */}
        <div className="accesos-rapidos" style={{ justifyContent: 'center', marginTop: 12 }}>
          {can('om.mirar') && <Link className="acceso-rapido" to="/mi-tren">Mi tren</Link>}
          {can('activos.mirar') && <Link className="acceso-rapido" to="/mis-camaras">Mis cámaras</Link>}
          {can('incident.read') && <Link className="acceso-rapido" to="/incidents">Incidencias</Link>}
        </div>
      </div>
    );
  }

  if (hayVariosPlanos && modo === 'planta') {
    return (
      <div className="mapa">
        <h1 className="page-title">Mapa</h1>
        <p className="muted" style={{ margin: '0 0 12px' }}>Cada plano, del color de su peor equipo. Entra al que tenga problema.</p>
        {planta === null ? <div className="card" style={{ padding: 24 }}>Cargando la planta…</div>
          : <VistaDePlanta planta={planta} onAbrir={abrirPlano} />}
      </div>
    );
  }

  return (
    <div className="mapa">
      <h1 className="page-title">Mapa</h1>
      {(hayVariosPlanos || vista?.padre) && (
        <nav className="mapa-migas" aria-label="Dónde estás">
          {hayVariosPlanos && <button type="button" onClick={() => setModo('planta')}>Planta</button>}
          {vista?.padre && <><span>›</span><button type="button" onClick={() => abrirPlano(vista.padre.id)}>{vista.padre.nombre}</button></>}
          <span>›</span><b>{vista?.plano?.ubicacion ?? '…'}</b>
        </nav>
      )}
      <div className="mapa-barra">
        {planos.length > 1 ? (
          <select aria-label="Plano" value={planoId} onChange={(ev) => abrirPlano(ev.target.value)}>
            {planos.map((p) => <option key={p.id} value={p.id}>{p.location?.name} · {p.nombre}</option>)}
          </select>
        ) : (
          <b>{planos[0].location?.name} · {planos[0].nombre}</b>
        )}
        <div className="mapa-contadores">
          {(['caida', 'alerta', 'sindato', 'ok'] as const).map((k) => (
            <button key={k} type="button" className={'mapa-contador punto-' + k + (filtro === k ? ' activo' : '')}
              aria-pressed={filtro === k}
              onClick={() => setFiltro(filtro === k ? '' : k)}>
              <i /> <b>{vista?.resumen?.[k] ?? 0}</b> {NOMBRE[k]}
            </button>
          ))}
        </div>
        <label className="mapa-capa"><input type="checkbox" checked={conos} onChange={(ev) => setConos(ev.target.checked)} /> Cobertura</label>
        <label className="mapa-capa"><input type="checkbox" checked={etiquetas} onChange={(ev) => setEtiquetas(ev.target.checked)} /> Códigos</label>
        {vista && (
          <span className="muted" style={{ fontSize: 12 }}>
            {vista.hayMonitoreo ? 'Monitoreo' : 'Estado declarado'} · {hora(vista.datoDe)}
          </span>
        )}
      </div>
      {error && <div role="alert" className="aviso-error">{error}</div>}
      {zonas.length > 0 && (
        <div className="mapa-zonas" role="group" aria-label="Ver por zona">
          <button type="button" className={!zona ? 'activo' : undefined} aria-pressed={!zona} onClick={() => elegirZona(null)}>Todas las zonas</button>
          {zonas.map((z) => (
            <button key={z.id} type="button" className={'mapa-zona-chip estado-' + z.estado + (zona?.id === z.id ? ' activo' : '')}
              aria-pressed={zona?.id === z.id} onClick={() => elegirZona(zona?.id === z.id ? null : z.id)}>
              <i /> {nombreCorto(z.nombre)} <span className="muted">{z.equipos.length || (z.planoHijo ? '⤵' : 0)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mapa-escenario">
        {vista ? (
          <LienzoPlano key={vista.plano.id}
            imagenUrl={imagen}
            anchoPx={vista.plano.anchoPx}
            altoPx={vista.plano.altoPx}
            metrosPorPx={mpp}
            enfocar={enfocar}
            alPulsar={() => setSel(null)}
            hijos={(escala) => (
              <>
                <ZonasDelPlano zonas={zonas} escala={escala} elegida={zonaSel} onElegir={(id) => elegirZona(zonaSel === id ? null : id)} />
                {conos && visibles.filter((e) => e.tipo === 'CAMERA').map((e) => (
                  <ConoDeVision key={'c' + e.assetId} e={e} metrosPorPx={mpp} />
                ))}
                {visibles.map((e) => (
                  <Marcador key={e.assetId} e={e} escala={escala} seleccionado={sel === e.assetId}
                    conEtiqueta={etiquetas} onPulsar={() => setSel(e.assetId)} />
                ))}
              </>
            )}
          />
        ) : (
          <div className="card" style={{ padding: 24 }}>Cargando el plano…</div>
        )}

        <div className="mapa-panel">
          {elegido ? (
            <TarjetaEquipo key={elegido.assetId} e={elegido} equipos={equipos} metrosPorPx={mpp} onCerrar={() => setSel(null)}
              onReportado={() => { cargarVista(planoId).then((r) => { if (r) setVista(r); }); }} />
          ) : zona ? (
            <TarjetaZona key={zona.id} z={zona} equipos={equipos} onIrA={irA} onAbrirPlano={abrirPlano} onCerrar={() => elegirZona(null)} />
          ) : (
            <aside className="tarjeta-mapa">
              <header className="tarjeta-mapa-cab"><h2>Atención ahora</h2></header>
              <div className="tarjeta-mapa-cuerpo">
                {atencion.length === 0 ? (
                  <p className="muted">Todo lo del plano está operativo.</p>
                ) : (
                  <ul className="mapa-lista">
                    {atencion.map((e) => (
                      <li key={e.assetId}>
                        <button type="button" onClick={() => irA(e)}>
                          <IconoEquipo e={e} tam={20} /> <b>{e.codigo}</b>
                          <span className="muted">{e.referencia || e.estadoTexto}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="muted" style={{ fontSize: 12 }}>Toca un punto del plano para ver su ficha.</p>
                {/* Bloque 161: qué es cada dibujo. Sólo los que hay en ESTE plano. */}
                {equipos.length > 0 && (
                  <details className="mapa-iconos">
                    <summary>Qué es cada ícono</summary>
                    <ul>
                      {[...new Set(equipos.map((e) => iconoDe(e)))].sort().map((ic) => (
                        <li key={ic}>
                          <IconoEquipo e={{ icono: ic, tipo: '', estado: 'ok' }} tam={20} />
                          <span>{NOMBRE_ICONO[ic] || ic}</span>
                          <span className="muted">{equipos.filter((e) => iconoDe(e) === ic).length}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
