import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import Asa from '../components/mapa/Asa';
import RiesgosDelPlano from '../components/mapa/RiesgosDelPlano';
import CablesDelPlano, { Cable } from '../components/mapa/CablesDelPlano';
import { NIVEL, NIVELES } from '../components/mapa/riesgos';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useDialogos } from '../components/Dialogos';
import { mensajeDeError, queFalta } from '../avisos';
import BotonConMotivo from '../components/BotonConMotivo';
import { fecha } from '../fechas';
import { NOMBRE_DE_TIPO } from '../tipos-de-equipo';
import LienzoPlano from '../components/mapa/LienzoPlano';
import Marcador, { ConoDeVision } from '../components/mapa/Marcador';
import ZonasDelPlano, { Zona } from '../components/mapa/ZonasDelPlano';
import { OpcionesDeUbicacion, tiposPara } from '../ubicaciones';

/**
 * PLANOS — bloque 151. Donde Mantenimiento prepara el mapa.
 *
 * Los pasos, en el orden en que se hacen:
 *   1. SUBIR el plano de un área (PNG o SVG exportado de AutoCAD).
 *   2. CALIBRAR: dos puntos con distancia real conocida → metros por píxel.
 *   3. COLOCAR cada equipo de la lista «sin colocar» tocando el plano; a las
 *      cámaras se les marca hacia dónde miran tocando el punto que vigilan.
 *   4. PUBLICAR: pasa a ser el plano de esa zona; el anterior queda archivado.
 *
 * Todo con `location.manage`. Lo que se ve en el Mapa sale de aquí.
 *
 * BLOQUE 176 · EL MAPA REGULA. Dos herramientas más, y un cambio de quién:
 *   · RIESGO: se arrastra en el plano para marcar un área (alto riesgo,
 *     eléctrico, altura, calor, zona vital), con nombre y MOTIVO; luego se
 *     jalan sus esquinas para ajustarla. Todo equipo dentro la hereda en su
 *     perfil de seguridad: la orden no se abre sin marcarla.
 *   · CABLEADO: la línea del switch a cada equipo sale de los puertos
 *     declarados; aquí sólo se le da FORMA tocando por dónde va y jalando
 *     los quiebres. Los metros cambian en vivo.
 *   · Los equipos se MUEVEN jalándolos.
 * Escribe sólo quien tiene `location.manage` Y `wo.approve` (el Jefe de
 * Mantenimiento, decisión del usuario). Cada cambio queda auditado con su antes.
 */
type Modo = 'colocar' | 'calibrar' | 'apuntar' | 'mover' | 'zona' | 'riesgo' | 'cable';
type P = [number, number];
const largo = (l: P[]) => l.reduce((t, p, i) => (i ? t + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0);

const ESTADO_ES: Record<string, string> = { BORRADOR: 'Borrador', PUBLICADO: 'Publicado', ARCHIVADO: 'Archivado' };

/** Mide la imagen en el navegador. Un SVG sin tamaño se mide por su viewBox. */
async function medir(archivo: File): Promise<{ ancho: number; alto: number }> {
  if (archivo.type === 'image/svg+xml' || archivo.name.toLowerCase().endsWith('.svg')) {
    const txt = await archivo.text();
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(txt);
    if (vb) return { ancho: Math.round(Number(vb[1])), alto: Math.round(Number(vb[2])) };
  }
  const url = URL.createObjectURL(archivo);
  try {
    return await new Promise((ok, mal) => {
      const img = new Image();
      img.onload = () => ok({ ancho: img.naturalWidth, alto: img.naturalHeight });
      img.onerror = () => mal(new Error('No se pudo leer la imagen.'));
      img.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

export default function PlanosEditor() {
  const { confirmar, avisar, pedirTexto } = useDialogos();
  const { can } = useAuth();
  const puedeEditar = can('location.manage') && can('wo.approve');
  /* Bloque 176 · el área de riesgo que se dibuja o corrige, y el cable que se traza. */
  const [riesgoEd, setRiesgoEd] = useState<{ id: string | null; nivel: string; nombre: string; motivo: string; puntos: P[] } | null>(null);
  const inicioRect = useRef<P | null>(null);
  const [cableSel, setCableSel] = useState<string | null>(null);
  const [cablePuntos, setCablePuntos] = useState<P[]>([]);
  const [arrastreEq, setArrastreEq] = useState<{ assetId: string; x: number; y: number } | null>(null);
  /* Bloque 177 · los códigos de TODOS los equipos se encimaban: por defecto sólo el elegido. */
  const [codigos, setCodigos] = useState(false);
  const [planos, setPlanos] = useState<any[]>([]);
  const [ubicaciones, setUbicaciones] = useState<any[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [vista, setVista] = useState<any>(null);
  const [imagen, setImagen] = useState<string | null>(null);
  const [sinColocar, setSinColocar] = useState<any>(null);
  const [modo, setModo] = useState<Modo>('colocar');
  const [paraColocar, setParaColocar] = useState<string>('');
  const [sel, setSel] = useState<string | null>(null);
  const [puntos, setPuntos] = useState<{ x: number; y: number }[]>([]);
  const [metros, setMetros] = useState('');
  const [buscar, setBuscar] = useState('');
  const [subida, setSubida] = useState({ nombre: '', locationId: '' });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /* Bloque 165 · dibujar zonas: se elige la ubicación (sala, púlpito…) y se
     tocan las esquinas en el plano. */
  const [zonaLoc, setZonaLoc] = useState('');
  const [zonaPuntos, setZonaPuntos] = useState<[number, number][]>([]);

  const cargarLista = useCallback(async () => {
    const r = await api.get('/planos').then((x) => x.data).catch(() => []);
    setPlanos(Array.isArray(r) ? r : []);
  }, []);
  useEffect(() => { cargarLista(); }, [cargarLista]);
  useEffect(() => {
    let vivo = true;
    api.get('/locations').then((r) => { if (vivo) setUbicaciones(r.data?.items || r.data || []); }).catch(() => { if (vivo) setUbicaciones([]); });
    return () => { vivo = false; };
  }, []);

  const cargarPlano = useCallback(async (id: string) => {
    const [v, s] = await Promise.all([
      api.get(`/planos/${id}/vista`).then((x) => x.data).catch(() => null),
      api.get(`/planos/${id}/sin-colocar`).then((x) => x.data).catch(() => null),
    ]);
    setVista(v); setSinColocar(s);
  }, []);
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    let url: string | null = null;
    cargarPlano(abierto);
    api.get(`/planos/${abierto}/imagen`, { responseType: 'blob' })
      .then((r) => { if (!vivo) return; url = URL.createObjectURL(r.data); setImagen(url); })
      .catch(() => { if (vivo) setImagen(null); });
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [abierto, cargarPlano]);

  const plano = vista?.plano;
  const equipos: any[] = useMemo(() => vista?.equipos ?? [], [vista]);
  const elegido = sel ? equipos.find((e) => e.assetId === sel) : null;
  const archivado = plano?.estado === 'ARCHIVADO' || !puedeEditar;
  const zonas: Zona[] = useMemo(() => vista?.zonas ?? [], [vista]);
  /* Las ubicaciones que pueden ser zona de este plano: las que cuelgan de la
     suya (no ella misma). Lo vuelve a comprobar el servidor. */
  const deLaZona = useMemo(() => {
    if (!plano?.locationId) return [];
    const hijos = new Map<string, any[]>();
    for (const u of ubicaciones) if (u.parentId) hijos.set(u.parentId, [...(hijos.get(u.parentId) ?? []), u]);
    const fuera: any[] = [];
    const pila = [...(hijos.get(plano.locationId) ?? [])];
    while (pila.length) { const u = pila.shift()!; fuera.push(u); pila.push(...(hijos.get(u.id) ?? [])); }
    /* Bloque 172 · sin gabinetes (RACK): un gabinete es un punto, no una zona del plano. */
    return fuera.filter((u) => tiposPara('zonaDePlano').includes(String(u.type)));
  }, [ubicaciones, plano?.locationId]);

  async function guardarZona() {
    if (!zonaLoc || zonaPuntos.length < 3) { await avisar('Elige la ubicación y marca al menos 3 esquinas.'); return; }
    setOcupado(true);
    try {
      await api.put(`/planos/${abierto}/zonas/${zonaLoc}`, { puntos: zonaPuntos });
      setZonaPuntos([]); setZonaLoc('');
      await cargarPlano(abierto!);
    } catch (e) { await avisar(mensajeDeError(e, 'guardar la zona')); }
    finally { setOcupado(false); }
  }

  async function borrarZona(z: Zona) {
    if (!(await confirmar(`¿Borrar la zona «${z.nombre}» de este plano? La ubicación y sus equipos no se tocan.`))) return;
    setOcupado(true);
    try { await api.delete(`/planos/${abierto}/zonas/${z.locationId}`); await cargarPlano(abierto!); }
    catch (e) { await avisar(mensajeDeError(e, 'borrar la zona')); }
    finally { setOcupado(false); }
  }

  // ------------------------------------------------ bloque 176 · riesgo
  const areas: any[] = useMemo(() => vista?.riesgos ?? [], [vista]);
  const cables: Cable[] = useMemo(() => vista?.cables ?? [], [vista]);

  function nuevaArea() {
    setSel(null); setCableSel(null);
    setRiesgoEd({ id: null, nivel: 'ALTO_RIESGO', nombre: '', motivo: '', puntos: [] });
  }
  function editarArea(id: string) {
    const a = areas.find((x) => x.id === id);
    if (a) setRiesgoEd({ id: a.id, nivel: a.nivel, nombre: a.nombre, motivo: a.motivo, puntos: a.puntos.map((p: P) => [...p] as P) });
  }
  async function guardarArea() {
    if (!riesgoEd) return;
    setOcupado(true);
    try {
      const cuerpo = { nivel: riesgoEd.nivel, nombre: riesgoEd.nombre, motivo: riesgoEd.motivo, puntos: riesgoEd.puntos };
      if (riesgoEd.id) await api.put(`/planos/${abierto}/riesgos/${riesgoEd.id}`, cuerpo);
      else await api.post(`/planos/${abierto}/riesgos`, cuerpo);
      setRiesgoEd(null);
      await cargarPlano(abierto!);
    } catch (e) { await avisar(mensajeDeError(e, 'guardar el área de riesgo')); }
    finally { setOcupado(false); }
  }
  async function quitarArea() {
    if (!riesgoEd?.id) { setRiesgoEd(null); return; }
    const motivo = await pedirTexto({
      titulo: `Quitar «${riesgoEd.nombre}»`, mensaje: 'Quitar un área de riesgo es una decisión: queda en la auditoría con su motivo.',
      aceptar: 'Quitar', peligro: true, obligatorio: true,
    });
    if (!motivo || motivo.trim().length < 5) { if (motivo !== null) await avisar('Escribe el motivo (5 letras o más).'); return; }
    setOcupado(true);
    try { await api.post(`/planos/${abierto}/riesgos/${riesgoEd.id}/quitar`, { motivo }); setRiesgoEd(null); await cargarPlano(abierto!); }
    catch (e) { await avisar(mensajeDeError(e, 'quitar el área')); }
    finally { setOcupado(false); }
  }
  const moverVertice = (i: number, x: number, y: number) =>
    setRiesgoEd((r) => (r ? { ...r, puntos: r.puntos.map((p, k) => (k === i ? [Math.round(x), Math.round(y)] as P : p)) } : r));
  const insertarVertice = (i: number) =>
    setRiesgoEd((r) => {
      if (!r || r.puntos.length >= 60) return r;
      const a = r.puntos[i], b = r.puntos[(i + 1) % r.puntos.length];
      const m: P = [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
      return { ...r, puntos: [...r.puntos.slice(0, i + 1), m, ...r.puntos.slice(i + 1)] };
    });
  const quitarVertice = (i: number) =>
    setRiesgoEd((r) => (r && r.puntos.length > 3 ? { ...r, puntos: r.puntos.filter((_, k) => k !== i) } : r));

  // ------------------------------------------------ bloque 176 · cable
  const cableElegido = cableSel ? cables.find((c) => c.assetId === cableSel) ?? null : null;
  const extremos = (c: Cable | null) => {
    if (!c) return null;
    const sw = equipos.find((e) => e.assetId === c.switchId);
    const eq = equipos.find((e) => e.assetId === c.assetId);
    return sw && eq ? { sw: [sw.xPx, sw.yPx] as P, eq: [eq.xPx, eq.yPx] as P } : null;
  };
  const ext = extremos(cableElegido);
  /* Sin quiebres, en L como lo estima el servidor (por bandeja, no en diagonal):
     si no, al elegir un cable los metros saltarían sin haber tocado nada. */
  const lineaViva: P[] = !ext ? [] : cablePuntos.length ? [ext.sw, ...cablePuntos, ext.eq] : [ext.sw, [ext.eq[0], ext.sw[1]], ext.eq];
  const metrosVivos = plano?.metrosPorPx && lineaViva.length ? Math.round(largo(lineaViva) * plano.metrosPorPx) : null;
  function elegirCable(c: Cable) {
    setSel(null); setRiesgoEd(null);
    setCableSel(c.assetId); setCablePuntos(c.puntos.map((p) => [...p] as P));
  }
  async function guardarCable(puntos: P[]) {
    if (!cableSel) return;
    setOcupado(true);
    try {
      const r = await api.put(`/planos/${abierto}/cables/${cableSel}`, { puntos });
      await cargarPlano(abierto!);
      setCablePuntos(puntos);
      if (r.data?.metros != null) await avisar(puntos.length ? `Trazado guardado: ${r.data.metros} m.` : `Vuelve al estimado: ${r.data.metros} m en L.`);
    } catch (e) { await avisar(mensajeDeError(e, 'guardar el trazado')); }
    finally { setOcupado(false); }
  }
  const insertarQuiebre = (i: number) => setCablePuntos((ps) => {
    if (!ext) return ps;
    // Sin quiebres, la esquina de la L pasa a ser un quiebre de verdad: así el «+» cae donde se ve.
    const base: P[] = ps.length ? ps : [[ext.eq[0], ext.sw[1]]];
    const l: P[] = [ext.sw, ...base, ext.eq];
    const a = l[i], b = l[i + 1];
    const m: P = [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
    return [...base.slice(0, i), m, ...base.slice(i)];
  });

  async function subir(ev: FormEvent) {
    ev.preventDefault();
    if (!archivo) { await avisar('Elige el archivo del plano.'); return; }
    setOcupado(true);
    try {
      const { ancho, alto } = await medir(archivo);
      const fd = new FormData();
      fd.append('archivo', archivo);
      fd.append('nombre', subida.nombre.trim() || archivo.name.replace(/\.[^.]+$/, ''));
      fd.append('locationId', subida.locationId);
      fd.append('anchoPx', String(ancho));
      fd.append('altoPx', String(alto));
      const r = await api.post('/planos', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setArchivo(null); setSubida({ nombre: '', locationId: '' });
      (ev.target as HTMLFormElement).reset();
      await cargarLista();
      setAbierto(r.data.id); setModo('calibrar');
      if (r.data.heredadas) await avisar(`Versión ${r.data.version}: se copiaron ${r.data.heredadas} posiciones de la anterior.`);
    } catch (e) { await avisar(mensajeDeError(e, 'subir el plano')); }
    finally { setOcupado(false); }
  }

  async function guardarEscala() {
    if (puntos.length < 2 || !Number(metros)) { await avisar('Marca dos puntos en el plano y escribe cuántos metros hay entre ellos.'); return; }
    setOcupado(true);
    try {
      const r = await api.patch(`/planos/${abierto}/calibrar`, {
        x1: puntos[0].x, y1: puntos[0].y, x2: puntos[1].x, y2: puntos[1].y, metros: Number(metros),
      });
      await avisar(`Escala guardada: el plano mide ${r.data.anchoM} × ${r.data.altoM} m.`);
      setPuntos([]); setMetros(''); setModo('colocar');
      await cargarPlano(abierto!); await cargarLista();
    } catch (e) { await avisar(mensajeDeError(e, 'calibrar')); }
    finally { setOcupado(false); }
  }

  async function guardarPosicion(assetId: string, datos: any) {
    setOcupado(true);
    try {
      await api.put(`/planos/${abierto}/posiciones/${assetId}`, datos);
      await cargarPlano(abierto!);
    } catch (e) { await avisar(mensajeDeError(e, 'guardar la posición')); }
    finally { setOcupado(false); }
  }

  const datosDe = (e: any) => ({
    xPx: e.xPx, yPx: e.yPx,
    alturaM: e.alturaM ?? undefined, rumbo: e.rumbo ?? undefined,
    anguloVision: e.anguloVision ?? undefined, alcanceM: e.alcanceM ?? undefined,
  });

  async function alPulsar(x: number, y: number) {
    if (archivado || ocupado) return;
    if (modo === 'calibrar') {
      setPuntos((p) => (p.length >= 2 ? [{ x, y }] : [...p, { x, y }]));
      return;
    }
    if (modo === 'zona') {
      setZonaPuntos((p) => (p.length >= 60 ? p : [...p, [Math.round(x), Math.round(y)]]));
      return;
    }
    if (modo === 'riesgo') return; // se dibuja ARRASTRANDO, no tocando
    if (modo === 'cable') {
      // Cada toque es un quiebre más, del switch hacia el equipo.
      if (cableSel) setCablePuntos((p) => (p.length >= 60 ? p : [...p, [Math.round(x), Math.round(y)]]));
      return;
    }
    if (modo === 'apuntar' && elegido) {
      // Hacia dónde mira y hasta dónde: el punto que se tocó es lo que vigila.
      const rumbo = Math.round((Math.atan2(y - elegido.yPx, x - elegido.xPx) * 180) / Math.PI);
      const alcanceM = plano?.metrosPorPx ? Math.max(1, Math.round(Math.hypot(x - elegido.xPx, y - elegido.yPx) * plano.metrosPorPx)) : undefined;
      await guardarPosicion(elegido.assetId, { ...datosDe(elegido), rumbo, alcanceM, anguloVision: elegido.anguloVision ?? 70 });
      setModo('colocar');
      return;
    }
    if (modo === 'mover' && elegido) {
      await guardarPosicion(elegido.assetId, { ...datosDe(elegido), xPx: Math.round(x), yPx: Math.round(y) });
      setModo('colocar');
      return;
    }
    if (paraColocar) {
      await guardarPosicion(paraColocar, { xPx: Math.round(x), yPx: Math.round(y) });
      setSel(paraColocar); setParaColocar('');
      return;
    }
    setSel(null);
  }

  async function quitar() {
    if (!elegido) return;
    if (!(await confirmar(`¿Quitar ${elegido.codigo} del plano? El equipo no se borra: vuelve a «sin colocar».`))) return;
    setOcupado(true);
    try { await api.delete(`/planos/${abierto}/posiciones/${elegido.assetId}`); setSel(null); await cargarPlano(abierto!); }
    catch (e) { await avisar(mensajeDeError(e, 'quitar')); }
    finally { setOcupado(false); }
  }

  async function publicar() {
    if (!(await confirmar('¿Publicar este plano? Pasa a ser el mapa de su zona y la versión anterior queda archivada.'))) return;
    setOcupado(true);
    try { await api.post(`/planos/${abierto}/publicar`); await cargarPlano(abierto!); await cargarLista(); await avisar('Publicado. Ya se ve en el Mapa.'); }
    catch (e) { await avisar(mensajeDeError(e, 'publicar')); }
    finally { setOcupado(false); }
  }

  const pendientes = (sinColocar?.items ?? []).filter((a: any) =>
    !buscar.trim() || `${a.assetCode} ${a.referencePlace || ''}`.toLowerCase().includes(buscar.trim().toLowerCase()));

  return (
    <div className="page">
      <h1 className="page-title">Planos</h1>
      <p className="muted" style={{ margin: '0 0 12px' }} title="Sube el plano de un área, calibra la escala, coloca los equipos, marca el riesgo y el cableado, y publícalo.">
        Lo publicado se ve en el <Link to="/mapa">Mapa</Link>.
      </p>

      <div className="planos-cabecera">
        <div className="desliza"><table className="tabla">
          <thead><tr><th>Plano</th><th>Zona</th><th>Versión</th><th>Estado</th><th>Equipos</th><th></th></tr></thead>
          <tbody>
            {planos.map((p) => (
              <tr key={p.id} className={abierto === p.id ? 'fila-activa' : undefined}>
                <td><b>{p.nombre}</b><div className="muted" style={{ fontSize: 11 }}>{fecha(p.creadoEn)}{p.metrosPorPx ? '' : ' · sin calibrar'}</div></td>
                <td>{p.location?.name}</td>
                <td>v{p.version}</td>
                <td>{ESTADO_ES[p.estado] || p.estado}</td>
                <td>{p.equiposColocados}</td>
                <td><button type="button" className="btn-mini" onClick={() => { setAbierto(p.id); setSel(null); setModo(p.metrosPorPx ? 'colocar' : 'calibrar'); }}>Abrir</button></td>
              </tr>
            ))}
            {!planos.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>Todavía no hay planos.</td></tr>}
          </tbody>
        </table></div>

        <form className="card" onSubmit={subir}>
          <div className="section-title">Subir un plano</div>
          <label>Zona
            <select required value={subida.locationId} onChange={(e) => setSubida({ ...subida, locationId: e.target.value })}>
              <option value="">— elige —</option>
              <OpcionesDeUbicacion uso="plano" lista={ubicaciones} actual={subida.locationId} />
            </select>
          </label>
          <label>Nombre
            <input value={subida.nombre} maxLength={120} placeholder="Ej.: Nave de laminación, planta baja"
              onChange={(e) => setSubida({ ...subida, nombre: e.target.value })} />
          </label>
          <label>Archivo (PNG, JPG o SVG exportado de AutoCAD)
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          </label>
          <button className="btn-primary" disabled={ocupado}>{ocupado ? 'Subiendo…' : 'Subir'}</button>
        </form>
      </div>

      {abierto && plano && (
        <>
          {/* Bloque 177 · las herramientas como PESTAÑAS en una sola barra redondeada. */}
          <div className="planos-herramientas">
            <div className="planos-titulo">
              <b>{plano.nombre} · v{plano.version}</b>
              <span className="muted">{ESTADO_ES[plano.estado]}{plano.metrosPorPx ? ` · ${(plano.anchoPx * plano.metrosPorPx).toFixed(0)} × ${(plano.altoPx * plano.metrosPorPx).toFixed(0)} m` : ' · sin calibrar'}</span>
            </div>
            {!archivado && (
              <div className="planos-pestanas" role="tablist" aria-label="Herramienta">
                {([
                  ['calibrar', '📏', 'Calibrar', 'Dos puntos con distancia real: da la escala', () => { setModo('calibrar'); setPuntos([]); }],
                  ['colocar', '📍', 'Colocar', 'Poner y jalar los equipos en su sitio', () => setModo('colocar')],
                  ['zona', '▦', 'Zonas', 'Las salas y áreas del plano', () => { setModo('zona'); setSel(null); setZonaPuntos([]); }],
                  ['riesgo', '⚠', 'Riesgo', 'Áreas de alto riesgo, eléctricas, de altura, calor o zona vital', () => { setModo('riesgo'); setSel(null); setCableSel(null); setRiesgoEd(null); }],
                  ['cable', '⌇', 'Cableado', 'Dar forma al cable de cada equipo hasta su switch', () => { setModo('cable'); setSel(null); setRiesgoEd(null); setCableSel(null); }],
                ] as [Modo, string, string, string, () => void][]).map(([m, ic, t, ayuda, ir]) => (
                  <button key={m} type="button" role="tab" aria-selected={modo === m} title={ayuda}
                    className={modo === m ? 'activo' : undefined} onClick={ir}>
                    <span aria-hidden="true">{ic}</span> {t}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className={'mapa-capa-btn' + (codigos ? ' on' : '')} aria-pressed={codigos}
              title="Ver el código de todos los equipos" onClick={() => setCodigos(!codigos)}># Códigos</button>
            {!archivado && plano.estado === 'BORRADOR' && <button type="button" className="btn-primary" disabled={ocupado} onClick={publicar}>Publicar</button>}
          </div>

          {modo === 'calibrar' && !archivado && (
            <div className="aviso-mapa" style={{ marginBottom: 8 }}>
              Toca dos puntos del plano cuya distancia real conozcas (ej. dos ejes de columnas).
              {' '}Marcados: {puntos.length}/2.
              <input type="number" min={0.1} step="any" value={metros} placeholder="metros" aria-label="Distancia real en metros"
                style={{ width: 110, marginLeft: 8 }} onChange={(e) => setMetros(e.target.value)} />
              <BotonConMotivo className="btn-mini" ocupado={ocupado} onClick={guardarEscala} style={{ marginLeft: 8 }}
                falta={queFalta([puntos.length < 2, 'Toca dos puntos del plano.'], [!Number(metros), 'Escribe la distancia real en metros.'])}>
                Guardar escala
              </BotonConMotivo>
            </div>
          )}
          {modo === 'zona' && !archivado && (
            <div className="aviso-mapa" style={{ marginBottom: 8 }}>
              <select aria-label="Ubicación de la zona" value={zonaLoc} onChange={(e) => setZonaLoc(e.target.value)} style={{ width: 'auto', marginRight: 8 }}>
                <option value="">— ubicación —</option>
                {deLaZona.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              {`Esquinas: ${zonaPuntos.length}`}
              <button type="button" className="btn-mini" style={{ marginLeft: 8 }} disabled={!zonaPuntos.length} title="Quita la última esquina marcada" onClick={() => setZonaPuntos((p) => p.slice(0, -1))}>Deshacer</button>
              <BotonConMotivo className="btn-mini" ocupado={ocupado} onClick={guardarZona} style={{ marginLeft: 8 }}
                falta={queFalta([!zonaLoc, 'Elige la ubicación de la zona.'], [zonaPuntos.length < 3, 'Toca al menos 3 esquinas en el plano.'])}>
                Guardar zona
              </BotonConMotivo>
            </div>
          )}
          {modo === 'riesgo' && !archivado && (
            <div className="aviso-mapa" style={{ marginBottom: 8 }}>
              {!riesgoEd ? 'Elige un área o crea una nueva.'
                : !riesgoEd.puntos.length ? 'Arrastra en el plano para marcar el área.'
                  : 'Jala las esquinas. «+» añade una; tocarla la quita.'}
            </div>
          )}
          {modo === 'cable' && !archivado && (
            <div className="aviso-mapa" style={{ marginBottom: 8 }}>
              {!cableSel ? 'Elige un cable.'
                : 'Toca por dónde va; jala o toca los quiebres.'}
            </div>
          )}
          {!puedeEditar && (
            <div className="aviso-mapa" style={{ marginBottom: 8 }} title="Dibujar, mover y trazar cambia lo que se exige al abrir una orden: lo decide el ingeniero.">Sólo el Jefe de Mantenimiento edita los planos.</div>
          )}
          {modo === 'apuntar' && <div className="aviso-mapa" style={{ marginBottom: 8 }}>Toca lo que vigila la cámara.</div>}
          {modo === 'mover' && <div className="aviso-mapa" style={{ marginBottom: 8 }}>Toca el nuevo sitio del equipo.</div>}
          {paraColocar && modo === 'colocar' && <div className="aviso-mapa" style={{ marginBottom: 8 }}>Toca el plano donde está el equipo.</div>}

          <div className="mapa-escenario">
            <LienzoPlano
              imagenUrl={imagen}
              anchoPx={plano.anchoPx}
              altoPx={plano.altoPx}
              metrosPorPx={plano.metrosPorPx}
              alPulsar={alPulsar}
              alArrastrar={modo === 'riesgo' && riesgoEd && !riesgoEd.puntos.length && !archivado ? {
                inicio: (x, y) => { inicioRect.current = [Math.round(x), Math.round(y)]; },
                mover: (x, y) => {
                  const a = inicioRect.current; if (!a) return;
                  const b: P = [Math.round(x), Math.round(y)];
                  setRiesgoEd((r) => (r ? { ...r, puntos: [a, [b[0], a[1]], b, [a[0], b[1]]] } : r));
                },
                fin: () => {
                  inicioRect.current = null;
                  // Un toque sin arrastrar no es un área.
                  setRiesgoEd((r) => (r && r.puntos.length === 4 && Math.abs(r.puntos[2][0] - r.puntos[0][0]) * Math.abs(r.puntos[2][1] - r.puntos[0][1]) < 200 ? { ...r, puntos: [] } : r));
                },
              } : null}
              hijos={(escala, aPlano) => (
                <>
                  <RiesgosDelPlano areas={areas.filter((a) => a.id !== riesgoEd?.id)} zonas={zonas as any} escala={escala}
                    onElegir={modo === 'riesgo' && !archivado ? (id) => { setCableSel(null); editarArea(id); } : undefined}
                    borrador={riesgoEd && riesgoEd.puntos.length ? { nivel: riesgoEd.nivel, puntos: riesgoEd.puntos } : null} />
                  {modo === 'riesgo' && riesgoEd && riesgoEd.puntos.length > 2 && !archivado && (
                    <>
                      {riesgoEd.puntos.map((p, i) => {
                        const q = riesgoEd.puntos[(i + 1) % riesgoEd.puntos.length];
                        return <Asa key={'m' + i} x={(p[0] + q[0]) / 2} y={(p[1] + q[1]) / 2} escala={escala} aPlano={aPlano} radio={4}
                          clase="asa-medio" etiqueta="Añadir una esquina aquí" onPulsar={() => insertarVertice(i)} />;
                      })}
                      {riesgoEd.puntos.map((p, i) => (
                        <Asa key={'v' + i} x={p[0]} y={p[1]} escala={escala} aPlano={aPlano} etiqueta={`Esquina ${i + 1}`}
                          onMover={(x, y) => moverVertice(i, x, y)} onSoltar={(x, y) => moverVertice(i, x, y)} onPulsar={() => quitarVertice(i)} />
                      ))}
                    </>
                  )}
                  <CablesDelPlano cables={modo === 'cable' ? cables.filter((c) => c.assetId !== cableSel) : cables}
                    enlaces={vista?.enlaces ?? []} escala={escala}
                    resaltar={modo === 'cable' ? null : sel ? new Set([sel]) : null}
                    onPulsar={modo === 'cable' && !archivado && !cableSel ? elegirCable : undefined} />
                  {modo === 'cable' && cableElegido && ext && (
                    <>
                      <polyline points={lineaViva.map((p) => p.join(',')).join(' ')} className="cable-editando" style={{ strokeWidth: 4 * escala }} />
                      {metrosVivos != null && (
                        <text x={lineaViva[Math.floor(lineaViva.length / 2)][0]} y={lineaViva[Math.floor(lineaViva.length / 2)][1] - 8 * escala}
                          style={{ fontSize: 13 * escala }} textAnchor="middle" className={'cable-metros' + (!cableElegido.esEnlace && metrosVivos > (vista?.topeUtpM ?? 90) ? ' fuera' : '')}>
                          {`${metrosVivos} m`}
                        </text>
                      )}
                      {!archivado && lineaViva.slice(0, -1).map((p, i) => {
                        const q = lineaViva[i + 1];
                        return <Asa key={'cm' + i} x={(p[0] + q[0]) / 2} y={(p[1] + q[1]) / 2} escala={escala} aPlano={aPlano} radio={4}
                          clase="asa-medio" etiqueta="Añadir un quiebre aquí" onPulsar={() => insertarQuiebre(i)} />;
                      })}
                      {!archivado && cablePuntos.map((p, i) => (
                        <Asa key={'c' + i} x={p[0]} y={p[1]} escala={escala} aPlano={aPlano} etiqueta={`Quiebre ${i + 1}`} clase="asa-cable"
                          onMover={(x, y) => setCablePuntos((ps) => ps.map((q, k) => (k === i ? [Math.round(x), Math.round(y)] as P : q)))}
                          onPulsar={() => setCablePuntos((ps) => ps.filter((_, k) => k !== i))} />
                      ))}
                    </>
                  )}
                  <ZonasDelPlano zonas={zonas} escala={escala} elegida={null} interactiva={modo === 'zona'}
                    onElegir={(id) => { if (modo === 'zona') { const z = zonas.find((q) => q.id === id); if (z) { setZonaLoc(z.locationId); setZonaPuntos(z.puntos); } } }} />
                  {zonaPuntos.length > 0 && (
                    <polygon points={zonaPuntos.map((p) => p.join(',')).join(' ')} className="zona-borrador" style={{ strokeWidth: 2 * escala }} />
                  )}
                  {zonaPuntos.map(([x, y], i) => (
                    <g key={'z' + i} transform={`translate(${x} ${y}) scale(${escala})`}><circle r={5} className="punto-calibrar" /></g>
                  ))}
                  {equipos.filter((e) => e.tipo === 'CAMERA').map((e) => <ConoDeVision key={'c' + e.assetId} e={e} metrosPorPx={plano.metrosPorPx} />)}
                  {equipos.map((e) => {
                    const q = arrastreEq?.assetId === e.assetId ? { ...e, xPx: arrastreEq.x, yPx: arrastreEq.y } : e;
                    return (
                      <Marcador key={e.assetId} e={q} escala={escala} seleccionado={sel === e.assetId} conEtiqueta={codigos || sel === e.assetId}
                        onPulsar={() => { if (modo === 'colocar') setSel(e.assetId); }} />
                    );
                  })}
                  {/* Bloque 176 · el equipo elegido se JALA a su nuevo sitio. */}
                  {modo === 'colocar' && elegido && !archivado && (
                    <Asa x={arrastreEq?.assetId === elegido.assetId ? arrastreEq.x : elegido.xPx}
                      y={arrastreEq?.assetId === elegido.assetId ? arrastreEq.y : elegido.yPx}
                      escala={escala} aPlano={aPlano} radio={22} clase="asa-equipo" etiqueta={`Jalar ${elegido.codigo} a otro sitio`}
                      onMover={(x, y) => setArrastreEq({ assetId: elegido.assetId, x: Math.round(x), y: Math.round(y) })}
                      onSoltar={async (x, y) => {
                        await guardarPosicion(elegido.assetId, { ...datosDe(elegido), xPx: Math.round(x), yPx: Math.round(y) });
                        setArrastreEq(null);
                      }} />
                  )}
                  {puntos.map((p, i) => (
                    <g key={i} transform={`translate(${p.x} ${p.y}) scale(${escala})`}>
                      <circle r={7} className="punto-calibrar" />
                    </g>
                  ))}
                  {puntos.length === 2 && <line x1={puntos[0].x} y1={puntos[0].y} x2={puntos[1].x} y2={puntos[1].y} className="linea-calibrar" style={{ strokeWidth: 2 * escala }} />}
                </>
              )}
            />

            <div className="mapa-panel">
              {modo === 'riesgo' ? (
                <aside className="tarjeta-mapa">
                  <header className="tarjeta-mapa-cab"><h2>{riesgoEd ? (riesgoEd.id ? 'Corregir área' : 'Nueva área de riesgo') : `Áreas de riesgo (${areas.length})`}</h2></header>
                  <div className="tarjeta-mapa-cuerpo">
                    {riesgoEd ? (
                      <>
                        <div className="chips-elegir" role="group" aria-label="Nivel del área">
                          {NIVELES.map((n) => (
                            <button key={n.nivel} type="button" title={n.ayuda} aria-pressed={riesgoEd.nivel === n.nivel}
                              className={riesgoEd.nivel === n.nivel ? 'activo' : undefined}
                              onClick={() => setRiesgoEd({ ...riesgoEd, nivel: n.nivel })}>{n.icono} {n.texto}</button>
                          ))}
                        </div>
                        <label>Nombre
                          <input value={riesgoEd.nombre} maxLength={80} placeholder="Ej.: Paso de grúa 2"
                            onChange={(ev) => setRiesgoEd({ ...riesgoEd, nombre: ev.target.value })} />
                        </label>
                        <label>Motivo
                          <textarea value={riesgoEd.motivo} maxLength={500} placeholder="Ej.: carga suspendida sobre el pasillo en cada cambio de rodillo"
                            onChange={(ev) => setRiesgoEd({ ...riesgoEd, motivo: ev.target.value })} />
                        </label>
                        <div className="tarjeta-mapa-acciones">
                          <BotonConMotivo className="btn-primary" ocupado={ocupado} onClick={guardarArea}
                            falta={queFalta([riesgoEd.puntos.length < 3, 'Arrastra en el plano para marcar el área.'],
                              [riesgoEd.nombre.trim().length < 3, 'Ponle nombre al área.'],
                              [riesgoEd.motivo.trim().length < 5, 'Di por qué es de riesgo.'])}>
                            Guardar
                          </BotonConMotivo>
                          {riesgoEd.puntos.length > 0 && <button type="button" className="btn-mini" onClick={() => setRiesgoEd({ ...riesgoEd, puntos: [] })}>Redibujar</button>}
                          {riesgoEd.id && <button type="button" className="btn-mini" onClick={quitarArea}>Quitar área</button>}
                          <button type="button" className="btn-mini" onClick={() => setRiesgoEd(null)}>Cancelar</button>
                        </div>
                      </>
                    ) : (
                      <>
                        {!archivado && <button type="button" className="btn-primary" onClick={nuevaArea}>+ Nueva área</button>}
                        <ul className="mapa-lista">
                          {areas.map((a) => (
                            <li key={a.id}>
                              <button type="button" onClick={() => !archivado && editarArea(a.id)}>
                                <span className={'riesgo-chip riesgo-' + a.nivel}>{NIVEL[a.nivel]?.icono} {NIVEL[a.nivel]?.texto}</span>
                                <b>{a.nombre}</b> <span className="muted">{a.motivo}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {!areas.length && <p className="muted" title="Las zonas que ya declaran su riesgo en Ubicaciones salen solas con su borde.">Ninguna área marcada.</p>}
                      </>
                    )}
                  </div>
                </aside>
              ) : modo === 'cable' ? (
                <aside className="tarjeta-mapa">
                  <header className="tarjeta-mapa-cab"><h2>{cableElegido ? `Cable de ${cableElegido.codigo}` : `Cables (${cables.length})`}</h2></header>
                  <div className="tarjeta-mapa-cuerpo">
                    {cableElegido ? (
                      <>
                        <p style={{ margin: 0 }}>{`${cableElegido.switchCodigo} · puerto ${cableElegido.puerto} → ${cableElegido.codigo}`}</p>
                        <p style={{ margin: 0 }}>
                          <b className={!cableElegido.esEnlace && metrosVivos != null && metrosVivos > (vista?.topeUtpM ?? 90) ? 'texto-grave' : undefined}>
                            {metrosVivos != null ? `${metrosVivos} m` : 'Sin escala'}
                          </b>
                          {` ${cablePuntos.length ? `· ${cablePuntos.length} quiebres` : '· en L (estimado)'}`}
                        </p>
                        {!cableElegido.esEnlace && metrosVivos != null && metrosVivos > (vista?.topeUtpM ?? 90) && (
                          <div className="aviso-mapa grave">Pasa de 90 m (TIA-568).</div>
                        )}
                        <div className="tarjeta-mapa-acciones">
                          <button type="button" className="btn-primary" disabled={ocupado || archivado} onClick={() => guardarCable(cablePuntos)}>Guardar trazado</button>
                          <button type="button" className="btn-mini" disabled={ocupado} onClick={() => setCablePuntos(cableElegido.puntos.map((p) => [...p] as P))}>Deshacer cambios</button>
                          {cableElegido.puntos.length > 0 && (
                            <button type="button" className="btn-mini" disabled={ocupado || archivado}
                              onClick={async () => { if (await confirmar('¿Borrar el trazado? Vuelve a la estimación en L.')) await guardarCable([]); }}>Volver al estimado</button>
                          )}
                          <button type="button" className="btn-mini" onClick={() => setCableSel(null)}>Cerrar</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <ul className="mapa-lista">
                          {cables.map((c) => (
                            <li key={c.assetId}>
                              <button type="button" className={c.fueraDeNorma ? 'norma-grave' : undefined} onClick={() => elegirCable(c)}>
                                <b>{c.codigo}</b>
                                <span className="muted">{`${c.switchCodigo}:${c.puerto} · ${c.metros ?? '?'} m ${c.estimado ? 'estimado' : 'trazado'}`}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {!cables.length && <p className="muted" title="Hace falta que el equipo y su switch estén colocados aquí y que el puerto esté declarado en Red › Conexiones.">Ningún cable para dibujar.</p>}
                      </>
                    )}
                  </div>
                </aside>
              ) : modo === 'zona' ? (
                <aside className="tarjeta-mapa">
                  <header className="tarjeta-mapa-cab"><h2>{`Zonas (${zonas.length})`}</h2></header>
                  <div className="tarjeta-mapa-cuerpo">
                    <ul className="mapa-lista">
                      {zonas.map((z) => (
                        <li key={z.id} className="zona-editor-fila">
                          <button type="button" onClick={() => { setZonaLoc(z.locationId); setZonaPuntos(z.puntos); }}>
                            <b>{z.nombre}</b> <span className="muted">{`${z.equipos.length} equipos`}</span>
                          </button>
                          {!archivado && <button type="button" className="btn-mini" onClick={() => borrarZona(z)}>Borrar</button>}
                        </li>
                      ))}
                    </ul>
                    {!deLaZona.length && <p className="muted" title="Crea en Ubicaciones las salas o áreas que cuelgan de esta zona.">Sin salas para dibujar.</p>}
                  </div>
                </aside>
              ) : elegido ? (
                <aside className="tarjeta-mapa">
                  <header className="tarjeta-mapa-cab"><span className="tarjeta-mapa-tipo">{NOMBRE_DE_TIPO[elegido.tipo] || elegido.tipo}</span><h2>{elegido.codigo}</h2>
                    <button type="button" className="tarjeta-mapa-cerrar" aria-label="Cerrar" onClick={() => setSel(null)}>×</button></header>
                  <div className="tarjeta-mapa-cuerpo">
                    <FichaDePosicion e={elegido} ocupado={ocupado || archivado}
                      onGuardar={(d) => guardarPosicion(elegido.assetId, { ...datosDe(elegido), ...d })} />
                    {!archivado && (
                      <div className="tarjeta-mapa-acciones">
                        <button type="button" className="btn-mini" onClick={() => setModo('mover')}>Mover</button>
                        {elegido.tipo === 'CAMERA' && <button type="button" className="btn-mini" disabled={!plano.metrosPorPx} onClick={() => setModo('apuntar')}>Apuntar</button>}
                        <button type="button" className="btn-mini" onClick={quitar}>Quitar del plano</button>
                      </div>
                    )}
                  </div>
                </aside>
              ) : (
                <aside className="tarjeta-mapa">
                  <header className="tarjeta-mapa-cab"><h2>Sin colocar ({sinColocar?.total ?? 0})</h2></header>
                  <div className="tarjeta-mapa-cuerpo">
                    <input placeholder="Buscar código o lugar" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar equipo sin colocar" />
                    {sinColocar && sinColocar.total > sinColocar.mostrados && (
                      <p className="muted" style={{ fontSize: 12 }}>Se muestran {sinColocar.mostrados} de {sinColocar.total}. Busca para encontrar el resto.</p>
                    )}
                    <ul className="mapa-lista">
                      {pendientes.map((a: any) => (
                        <li key={a.id}>
                          <button type="button" className={paraColocar === a.id ? 'activo' : undefined} disabled={archivado}
                            onClick={() => { setParaColocar(paraColocar === a.id ? '' : a.id); setModo('colocar'); }}>
                            <b>{a.assetCode}</b> <span className="muted">{NOMBRE_DE_TIPO[a.type] || a.type}{a.referencePlace ? ` · ${a.referencePlace}` : ''}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {sinColocar?.total === 0 && <p className="muted">Todos los equipos de esta zona están en el plano.</p>}
                  </div>
                </aside>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Altura, ángulo y alcance de un equipo colocado. */
function FichaDePosicion({ e, ocupado, onGuardar }: { e: any; ocupado: boolean; onGuardar: (d: any) => void }) {
  const [altura, setAltura] = useState(e.alturaM ?? '');
  const [angulo, setAngulo] = useState(e.anguloVision ?? '');
  const [alcance, setAlcance] = useState(e.alcanceM ?? '');
  useEffect(() => { setAltura(e.alturaM ?? ''); setAngulo(e.anguloVision ?? ''); setAlcance(e.alcanceM ?? ''); }, [e.assetId, e.alturaM, e.anguloVision, e.alcanceM]);
  const num = (v: any) => (v === '' || v === null ? undefined : Number(v));
  return (
    <div>
      <label>Altura de montaje (m)
        <input type="number" min={0} step="0.1" value={altura} onChange={(ev) => setAltura(ev.target.value)} />
      </label>
      {e.tipo === 'CAMERA' && (
        <>
          <label>Ángulo de visión (°)
            <input type="number" min={5} max={360} value={angulo} onChange={(ev) => setAngulo(ev.target.value)} />
          </label>
          <label>Alcance (m)
            <input type="number" min={1} max={500} value={alcance} onChange={(ev) => setAlcance(ev.target.value)} />
          </label>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>Rumbo: {e.rumbo != null ? `${e.rumbo}°` : 'sin marcar'} (usa «Apuntar»).</p>
        </>
      )}
      <button type="button" className="btn-mini" disabled={ocupado}
        onClick={() => onGuardar({ alturaM: num(altura), anguloVision: num(angulo), alcanceM: num(alcance) })}>Guardar datos</button>
    </div>
  );
}
