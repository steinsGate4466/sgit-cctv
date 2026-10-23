import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { puedeAbrir } from '../modulos';
import LienzoPlano from '../components/mapa/LienzoPlano';
import Marcador, { ConoDeVision, IconoEquipo, NOMBRE_ICONO, iconoDe } from '../components/mapa/Marcador';
import TarjetaEquipo from '../components/mapa/TarjetaEquipo';
import TarjetaZona from '../components/mapa/TarjetaZona';
import VistaDePlanta from '../components/mapa/VistaDePlanta';
import EstasAqui from '../components/mapa/EstasAqui';
import Icono from '../components/Iconos';
import ZonasDelPlano, { Zona, nombreCorto } from '../components/mapa/ZonasDelPlano';
import RiesgosDelPlano from '../components/mapa/RiesgosDelPlano';
import CablesDelPlano, { Cable } from '../components/mapa/CablesDelPlano';
import { NIVEL, NIVELES } from '../components/mapa/riesgos';
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
  const { can, user } = useAuth();
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
  /* BLOQUE 171 (plan 154) · «ESTÁS AQUÍ». Se llega desde el QR de un equipo
     (`/mapa?activo=<id>`): el mapa abre su plano, lo centra, lo marca y dice
     cómo se llega. La ruta a pie es TEXTO —tren, sala, «cómo llegar», altura y
     medio— porque los planos no traen pasillos dibujados: inventar un camino
     sobre el plano sería pintar algo que nadie ha medido. */
  const [params] = useSearchParams();
  const activoQr = params.get('activo');
  const [aqui, setAqui] = useState<{ assetId: string; xPx: number; yPx: number; planoId: string; porSuPadre: boolean } | null>(null);
  const [noColocado, setNoColocado] = useState(false);
  const [ruta, setRuta] = useState<any>(null);
  const [verRuta, setVerRuta] = useState(true);
  /* BLOQUE 171 (plan 153) · CAPA DE IMPACTO. Con un equipo elegido, marca en
     el plano lo que se dejaría de ver si cae — el mismo cálculo de «Impacto de
     una caída» (`/network/impacto`), pero DONDE está, no en una lista. Es la
     pregunta antes de apagar un switch para cambiarlo. Sólo con `red.read`. */
  const veImpacto = can('red.read');
  const [impacto, setImpacto] = useState(false);
  const [caen, setCaen] = useState<{ ids: Set<string>; resumen: string } | null>(null);
  /* Bloque 173 · PUNTOS ENCIMADOS. En el celular dos cámaras a tres metros se
     dibujan una sobre otra y el dedo abría la de al lado. Si al tocar hay más
     de un punto bajo el dedo, se pregunta cuál, en vez de adivinar. */
  const [cercanos, setCercanos] = useState<any[] | null>(null);
  /* BLOQUE 176 · EL MAPA REGULA. Dos capas más: el RIESGO (bordes de color por
     área) y el CABLEADO (del switch a cada equipo, con sus metros). Y la lista
     «Fuera de norma» al costado: tocar un aviso lleva al punto. */
  const [capaRiesgo, setCapaRiesgo] = useState(true);
  const [capaCables, setCapaCables] = useState(true);
  const [resaltar, setResaltar] = useState<Set<string> | null>(null);
  const [riesgoSel, setRiesgoSel] = useState<string | null>(null);
  /* BLOQUE 181 · PANTALLA COMPLETA DE VERDAD. Palabras del usuario: «que el
     mapa se extienda sobre toda la pantalla en el clic de ampliar».

     Antes había DOS botones y ninguno lo hacía. «Ampliar» sólo ensanchaba el
     plano dentro de la página —el menú y la cabecera seguían ahí— y en el
     celular no hacía NADA, porque ahí ya iba a una sola columna. «Pantalla
     completa» usaba la del navegador, que el iPhone no tiene (caía en
     «Ampliar», o sea en nada), y además escondía los filtros y las capas.

     Ahora es UNO. El mapa tapa la ventana entera —menú, cabecera y pestañas—
     con su barra arriba, y donde el navegador lo permite (PC y Android) se
     pide también su pantalla completa, para quitar sus barras. Se sale con
     «Salir», con la ✕ de la esquina del plano o con Esc.

     La lista (lo que pide atención y la ficha del punto) va al costado en el
     PC y debajo del plano en el celular; se abre sola al tocar un punto y se
     oculta con «Atención» para dejarle al plano toda la pantalla. */
  const [entera, setEntera] = useState(false);
  const [verLista, setVerLista] = useState(true);
  const [sinGiro, setSinGiro] = useState(false);
  const conNavegador = useRef(false);
  function entrarEntera() {
    // En el celular el plano sale solo; la lista, a un toque.
    setVerLista(!window.matchMedia?.('(max-width: 960px)').matches);
    setEntera(true);
    const raiz = document.documentElement;
    if (raiz.requestFullscreen && !document.fullscreenElement) {
      raiz.requestFullscreen().then(() => { conNavegador.current = true; }).catch(() => { conNavegador.current = false; });
    }
  }
  function salirEntera() {
    setEntera(false);
    conNavegador.current = false;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => null);
  }
  useEffect(() => {
    if (!entera) return;
    /* Esc sale, salvo que haya una ventana abierta encima: esa Esc es suya. */
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return;
      setEntera(false);
      conNavegador.current = false;
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => null);
    };
    /* Con la pantalla completa del NAVEGADOR, Esc no llega a la página: la
       consume él. Si se sale de ella (Esc, F11 o su aviso), se sale también de
       la del mapa; si no, quedaría el mapa tapando todo sin saber por qué. */
    const alCambiar = () => {
      if (!document.fullscreenElement && conNavegador.current) { conNavegador.current = false; setEntera(false); }
    };
    document.addEventListener('keydown', tecla);
    document.addEventListener('fullscreenchange', alCambiar);
    // La página de detrás no se desplaza mientras el mapa la tapa.
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.removeEventListener('fullscreenchange', alCambiar);
      document.body.style.overflow = antes;
    };
  }, [entera]);
  /* Al irse a otra pantalla («Ir a la orden», «Ficha»…) se suelta también la
     pantalla completa del navegador: la pantalla siguiente no la pidió. */
  useEffect(() => () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => null); }, []);

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

  const planosListos = planos !== null;
  useEffect(() => {
    if (!activoQr || !planosListos) return;
    let vivo = true;
    setNoColocado(false); setAqui(null); setVerRuta(true);
    api.get(`/planos/donde/${activoQr}`)
      .then((r) => {
        if (!vivo) return;
        const d = (r.data || [])[0];
        if (!d) { setNoColocado(true); return; }
        setAqui({ ...d, assetId: activoQr });
        abrirPlano(d.planoId);
        if (!d.porSuPadre) setSel(activoQr);
        setEnfocar({ x: d.xPx, y: d.yPx, n: Date.now() });
      })
      .catch(() => { if (vivo) setNoColocado(true); });
    api.get(`/seguridad/activo/${activoQr}`)
      .then((r) => { if (vivo) setRuta(r.data); })
      .catch(() => { if (vivo) setRuta(null); });
    return () => { vivo = false; };
    // abrirPlano cambia en cada pintado; lo que manda es el equipo pedido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activoQr, planosListos]);

  useEffect(() => {
    if (!impacto || !sel || !veImpacto) { setCaen(null); return; }
    let vivo = true;
    api.get(`/network/impacto/${sel}`)
      .then((r) => { if (vivo) setCaen({ ids: new Set<string>(r.data?.pierden || []), resumen: r.data?.resumen || '' }); })
      .catch((e) => {
        if (!vivo) return;
        setCaen({ ids: new Set(), resumen: e?.response?.status === 404
          ? 'Este equipo no tiene enlaces de red declarados: no se puede calcular qué cae.'
          : 'No se pudo calcular el impacto.' });
      });
    return () => { vivo = false; };
  }, [impacto, sel, veImpacto]);

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
      .catch((e) => {
        if (!vivo) return;
        setImagen(null);
        /* Bloque 174 · sin imagen el plano salía en negro sin decir por qué. */
        if (e?.response?.status === 404) setError('La imagen de este plano ya no está en el almacén: vuelve a subirla en Ubicaciones › Planos. Los equipos se siguen viendo en su sitio.');
      });
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
  const cables: Cable[] = useMemo(() => vista?.cables ?? [], [vista]);
  const avisos: any[] = useMemo(() => vista?.avisos ?? [], [vista]);
  const areas: any[] = useMemo(() => vista?.riesgos ?? [], [vista]);
  const riesgo = riesgoSel ? areas.find((a) => a.id === riesgoSel) ?? null : null;
  /* Al elegir un equipo se resalta SU cable; si es un switch, todos los suyos. */
  const resaltados = resaltar ?? (sel ? new Set([sel]) : null);
  const nivelesEnPlano = [...new Set([...areas.map((a) => a.nivel), ...zonas.flatMap((z: any) => (z.riesgos || []).map((r: any) => r.nivel))])];

  /* En el celular el panel va DEBAJO del plano: al tocar un punto, se lleva
     la vista hasta su ficha. Si no, el toque parecía no hacer nada. */
  const panel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // En pantalla completa la ficha ya está a la vista, debajo del plano.
    if (entera) return;
    if ((sel || cercanos) && window.matchMedia?.('(max-width: 960px)').matches) {
      panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [sel, cercanos, entera]);
  /* Bloque 181 · la lista se ve si la pidieron o si hay algo elegido: tocar un
     punto con la lista oculta abre su ficha igual. */
  const hayFicha = !!(elegido || cercanos || riesgo || zona);
  const conLista = verLista || hayFicha;
  /* En un teléfono vertical, un plano apaisado (un tren es largo y bajo) se ve
     como una franja: se avisa de que girarlo lo agranda. */
  const planoApaisado = !!vista && vista.plano.anchoPx > vista.plano.altoPx * 1.3;

  function pulsarPunto(e: any, escala: number, x?: number, y?: number) {
    /* Los discos miden 19 px de radio en pantalla: se pregunta sólo si el
       toque cae DENTRO de más de uno. Con teclado (sin x, y) se abre el pedido. */
    if (x == null || y == null) { setCercanos(null); setSel(e.assetId); return; }
    const radio = 19 * escala;
    const juntos = visibles.filter((o) => Math.hypot(o.xPx - x, o.yPx - y) < radio);
    if (juntos.length > 1) { setSel(null); setZonaSel(null); setCercanos(juntos); return; }
    setCercanos(null); setResaltar(null); setRiesgoSel(null); setSel(e.assetId);
  }

  function irA(e: any) {
    setCercanos(null); setResaltar(null); setRiesgoSel(null);
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
        {can('location.manage') && can('wo.approve') && <Link className="btn-primary" to="/planos">Subir el plano de un área</Link>}
        {/* Bloque 166: sin plano real todavía, la demostración se carga desde la app (también en Railway). */}
        {can('asset.delete') && <Link className="btn-mini" to="/limpieza?pestana=demo" style={{ marginLeft: 8 }}>Cargar la demostración</Link>}
        {/* Bloque 160: Producción entra aquí. Sin plano, que no se quede mirando una pantalla vacía. */}
        <div className="accesos-rapidos" style={{ justifyContent: 'center', marginTop: 12 }}>
          {puedeAbrir('/mi-tren', can, user) && <Link className="acceso-rapido" to="/mi-tren">Mi tren</Link>}
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
    <div className={'mapa' + (entera ? ' mapa-entera' + (conLista ? ' con-lista' : '') : '')}>
      <h1 className="page-title">Mapa</h1>
      {/* Bloque 173 · las migas y el plano van en UNA fila, y las zonas en una
          tira que se desliza: en la pantalla del púlpito (1366 × 768) el
          plano empezaba a mitad de pantalla, debajo de cuatro filas de botones. */}
      <div className="mapa-barra">
        {(hayVariosPlanos || vista?.padre) && (
          <nav className="mapa-migas" aria-label="Dónde estás">
            {/* La vista de planta no es un plano: se sale de la pantalla completa. */}
            {hayVariosPlanos && <button type="button" onClick={() => { if (entera) salirEntera(); setModo('planta'); }}>Planta</button>}
            {vista?.padre && <><span>›</span><button type="button" onClick={() => abrirPlano(vista.padre.id)}>{vista.padre.nombre}</button></>}
            <span>›</span>
          </nav>
        )}
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
        {/* Bloque 177 · las capas, como botones redondos encendidos/apagados en una
            sola cajita: las casillas sueltas se veían como un formulario. */}
        <div className="mapa-capas" role="group" aria-label="Capas del mapa">
          <Capa on={conos} set={setConos} icono="◔" texto="Cobertura" ayuda="Hacia dónde mira cada cámara" />
          <Capa on={etiquetas} set={setEtiquetas} icono="#" texto="Códigos" ayuda="El código de cada equipo" />
          <Capa on={capaRiesgo} set={setCapaRiesgo} icono="⚠" texto="Riesgo" ayuda="Bordes de color: alto riesgo, eléctrico, altura, calor y zona vital" />
          {vista && (cables.length > 0 || (vista.enlaces?.length ?? 0) > 0) && (
            <Capa on={capaCables} set={setCapaCables} icono="⌇" texto="Cableado" ayuda="Del switch a cada equipo, con sus metros" />
          )}
          {veImpacto && (
            <Capa on={impacto} set={setImpacto} icono="◎" texto="Impacto" ayuda="Elige un equipo: se marca lo que dejaría de verse si cae" />
          )}
        </div>
        <div className="mapa-capas mapa-pantalla" role="group" aria-label="Pantalla completa">
          {entera && (
            <button type="button" className={'mapa-capa-btn' + (conLista ? ' on' : '')} aria-pressed={conLista}
              title={hayFicha ? 'La ficha del punto elegido: ciérrala para ver el plano solo' : 'Lo que pide atención: ocúltalo para ver el plano solo'}
              onClick={() => { if (hayFicha) { setSel(null); setCercanos(null); setRiesgoSel(null); setZonaSel(null); setResaltar(null); setVerLista(false); } else setVerLista(!verLista); }}>
              <span aria-hidden="true">☰</span> Atención <b>{atencion.length}</b>
            </button>
          )}
          <button type="button" className={'mapa-capa-btn' + (entera ? ' on' : '')} aria-pressed={entera}
            title={entera ? 'Volver a la página (Esc)' : 'El mapa ocupa toda la pantalla'}
            onClick={entera ? salirEntera : entrarEntera}>
            <span aria-hidden="true">{entera ? '✕' : '⛶'}</span> {entera ? 'Salir' : 'Pantalla completa'}
          </button>
        </div>
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

      {impacto && (
        <div className="mapa-impacto" role="status">
          {!sel ? 'Elige un equipo en el plano para ver qué se dejaría de ver si cae.'
            : caen ? <><b>{elegido?.codigo ?? 'Equipo'}:</b> {caen.resumen}{caen.ids.size > 0 ? ` En este plano: ${equipos.filter((e) => caen.ids.has(e.assetId)).length}.` : ''}</>
              : 'Calculando…'}
        </div>
      )}
      {activoQr && verRuta && (aqui || noColocado) && (
        <section className="ruta-a-pie" aria-label="Cómo llegar">
          <button type="button" className="btn-mini ruta-cerrar" onClick={() => setVerRuta(false)}>{'Cerrar'}</button>
          <h4><Icono n="ubicacion" size={16} /> {`Cómo llegar a ${ruta?.assetCode ?? 'este equipo'}`}</h4>
          {noColocado && (
            <p className="muted">{'Aún no está colocado en ningún plano publicado. Se coloca en Ubicaciones › Planos.'}</p>
          )}
          <ol>
            {(ruta?.ubicacion || aqui) && <li>{`Ve a ${[aqui ? vista?.plano?.ubicacion : null, ruta?.ubicacion].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' › ') || 'su zona'}.`}</li>}
            {aqui?.porSuPadre && <li>{'Es un componente: en el plano está marcado el equipo del que cuelga.'}</li>}
            {ruta?.comoLlegar && <li>{ruta.comoLlegar}</li>}
            {ruta?.enAltura && <li>{`Está en altura${ruta.alturaM != null ? ` (${ruta.alturaM} m)` : ''}${ruta.medio ? `: hace falta ${String(ruta.medio).toLowerCase().replace('_', ' ')}` : ''}.`}</li>}
            {ruta?.bloqueoElectrico && <li>{'Antes de tocarlo: bloqueo eléctrico.'}</li>}
            {ruta && !ruta.comoLlegar && <li className="muted">{'Falta declarar «cómo llegar» en su ubicación (Árbol de planta).'}</li>}
          </ol>
        </section>
      )}

      <div className="mapa-escenario">
        {entera && planoApaisado && !sinGiro && (
          <p className="mapa-girar" role="note">
            <span aria-hidden="true">↻</span> Gira el teléfono: el plano se ve más grande.
            <button type="button" aria-label="Cerrar el aviso" onClick={() => setSinGiro(true)}>×</button>
          </p>
        )}
        {vista ? (
          <LienzoPlano key={vista.plano.id}
            alto={entera ? '100%' : undefined} llenar={entera}
            pantalla={{ activa: entera, alternar: entera ? salirEntera : entrarEntera }}
            imagenUrl={imagen}
            anchoPx={vista.plano.anchoPx}
            altoPx={vista.plano.altoPx}
            metrosPorPx={mpp}
            enfocar={enfocar}
            alPulsar={() => { setSel(null); setCercanos(null); }}
            hijos={(escala) => (
              <>
                <ZonasDelPlano zonas={zonas} escala={escala} elegida={zonaSel} onElegir={(id) => elegirZona(zonaSel === id ? null : id)} />
                {capaRiesgo && (
                  <RiesgosDelPlano areas={areas} zonas={zonas as any} escala={escala} elegida={riesgoSel}
                    onElegir={(id) => { setSel(null); setZonaSel(null); setCercanos(null); setRiesgoSel(riesgoSel === id ? null : id); }} />
                )}
                {capaCables && (
                  <CablesDelPlano cables={cables} enlaces={vista.enlaces ?? []} escala={escala} resaltar={resaltados}
                    onPulsar={(c) => { setCercanos(null); setRiesgoSel(null); setSel(c.assetId); setResaltar(new Set([c.assetId])); }} />
                )}
                {conos && visibles.filter((e) => e.tipo === 'CAMERA').map((e) => (
                  <ConoDeVision key={'c' + e.assetId} e={e} metrosPorPx={mpp} />
                ))}
                {caen && visibles.filter((e) => caen.ids.has(e.assetId)).map((e) => (
                  <circle key={'i' + e.assetId} cx={e.xPx} cy={e.yPx} r={26 * escala} className="impacto-halo" />
                ))}
                {/* Lo que tiene problema se dibuja ENCIMA (en SVG manda el
                    orden): un punto rojo no puede quedar tapado por uno verde. */}
                {[...visibles].sort((a, b) => (ORDEN[b.estado] ?? 9) - (ORDEN[a.estado] ?? 9)
                  || Number(a.assetId === sel) - Number(b.assetId === sel)).map((e) => (
                  <Marcador key={e.assetId} e={e} escala={escala} seleccionado={sel === e.assetId}
                    conEtiqueta={etiquetas} onPulsar={(x, y) => pulsarPunto(e, escala, x, y)} />
                ))}
                {aqui && vista?.plano?.id === aqui.planoId && <EstasAqui x={aqui.xPx} y={aqui.yPx} escala={escala} />}
              </>
            )}
          />
        ) : (
          <div className="card" style={{ padding: 24 }}>Cargando el plano…</div>
        )}

        <div className="mapa-panel" ref={panel}>
          {cercanos && !elegido ? (
            <aside className="tarjeta-mapa">
              <header className="tarjeta-mapa-cab">
                <h2>Aquí hay {cercanos.length} equipos</h2>
                <button type="button" className="tarjeta-mapa-cerrar" aria-label="Cerrar" onClick={() => setCercanos(null)}>×</button>
              </header>
              <div className="tarjeta-mapa-cuerpo">
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>Están muy juntos en el plano. Elige cuál:</p>
                <ul className="mapa-lista">
                  {cercanos.map((e) => (
                    <li key={e.assetId}>
                      <button type="button" onClick={() => irA(e)}>
                        <IconoEquipo e={e} tam={20} /> <b>{e.codigo}</b>
                        <span className="muted">{e.referencia || e.estadoTexto}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          ) : elegido ? (
            <TarjetaEquipo key={elegido.assetId} e={elegido}
              cable={cables.find((c) => c.assetId === elegido.assetId) ?? null}
              cablesDelSwitch={cables.filter((c) => c.switchId === elegido.assetId)}
              onCerrar={() => { setSel(null); setResaltar(null); }}
              onPuerto={(id) => setResaltar(id ? new Set([id]) : new Set([elegido.assetId]))}
              onReportado={() => { cargarVista(planoId).then((r) => { if (r) setVista(r); }); }} />
          ) : riesgo ? (
            <aside className="tarjeta-mapa">
              <header className={'tarjeta-mapa-cab riesgo-cab riesgo-' + riesgo.nivel}>
                <span className="tarjeta-mapa-tipo">{NIVEL[riesgo.nivel]?.icono} {NIVEL[riesgo.nivel]?.texto}</span>
                <h2>{riesgo.nombre}</h2>
                <button type="button" className="tarjeta-mapa-cerrar" aria-label="Cerrar" onClick={() => setRiesgoSel(null)}>×</button>
              </header>
              <div className="tarjeta-mapa-cuerpo">
                <p style={{ margin: 0 }}>{riesgo.motivo}</p>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>{NIVEL[riesgo.nivel]?.ayuda}</p>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                  {`Marcada${riesgo.dibujadoPor ? ` por ${riesgo.dibujadoPor}` : ''}. Todo equipo dentro la exige al abrir su orden.`}
                </p>
              </div>
            </aside>
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
                {avisos.length > 0 && (
                  <details className="mapa-norma" open={avisos.some((a) => a.gravedad === 'grave')}>
                    <summary>{`Fuera de norma (${avisos.length})`}</summary>
                    <ul className="mapa-lista">
                      {avisos.map((a, i) => (
                        <li key={a.clave + (a.assetId ?? '') + i}>
                          <button type="button" className={'norma-' + a.gravedad}
                            onClick={() => {
                              const e = a.assetId ? equipos.find((x) => x.assetId === a.assetId) : null;
                              if (e) irA(e); else setEnfocar({ x: a.xPx, y: a.yPx, n: Date.now() });
                            }}>
                            <i aria-hidden="true" /> <span>{a.texto}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {capaRiesgo && nivelesEnPlano.length > 0 && (
                  <details className="mapa-iconos">
                    <summary>Qué es cada borde</summary>
                    <ul>
                      {NIVELES.filter((n) => nivelesEnPlano.includes(n.nivel)).map((n) => (
                        <li key={n.nivel}><span className={'riesgo-chip riesgo-' + n.nivel}>{n.icono} {n.texto}</span><span className="muted">{n.ayuda}</span></li>
                      ))}
                    </ul>
                  </details>
                )}
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

/** Bloque 177 · un botón de capa: redondo, encendido o apagado. */
function Capa({ on, set, icono, texto, ayuda }: { on: boolean; set: (v: boolean) => void; icono: string; texto: string; ayuda: string }) {
  return (
    <button type="button" className={'mapa-capa-btn' + (on ? ' on' : '')} aria-pressed={on} title={ayuda} onClick={() => set(!on)}>
      <span aria-hidden="true">{icono}</span> {texto}
    </button>
  );
}

