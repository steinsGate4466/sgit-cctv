import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
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
 */
type Modo = 'colocar' | 'calibrar' | 'apuntar' | 'mover' | 'zona';

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
  const { confirmar, avisar } = useDialogos();
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
  const archivado = plano?.estado === 'ARCHIVADO';
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
    return fuera;
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
      <p className="muted" style={{ margin: '0 0 12px' }}>
        Sube el plano de un área, calibra la escala, coloca los equipos y publícalo. Lo publicado se ve en el <Link to="/mapa">Mapa</Link>.
      </p>

      <div className="planos-cabecera">
        <table className="tabla">
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
        </table>

        <form className="card" onSubmit={subir}>
          <div className="section-title">Subir un plano</div>
          <label>Zona
            <select required value={subida.locationId} onChange={(e) => setSubida({ ...subida, locationId: e.target.value })}>
              <option value="">— elige —</option>
              {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
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
          <div className="planos-herramientas">
            <b>{plano.nombre} · v{plano.version}</b>
            <span className="muted">{ESTADO_ES[plano.estado]}{plano.metrosPorPx ? ` · ${(plano.anchoPx * plano.metrosPorPx).toFixed(0)} × ${(plano.altoPx * plano.metrosPorPx).toFixed(0)} m` : ' · sin calibrar'}</span>
            {!archivado && (
              <>
                <button type="button" className={'btn-mini' + (modo === 'calibrar' ? ' activo' : '')} onClick={() => { setModo('calibrar'); setPuntos([]); }}>1 · Calibrar</button>
                <button type="button" className={'btn-mini' + (modo === 'colocar' ? ' activo' : '')} onClick={() => setModo('colocar')}>2 · Colocar</button>
                <button type="button" className={'btn-mini' + (modo === 'zona' ? ' activo' : '')} onClick={() => { setModo('zona'); setSel(null); setZonaPuntos([]); }}>Zonas</button>
                {plano.estado === 'BORRADOR' && <button type="button" className="btn-primary" disabled={ocupado} onClick={publicar}>3 · Publicar</button>}
              </>
            )}
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
          {modo === 'apuntar' && <div className="aviso-mapa" style={{ marginBottom: 8 }}>Toca lo que vigila la cámara: de ahí salen hacia dónde mira y su alcance.</div>}
          {modo === 'mover' && <div className="aviso-mapa" style={{ marginBottom: 8 }}>Toca el nuevo sitio del equipo.</div>}
          {paraColocar && modo === 'colocar' && <div className="aviso-mapa" style={{ marginBottom: 8 }}>Toca el plano donde está el equipo.</div>}

          <div className="mapa-escenario">
            <LienzoPlano
              imagenUrl={imagen}
              anchoPx={plano.anchoPx}
              altoPx={plano.altoPx}
              metrosPorPx={plano.metrosPorPx}
              alPulsar={alPulsar}
              hijos={(escala) => (
                <>
                  <ZonasDelPlano zonas={zonas} escala={escala} elegida={null}
                    onElegir={(id) => { if (modo === 'zona') { const z = zonas.find((q) => q.id === id); if (z) { setZonaLoc(z.locationId); setZonaPuntos(z.puntos); } } }} />
                  {zonaPuntos.length > 0 && (
                    <polygon points={zonaPuntos.map((p) => p.join(',')).join(' ')} className="zona-borrador" style={{ strokeWidth: 2 * escala }} />
                  )}
                  {zonaPuntos.map(([x, y], i) => (
                    <g key={'z' + i} transform={`translate(${x} ${y}) scale(${escala})`}><circle r={5} className="punto-calibrar" /></g>
                  ))}
                  {equipos.filter((e) => e.tipo === 'CAMERA').map((e) => <ConoDeVision key={'c' + e.assetId} e={e} metrosPorPx={plano.metrosPorPx} />)}
                  {equipos.map((e) => (
                    <Marcador key={e.assetId} e={e} escala={escala} seleccionado={sel === e.assetId} conEtiqueta
                      onPulsar={() => { if (modo === 'colocar') setSel(e.assetId); }} />
                  ))}
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
              {modo === 'zona' ? (
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
                    {!deLaZona.length && <p className="muted">Crea en Ubicaciones las salas o áreas que cuelgan de esta zona.</p>}
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
