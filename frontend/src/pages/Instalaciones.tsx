import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import BotonPurgar from '../components/BotonPurgar';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';
import { useDialogos } from '../components/Dialogos';
import { fecha } from '../fechas';
import BotonConMotivo from '../components/BotonConMotivo';
import { mensajeDeError, queFalta } from '../avisos';

/**
 * INSTALACIONES — poner equipo NUEVO.
 *
 * LA IDEA QUE HACE QUE ESTO FUNCIONE:
 * **el formulario cambia según el sitio.** Instalar en un púlpito y en una
 * grúa no se parecen en nada, y un formulario único con cuarenta campos
 * consigue que el técnico rellene cuatro.
 *
 * Los campos que se enseñan salen del SERVIDOR (`/instalaciones/perfiles`),
 * no de una copia aquí. Si estuvieran duplicados, el día que se añada un
 * campo alguien actualizaría uno y no el otro, y el técnico no podría
 * guardar sin saber por qué.
 *
 * EL CICLO son cuatro pasos y cada uno lo hace alguien distinto:
 *   PIDE (quien la necesita) → VISITA Y MIDE (técnico) → APRUEBA (Jefe) →
 *   INSTALA, y ahí **nace el activo** en el inventario.
 */

const SITIO_ES: Record<string, string> = {
  OFICINA: 'Oficina', PULPITO: 'Púlpito', GRUA: 'Grúa puente',
  SALA_ELECTRICA: 'Sala eléctrica / MCC', NAVE: 'Nave de laminación',
  PATIO: 'Patio / intemperie', ALMACEN: 'Almacén', CASETA: 'Caseta',
  SUBESTACION: 'Subestación', LABORATORIO: 'Laboratorio', OTRO: 'Otro',
};
const EQUIPO_ES: Record<string, string> = {
  CAMERA: 'Cámara', NVR: 'Grabador (NVR)', SWITCH: 'Switch', WIRELESS: 'Antena / radioenlace',
  ROUTER: 'Router', FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', FIBER: 'Fibra',
  CABINET: 'Gabinete', DECODER: 'Decodificador', PC: 'PC de visualización',
  PANTALLA: 'Pantalla', OTHER: 'Otro',
};
const ESTADO_ES: Record<string, string> = {
  SOLICITADA: 'Solicitada', EN_EVALUACION: 'En evaluación', EVALUADA: 'Evaluada',
  APROBADA: 'Aprobada', RECHAZADA: 'Rechazada', EN_EJECUCION: 'En ejecución',
  INSTALADA: 'Instalada', CANCELADA: 'Cancelada',
};
const AMBIENTES: Record<string, string> = {
  CALOR_RADIANTE: 'Calor radiante (horno)', VAPOR_AGUA: 'Vapor y agua (tren)',
  POLVO_METALICO: 'Polvo metálico / cascarilla', INTEMPERIE_SALINA: 'Intemperie (patio)',
  EMI_ALTA: 'Sala eléctrica / MCC', CLIMATIZADO: 'Climatizado (púlpito)',
};

/** Campos que son sí/no, texto largo, número o lista. Decide qué control pintar. */
const BOOLEANOS = new Set([
  'hayEnergia', 'hayPuntoRed', 'necesitaPoe', 'necesitaManlift', 'necesitaAndamio',
  'necesitaParada', 'necesitaLoto', 'necesitaPermisoAltura', 'necesitaPermisoCaliente',
  'gruaSeDetiene', 'porCadenaPortacables', 'porAntena', 'hayLineaVista',
  'hayFalsoTecho', 'hayCanaleta', 'esClimatizado', 'necesitaGabineteEstanco',
]);
// `costoEstimado` fuera desde el bloque 47: aqui no se escriben soles.
const NUMEROS = new Set(['metrosCable', 'alturaMetros', 'distanciaEnlaceM', 'canalNvr']);
const LARGOS = new Set(['rutaCable', 'riesgos', 'materialesEstimados']);

export default function Instalaciones() {
  const { pedirTexto } = useDialogos();
  const { can, user } = useAuth();
  const puedeEvaluar = can('asset.update');
  const puedeDecidir = can('wo.approve');
  const puedeCerrar = can('asset.create');

  const [lista, setLista] = useState<any[]>([]);
  const [resumen, setResumen] = useState<any>(null);
  const [perfiles, setPerfiles] = useState<any>(null);
  const [ubicaciones, setUbicaciones] = useState<any[]>([]);
  const [fEstado, setFEstado] = useState('');
  const [fSitio, setFSitio] = useState('');
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [nueva, setNueva] = useState<any>(null);
  const [detalle, setDetalle] = useState<any>(null);
  const [evaluando, setEvaluando] = useState<any>(null);
  const [cerrando, setCerrando] = useState<any>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async (estado: string, sitio: string, q: string) => {
    const [l, r] = await Promise.all([
      api.get('/instalaciones', { params: { estado: estado || undefined, tipoSitio: sitio || undefined, texto: q || undefined } })
        .then((x) => x.data).catch(() => []),
      api.get('/instalaciones/resumen').then((x) => x.data).catch(() => null),
    ]);
    setLista(l || []); setResumen(r);
  }, []);

  useEffect(() => {
    api.get('/instalaciones/perfiles').then((r) => setPerfiles(r.data)).catch(() => setPerfiles(null));
    api.get('/locations').then((r) => setUbicaciones(r.data?.items || r.data || [])).catch(() => setUbicaciones([]));
  }, []);

  useEffect(() => {
    setCargando(true);
    const t = setTimeout(() => { cargar(fEstado, fSitio, texto).finally(() => setCargando(false)); }, 300);
    return () => clearTimeout(t);
  }, [fEstado, fSitio, texto, cargar]);

  async function abrir(id: string) {
    try { setDetalle(await api.get(`/instalaciones/${id}`).then((r) => r.data)); setError(''); }
    catch { setError('No se pudo abrir.'); }
  }

  async function crear() {
    setGuardando(true); setError('');
    try {
      const r = await api.post('/instalaciones', {
        tipoSitio: nueva.tipoSitio, tipoEquipo: nueva.tipoEquipo,
        cantidad: Number(nueva.cantidad) || 1,
        tren: nueva.tren || undefined,
        locationId: nueva.locationId || undefined,
        referenciaSitio: nueva.referenciaSitio || undefined,
        comoLlegar: nueva.comoLlegar || undefined,
        justificacion: nueva.justificacion,
        solicitadaPor: nueva.solicitadaPor || undefined,
        areaSolicitante: nueva.areaSolicitante || undefined,
      });
      setMsg(`Instalación ${r.data.codigo} solicitada. Ahora hay que ir al sitio a medir.`);
      setNueva(null);
      await cargar(fEstado, fSitio, texto);
    } catch (e: any) {
      setError(mensajeDeError(e, 'crear'));
    } finally { setGuardando(false); }
  }

  async function guardarEvaluacion(cerrar: boolean) {
    setGuardando(true); setError('');
    try {
      const cuerpo: any = { cerrarEvaluacion: cerrar };
      for (const [k, v] of Object.entries(evaluando.datos)) {
        if (v === '' || v === undefined) continue;
        cuerpo[k] = NUMEROS.has(k) ? Number(v) : v;
      }
      await api.patch(`/instalaciones/${evaluando.id}/evaluar`, cuerpo);
      setMsg(cerrar ? 'Visita cerrada. Ya se puede aprobar.' : 'Guardado. Puedes seguir después.');
      if (!cerrar) { await abrir(evaluando.id); }
      else { setEvaluando(null); setDetalle(null); }
      await cargar(fEstado, fSitio, texto);
      if (cerrar) return;
      const fresco = await api.get(`/instalaciones/${evaluando.id}`).then((r) => r.data);
      setEvaluando({ ...evaluando, falta: fresco.faltaParaEvaluar });
    } catch (e: any) {
      setError(mensajeDeError(e, 'guardar'));
    } finally { setGuardando(false); }
  }

  async function decidir(i: any, aprobar: boolean) {
    let motivo: string | undefined;
    if (!aprobar) {
      motivo = await pedirTexto('¿Por qué se rechaza? Quien la pidió tiene que poder corregirla.') || '';
      if (!motivo.trim()) return;
    }
    try {
      await api.patch(`/instalaciones/${i.id}/decidir`, { aprobar, motivo });
      setMsg(aprobar ? `${i.codigo} aprobada.` : `${i.codigo} rechazada.`);
      setDetalle(null);
      await cargar(fEstado, fSitio, texto);
    } catch (e: any) { setError(mensajeDeError(e, 'decidir')); }
  }

  async function generarOrden(i: any) {
    try {
      const r = await api.post(`/instalaciones/${i.id}/orden`, {});
      setMsg(`Orden ${r.data.orden.code} generada.`);
      setDetalle(null);
      await cargar(fEstado, fSitio, texto);
    } catch (e: any) { setError(mensajeDeError(e, 'generar la orden')); }
  }

  async function cerrarInstalacion() {
    setGuardando(true); setError('');
    try {
      const r = await api.post(`/instalaciones/${cerrando.id}/instalada`, {
        assetCode: cerrando.assetCode, brand: cerrando.brand || undefined,
        modelo: cerrando.modelo || undefined, serialNumber: cerrando.serialNumber || undefined,
        locationId: cerrando.locationId || undefined, notas: cerrando.notas || undefined,
      });
      setMsg(`Instalada. Se creó el activo ${r.data.activo.assetCode} en el inventario.`);
      setCerrando(null); setDetalle(null);
      await cargar(fEstado, fSitio, texto);
    } catch (e: any) {
      setError(mensajeDeError(e, 'cerrar'));
    } finally { setGuardando(false); }
  }

  /** Pinta un campo según su nombre. Las etiquetas vienen del servidor. */
  function campo(nombre: string, valor: any, set: (v: any) => void) {
    const et = perfiles?.etiquetas?.[nombre] ?? nombre;
    if (BOOLEANOS.has(nombre)) {
      return (
        <label className="campo" key={nombre}>
          <span>{et}</span>
          <select value={valor === true ? 'si' : valor === false ? 'no' : ''}
            onChange={(e) => set(e.target.value === '' ? '' : e.target.value === 'si')}>
            <option value="">Sin comprobar</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </label>
      );
    }
    if (nombre === 'ambiente') {
      return (
        <label className="campo" key={nombre}>
          <span>{et}</span>
          <select value={valor ?? ''} onChange={(e) => set(e.target.value)}>
            <option value="">—</option>
            {Object.entries(AMBIENTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      );
    }
    if (LARGOS.has(nombre)) {
      return (
        <label className="campo campo-ancho" key={nombre}>
          <span>{et}</span>
          <textarea value={valor ?? ''} onChange={(e) => set(e.target.value)} />
        </label>
      );
    }
    return (
      <label className="campo" key={nombre}>
        <span>{et}</span>
        <input type={NUMEROS.has(nombre) ? 'number' : 'text'} value={valor ?? ''}
          onChange={(e) => set(e.target.value)} step={NUMEROS.has(nombre) ? 'any' : undefined} />
      </label>
    );
  }

  const perfilDe = (tipoSitio: string) => perfiles?.perfiles?.[tipoSitio] ?? perfiles?.generico;

  return (
    <div className="page">
      <div className="card explica">
        <b>Aquí se pide y se controla equipo NUEVO.</b> No es mantenimiento: mantenimiento
        arregla lo que existe, esto pone lo que no existe todavía.
        <div style={{ marginTop: 8 }}>
          <b>El formulario cambia según el sitio.</b> Un púlpito pregunta por el falso techo
          y quién autoriza entrar; una grúa pregunta si se puede detener y si hace falta
          manlift. No son los mismos campos porque no es el mismo trabajo.
        </div>
        <div style={{ marginTop: 8 }}>
          <b>Termina creando el activo.</b> Cuando se marca como instalada, el equipo
          entra al inventario con su ubicación y su ficha.
        </div>
      </div>

      {msg && <div role="status" className="aviso-ok aviso-cerrable" onClick={() => setMsg('')} title="Toca para cerrar este aviso">{msg}</div>}
      {error && <div role="alert" className="aviso-error aviso-cerrable" onClick={() => setError('')} title="Toca para cerrar este aviso">{error}</div>}

      {resumen && (resumen.esperandoVisita > 0 || resumen.esperandoDecision > 0) && (
        <div className="card peligro">
          <b>Esperando a alguien:</b>{' '}
          {resumen.esperandoVisita > 0 && <>{resumen.esperandoVisita} esperan <b>visita técnica</b>. </>}
          {resumen.esperandoDecision > 0 && <>{resumen.esperandoDecision} esperan <b>decisión del Jefe</b>.</>}
        </div>
      )}

      <div className="filters">
        <div><label>Buscar
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, sitio, quién la pidió…" style={{ minWidth: 220 }} />
          </label></div>
        <div><label>Estado
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ESTADO_ES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          </label></div>
        <div><label>Tipo de sitio
            <select value={fSitio} onChange={(e) => setFSitio(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(SITIO_ES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          </label></div>
        <button className="btn-primary" onClick={() => {
          setError('');
          setNueva({ tipoSitio: 'PULPITO', tipoEquipo: 'CAMERA', cantidad: 1, tren: '', locationId: '', referenciaSitio: '', comoLlegar: '', justificacion: '', solicitadaPor: user?.fullName || '', areaSolicitante: '' });
        }}>+ Pedir instalación</button>
      </div>

      {cargando && !lista.length ? <EsqueletoTabla filas={5} /> : lista.length === 0 ? (
        <div className="card vacio">
          <h3>No hay instalaciones registradas</h3>
          <p>
            Solicitudes de cámaras, antenas o pantallas. Se mide en sitio y el Jefe decide con datos.
          </p>
        </div>
      ) : (
        <table className="tabla">
          <thead>
            <tr><th>Código</th><th>Qué</th><th>Dónde</th><th>Estado</th><th>Pidió</th><th>Falta</th><th></th></tr>
          </thead>
          <tbody>
            {lista.map((i) => (
              <tr key={i.id}>
                <td><strong>{i.codigo}</strong>
                  <div className="muted" style={{ fontSize: 11.5 }}>{fecha(i.creadoEn)}</div></td>
                <td>{i.cantidad > 1 ? `${i.cantidad} × ` : ''}{EQUIPO_ES[i.tipoEquipo] || i.tipoEquipo}</td>
                <td>
                  <div>{SITIO_ES[i.tipoSitio] || i.tipoSitio}{i.tren ? ` · ${i.tren}` : ''}</div>
                  {i.referenciaSitio && <div className="muted" style={{ fontSize: 11.5 }}>{i.referenciaSitio}</div>}
                </td>
                <td><span className={'badge ' + i.estado}>{ESTADO_ES[i.estado]}</span></td>
                <td className="muted">{i.solicitadaPor || '—'}</td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {i.estado === 'SOLICITADA' || i.estado === 'EN_EVALUACION' ? 'Visita técnica'
                    : i.estado === 'EVALUADA' ? 'Decisión del Jefe'
                    : i.estado === 'APROBADA' ? 'Generar la orden'
                    : i.estado === 'EN_EJECUCION' ? 'Ejecutar y cerrar'
                    : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-mini" onClick={() => abrir(i.id)}>Abrir</button>
                
                  {/* Borrado definitivo. Solo lo pinta si eres Jefe de Mantenimiento. */}
                  <BotonPurgar recurso="instalacion" id={i.id}
                    onBorrado={(r) => { setMsg(`Borrada ${r.codigo}.`); cargar(fEstado, fSitio, texto); }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ---------- PEDIR ---------- */}
      {nueva && perfiles && (
        <Modal title="Pedir una instalación" onClose={() => setNueva(null)} ancho
          acciones={<>
            <button className="btn-mini" onClick={() => setNueva(null)}>Cancelar</button>
            <BotonConMotivo onClick={crear} ocupado={guardando}
              falta={queFalta([(nueva.justificacion || '').trim().length < 10,
                'Explica para qué hace falta, en una frase. Sin eso nadie puede priorizarla.'])}>
              {guardando ? 'Guardando…' : 'Pedir'}
            </BotonConMotivo>
          </>}>
          {error && <div role="alert" className="aviso-error">{error}</div>}
          <div className="card explica" style={{ marginTop: 0 }}>
            Aquí sólo se dice <b>qué</b> y <b>para qué</b>. Los metros de cable, la altura
            y si hace falta manlift <b>no te los pedimos</b>: eso se mide yendo al sitio.
            Pedírtelo ahora sólo conseguiría un número inventado que después alguien
            tomaría por bueno.
          </div>
          {perfilDe(nueva.tipoSitio)?.avisos?.length > 0 && (
            <div className="card peligro">
              {perfilDe(nueva.tipoSitio).avisos.map((a: string) => <div key={a} style={{ marginBottom: 4 }}>{a}</div>)}
            </div>
          )}
          <div className="form-grid">
            <label className="campo">
              <span>¿Dónde? <b className="campo-req">*</b></span>
              <select value={nueva.tipoSitio} onChange={(e) => setNueva({ ...nueva, tipoSitio: e.target.value })}>
                {Object.entries(SITIO_ES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <small className="muted">{perfilDe(nueva.tipoSitio)?.resumen}</small>
            </label>
            <label className="campo">
              <span>¿Qué se instala? <b className="campo-req">*</b></span>
              <select value={nueva.tipoEquipo} onChange={(e) => setNueva({ ...nueva, tipoEquipo: e.target.value })}>
                {Object.entries(EQUIPO_ES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Cantidad</span>
              <input type="number" min={1} value={nueva.cantidad}
                onChange={(e) => setNueva({ ...nueva, cantidad: e.target.value })} />
            </label>
            <label className="campo">
              <span>Tren</span>
              <select value={nueva.tren} onChange={(e) => setNueva({ ...nueva, tren: e.target.value })}>
                <option value="">No aplica</option>
                {['T1', 'T2', 'T3'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="campo campo-ancho">
              <span>Ubicación del árbol</span>
              <select value={nueva.locationId} onChange={(e) => setNueva({ ...nueva, locationId: e.target.value })}>
                <option value="">Sin especificar</option>
                {ubicaciones.map((u: any) => <option key={u.id} value={u.id}>{u.path || u.name}</option>)}
              </select>
            </label>
            <label className="campo campo-ancho">
              <span>¿Dónde exactamente?</span>
              <input value={nueva.referenciaSitio} onChange={(e) => setNueva({ ...nueva, referenciaSitio: e.target.value })}
                placeholder="Púlpito T2, pared del fondo sobre la puerta" />
            </label>
            <label className="campo campo-ancho">
              <span>Cómo se llega</span>
              <textarea value={nueva.comoLlegar} onChange={(e) => setNueva({ ...nueva, comoLlegar: e.target.value })}
                placeholder="Escalera norte, segundo nivel, la puerta azul" />
              <small className="muted">El que va a medir puede no haber estado nunca ahí.</small>
            </label>
            <label className="campo campo-ancho">
              <span>¿Para qué hace falta? <b className="campo-req">*</b></span>
              <textarea value={nueva.justificacion} onChange={(e) => setNueva({ ...nueva, justificacion: e.target.value })}
                placeholder="No se ve la salida del tren 2 y el operador tiene que bajar a mirar cada vez." />
              <small className="muted">Mínimo 10 caracteres. Es lo que el Jefe lee para decidir.</small>
            </label>
            <label className="campo">
              <span>¿Quién la pide?</span>
              <input value={nueva.solicitadaPor} onChange={(e) => setNueva({ ...nueva, solicitadaPor: e.target.value })} />
            </label>
            <label className="campo">
              <span>Área</span>
              <input value={nueva.areaSolicitante} onChange={(e) => setNueva({ ...nueva, areaSolicitante: e.target.value })}
                placeholder="Producción, Mantenimiento, SSOMA…" />
            </label>
          </div>
        </Modal>
      )}

      {/* ---------- DETALLE ---------- */}
      {detalle && (
        <Modal title={`${detalle.codigo} · ${SITIO_ES[detalle.tipoSitio]}`} onClose={() => setDetalle(null)} ancho
          acciones={<>
            {puedeEvaluar && ['SOLICITADA', 'EN_EVALUACION', 'EVALUADA'].includes(detalle.estado) && (
              <button className="btn-primary" onClick={() => {
                setError('');
                setEvaluando({ id: detalle.id, perfil: detalle.perfil, falta: detalle.faltaParaEvaluar, datos: { ...detalle } });
              }}>
                {detalle.estado === 'EVALUADA' ? 'Corregir la visita' : 'Registrar la visita'}
              </button>
            )}
            {puedeDecidir && detalle.estado === 'EVALUADA' && <>
              <button className="btn-mini btn-danger" onClick={() => decidir(detalle, false)}>Rechazar</button>
              <button className="btn-primary" onClick={() => decidir(detalle, true)}>Aprobar</button>
            </>}
            {detalle.estado === 'APROBADA' && can('wo.create') && !detalle.workOrderId && (
              <button className="btn-primary" onClick={() => generarOrden(detalle)}>Generar orden de trabajo</button>
            )}
            {puedeCerrar && ['APROBADA', 'EN_EJECUCION'].includes(detalle.estado) && (
              <button className="btn-primary" onClick={() => {
                setError('');
                setCerrando({ id: detalle.id, assetCode: '', brand: '', modelo: '', serialNumber: '', locationId: detalle.locationId || '', notas: '' });
              }}>Marcar instalada</button>
            )}
          </>}>
          <div className="form-grid">
            <div><b>Estado</b><div>{ESTADO_ES[detalle.estado]}</div></div>
            <div><b>Qué</b><div>{detalle.cantidad > 1 ? `${detalle.cantidad} × ` : ''}{EQUIPO_ES[detalle.tipoEquipo]}</div></div>
            <div><b>Dónde</b><div>{detalle.referenciaSitio || detalle.location?.name || '—'}</div></div>
            <div><b>Pidió</b><div>{detalle.solicitadaPor || '—'}{detalle.areaSolicitante ? ` · ${detalle.areaSolicitante}` : ''}</div></div>
          </div>
          <div className="section-title">Para qué</div>
          <p style={{ fontSize: 13.5, marginTop: 0 }}>{detalle.justificacion}</p>
          {detalle.comoLlegar && <>
            <div className="section-title">Cómo se llega</div>
            <p style={{ fontSize: 13.5, marginTop: 0 }}>{detalle.comoLlegar}</p>
          </>}

          {detalle.perfil?.avisos?.length > 0 && (
            <div className="card peligro">
              {detalle.perfil.avisos.map((a: string) => <div key={a} style={{ marginBottom: 4 }}>{a}</div>)}
            </div>
          )}

          {detalle.faltaParaEvaluar?.length > 0 && (
            <div className="card explica">
              <b>Falta medir en el sitio:</b>
              <ul style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.7 }}>
                {detalle.faltaParaEvaluar.map((f: any) => <li key={f.campo}>{f.etiqueta}</li>)}
              </ul>
            </div>
          )}

          {/* Lo ya medido, agrupado como en el formulario. */}
          {detalle.perfil?.grupos?.map((g: any) => {
            const llenos = g.campos.filter((c: string) => detalle[c] !== null && detalle[c] !== undefined && detalle[c] !== '');
            if (!llenos.length) return null;
            return (
              <div key={g.titulo}>
                <div className="section-title">{g.titulo}</div>
                <div className="form-grid">
                  {llenos.map((c: string) => (
                    <div key={c}>
                      <b style={{ fontSize: 12 }}>{perfiles?.etiquetas?.[c] ?? c}</b>
                      <div style={{ fontSize: 13.5 }}>
                        {typeof detalle[c] === 'boolean' ? (detalle[c] ? 'Sí' : 'No')
                          : c === 'ambiente' ? (AMBIENTES[detalle[c]] ?? detalle[c])
                          : String(detalle[c])}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {detalle.workOrder && (
            <div className="card explica">Orden de trabajo: <b>{detalle.workOrder.code}</b> ({detalle.workOrder.status})</div>
          )}
          {detalle.assetCreado && (
            <div className="card" style={{ borderColor: '#7fbf8f', background: '#eef8f0' }}>
              Activo creado: <b>{detalle.assetCreado.assetCode}</b>
            </div>
          )}
          {detalle.motivoRechazo && (
            <div role="alert" className="aviso-error">Motivo: {detalle.motivoRechazo}</div>
          )}
        </Modal>
      )}

      {/* ---------- VISITA ---------- */}
      {evaluando && (
        <Modal title="Registrar la visita al sitio" onClose={() => setEvaluando(null)} ancho
          acciones={<>
            <button className="btn-mini" onClick={() => setEvaluando(null)}>Cerrar</button>
            <button className="btn-mini" onClick={() => guardarEvaluacion(false)} disabled={guardando}>
              Guardar y seguir después
            </button>
            <button className="btn-primary" onClick={() => guardarEvaluacion(true)} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Visita terminada'}
            </button>
          </>}>
          {error && <div role="alert" className="aviso-error">{error}</div>}
          <div className="card explica" style={{ marginTop: 0 }}>
            <b>Se puede guardar a medias.</b> Estás en el sitio, con guantes. Apunta lo
            que lleves y sigue después: sólo al pulsar <b>Visita terminada</b> se exige
            lo imprescindible.
          </div>
          {evaluando.falta?.length > 0 && (
            <div className="card peligro">
              <b>Para dar la visita por hecha falta:</b>
              <ul style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.7 }}>
                {evaluando.falta.map((f: any) => <li key={f.campo}>{f.etiqueta}</li>)}
              </ul>
            </div>
          )}
          {evaluando.perfil?.grupos?.map((g: any) => (
            <div key={g.titulo}>
              <div className="section-title">{g.titulo}</div>
              {g.ayuda && <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>{g.ayuda}</p>}
              <div className="form-grid">
                {g.campos.map((c: string) => campo(c, evaluando.datos[c],
                  (v) => setEvaluando({ ...evaluando, datos: { ...evaluando.datos, [c]: v } })))}
              </div>
            </div>
          ))}
        </Modal>
      )}

      {/* ---------- CERRAR: NACE EL ACTIVO ---------- */}
      {cerrando && (
        <Modal title="Marcar instalada — se crea el activo" onClose={() => setCerrando(null)} ancho
          acciones={<>
            <button className="btn-mini" onClick={() => setCerrando(null)}>Cancelar</button>
            <BotonConMotivo onClick={cerrarInstalacion} ocupado={guardando}
              falta={queFalta([(cerrando.assetCode || '').trim().length < 3,
                'Pon el código del activo que nace aquí. Es el que se rotula y se escanea.'])}>
              {guardando ? 'Creando…' : 'Cerrar y crear el activo'}
            </BotonConMotivo>
          </>}>
          {error && <div role="alert" className="aviso-error">{error}</div>}
          <div className="card explica" style={{ marginTop: 0 }}>
            Este es el paso que mete el equipo <b>en el inventario</b>. Sin él, la cámara
            queda instalado fuera del sistema.
            <div style={{ marginTop: 6 }}>
              La ficha nace <b>incompleta</b> a propósito, con lo que se sabe hoy. Se
              termina de llenar desde Activos.
            </div>
          </div>
          <div className="form-grid">
            <label className="campo campo-ancho">
              <span>Código del activo <b className="campo-req">*</b></span>
              <input value={cerrando.assetCode} autoComplete="off"
                onChange={(e) => setCerrando({ ...cerrando, assetCode: e.target.value.toUpperCase() })}
                placeholder="AA-CAM-T2-PUL-014" />
              <small className="muted">Si ya existe, el sistema lo rechaza en vez de duplicarlo.</small>
            </label>
            <label className="campo"><span>Marca</span>
              <input value={cerrando.brand} onChange={(e) => setCerrando({ ...cerrando, brand: e.target.value })} /></label>
            <label className="campo"><span>Modelo</span>
              <input value={cerrando.modelo} onChange={(e) => setCerrando({ ...cerrando, modelo: e.target.value })} /></label>
            <label className="campo"><span>N° de serie</span>
              <input value={cerrando.serialNumber} onChange={(e) => setCerrando({ ...cerrando, serialNumber: e.target.value })} /></label>
            <label className="campo"><span>Ubicación</span>
              <select value={cerrando.locationId} onChange={(e) => setCerrando({ ...cerrando, locationId: e.target.value })}>
                <option value="">La de la instalación</option>
                {ubicaciones.map((u: any) => <option key={u.id} value={u.id}>{u.path || u.name}</option>)}
              </select></label>
            <label className="campo campo-ancho"><span>Notas del cierre</span>
              <textarea value={cerrando.notas} onChange={(e) => setCerrando({ ...cerrando, notas: e.target.value })} /></label>
          </div>
        </Modal>
      )}
    </div>
  );
}
