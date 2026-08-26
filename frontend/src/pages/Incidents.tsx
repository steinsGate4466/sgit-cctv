import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import AsignarOm from '../components/AsignarOm';
import FiltroAmbito, { Ambito, AMBITO_VACIO, AvisoAmbito } from '../components/FiltroAmbito';
import Modal from '../components/Modal';
import BotonPurgar from '../components/BotonPurgar';
import { useAuth } from '../auth/AuthContext';
import Icono from '../components/Iconos';
import { useDialogos } from '../components/Dialogos';
import { fechaHora } from '../formato';
import { fechaCorta, fechaTabla, haceCuanto } from '../fechas';
import { useBusquedaEnVivo } from '../useBusquedaEnVivo';

// Categorías agrupadas para el selector (CCTV/NVR, Red/energía, Entorno de planta).
const CATEGORY_GROUPS: { label: string; items: string[] }[] = [
  { label: 'CCTV / NVR', items: ['CAMARA_SIN_IMAGEN', 'SATURACION_SESIONES_NVR', 'FALLA_ALMACENAMIENTO_NVR', 'FALLA_NVR', 'DECODER_VIDEOWALL'] },
  { label: 'Red / Conectividad', items: ['CAIDA_ENLACE_INALAMBRICO', 'FALLA_SWITCH', 'FALLA_FIBRA', 'PERDIDA_CONECTIVIDAD', 'RED'] },
  { label: 'Eléctrico', items: ['CORTE_ENERGIA', 'TABLERO_ELECTRICO', 'VARIACION_TENSION', 'CORTOCIRCUITO', 'SOBRECARGA', 'PUESTA_A_TIERRA', 'CABLEADO_ELECTRICO', 'TRANSFORMADOR', 'FALLA_UPS', 'FALLA_FUENTE_POE'] },
  { label: 'Entorno de planta', items: ['FALLA_GABINETE', 'AMBIENTAL_SIDERURGICO', 'SEGURIDAD_FISICA', 'CONFIGURACION_FIRMWARE', 'GENERAL'] },
];
const CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.items);
const PRIORITIES = ['BAJA', 'MEDIA', 'ALTA', 'Crítica'];
const STATUSES = ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA', 'RESUELTA', 'CERRADA'];
// Estados que el técnico puede fijar. El cierre (RESUELTA/CERRADA) lo firma el Jefe.
const NON_TERMINAL = ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'];

const CAT_ES: Record<string, string> = {
  GENERAL: 'General', SATURACION_SESIONES_NVR: 'Saturación sesiones NVR', CAIDA_ENLACE_INALAMBRICO: 'Caída enlace inalámbrico',
  FALLA_ALMACENAMIENTO_NVR: 'Falla almacenamiento NVR', DECODER_VIDEOWALL: 'Decoder / Videowall', CAMARA_SIN_IMAGEN: 'Cámara sin imagen', RED: 'Red (general)',
  CORTE_ENERGIA: 'Corte de energía', FALLA_GABINETE: 'Falla de gabinete', FALLA_FUENTE_POE: 'Falla fuente / PoE', FALLA_SWITCH: 'Falla de switch / puerto',
  FALLA_FIBRA: 'Falla de fibra / anillo', FALLA_UPS: 'Falla de UPS', PERDIDA_CONECTIVIDAD: 'Pérdida de conectividad', FALLA_NVR: 'Falla de NVR',
  AMBIENTAL_SIDERURGICO: 'Ambiental (polvo/calor/escoria)', SEGURIDAD_FISICA: 'Seguridad física / vandalismo', CONFIGURACION_FIRMWARE: 'Configuración / firmware',
  TABLERO_ELECTRICO: 'Tablero eléctrico / breaker', VARIACION_TENSION: 'Variación de tensión', PUESTA_A_TIERRA: 'Puesta a tierra',
  CORTOCIRCUITO: 'Cortocircuito', SOBRECARGA: 'Sobrecarga', CABLEADO_ELECTRICO: 'Cableado eléctrico dañado', TRANSFORMADOR: 'Transformador / alimentación',
};
const STATUS_ES: Record<string, string> = {
  ABIERTA: 'Abierta', EN_DIAGNOSTICO: 'En diagnóstico', EN_PROCESO: 'En proceso', EN_ESPERA: 'En espera', RESUELTA: 'Resuelta', CERRADA: 'Cerrada',
};
// Etiqueta del estado efectivo del activo (coherente con Activos).
const ASSET_STATUS_ES: Record<string, string> = {
  OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento',
  CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock',
};
const catEs = (c: string) => CAT_ES[c] || c;
const stEs = (s: string) => STATUS_ES[s] || s;
const aEs = (s: string) => ASSET_STATUS_ES[s] || s;

function statusBadge(s: string) {
  if (s === 'ABIERTA') return 'FUERA_SERVICIO';
  if (s === 'RESUELTA' || s === 'CERRADA') return 'OPERATIVO';
  return 'MANTENIMIENTO';
}

export default function Incidents() {
  const { avisar } = useDialogos();
  const { can, user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Buscador
  const [fq, setFq] = useState('');
  const [fCat, setFCat] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_VACIO);
  // Convertir la incidencia en orden sin reescribir a mano lo que ya está
  // escrito justo al lado: equipo, zona y descripción.
  const [convirtiendo, setConvirtiendo] = useState<any>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Alta
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ title: '', category: 'GENERAL', priority: 'MEDIA', assetId: '', zone: '', description: '', affectedCameras: '' });

  // Resolución firmada (profesional)
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [rf, setRf] = useState<any>({});
  const [sigError, setSigError] = useState('');
  const [signing, setSigning] = useState(false);
  const [tries, setTries] = useState(5);

  // Propuesta técnica de solución (la documenta el técnico antes del cierre)
  const [propId, setPropId] = useState<string | null>(null);
  const [prop, setProp] = useState<any>({});
  const [propSaving, setPropSaving] = useState(false);

  // Fotos
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: '200' });
    if (fq.trim()) params.set('q', fq.trim());
    if (fCat) params.set('category', fCat);
    if (fStatus) params.set('status', fStatus);
    if (from) params.set('from', new Date(from + 'T00:00:00').toISOString());
    if (to) params.set('to', new Date(to + 'T23:59:59.999').toISOString());
    if (ambito.tren) params.set('tren', ambito.tren);
    if (ambito.etapa) params.set('etapa', ambito.etapa);
    const [inc, ast] = await Promise.all([
      api.get('/incidents?' + params.toString()).then((r) => r.data).catch(() => ({ data: [] })),
      api.get('/assets/options').then((r) => r.data).catch(() => []),
    ]);
    setRows(inc.data || []);
    setAssets(ast || []);
    setLoading(false);
  }
  // La carga es intencionalmente ÚNICA al montar: los filtros de esta pantalla
  // se aplican en memoria, no en el servidor. Declarar `load` como dependencia
  // obligaría a envolverla en useCallback y volvería a consultar el servidor en
  // cada tecla, que es exactamente lo que no queremos aquí.
  // El ámbito SÍ va en las dependencias: al cambiar de tren hay que volver a
  // preguntar al servidor. Los demás filtros no, porque se aplican al pulsar
  // Buscar; si estuvieran aquí, se consultaría en cada tecla escrita.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [ambito]);

  /* Se busca MIENTRAS SE ESCRIBE, con 350 ms de espera. El botón «Buscar»
     se queda: quien teclea un código completo lo pulsa por costumbre y
     quitarlo obligaría a esperar sin saber si el sistema entendió. */
  useBusquedaEnVivo(fq, load);

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: any = { title: form.title, category: form.category, priority: form.priority };
      if (form.assetId) body.assetId = form.assetId;
      if (form.zone) body.zone = form.zone.trim();
      if (form.description) body.description = form.description;
      if (form.affectedCameras) body.affectedCameras = Number(form.affectedCameras);
      await api.post('/incidents', body);
      setShowForm(false);
      setForm({ title: '', category: 'GENERAL', priority: 'MEDIA', assetId: '', zone: '', description: '', affectedCameras: '' });
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      await avisar(Array.isArray(m) ? m.join(', ') : m || 'No se pudo crear la incidencia.');
    } finally { setSaving(false); }
  }

  function openResolve(id: string) {
    setResolveId(id); setSigError(''); setTries(5);
    setRf({ solution: '', rootCause: '', materials: '', interveners: '', responsibleName: '', observations: '', lineManagerNotified: false, affectedCameras: '', visionDownMin: '', email: user?.email || '', password: '' });
  }
  async function submitResolve(e: FormEvent) {
    e.preventDefault();
    setSigError(''); setSigning(true);
    try {
      const body: any = { email: rf.email, password: rf.password };
      for (const k of ['solution', 'rootCause', 'materials', 'interveners', 'responsibleName', 'observations']) if (rf[k]) body[k] = rf[k];
      body.lineManagerNotified = !!rf.lineManagerNotified;
      if (rf.affectedCameras) body.affectedCameras = Number(rf.affectedCameras);
      if (rf.visionDownMin) body.visionDownMin = Number(rf.visionDownMin);
      await api.post('/incidents/' + resolveId + '/resolve', body);
      setResolveId(null);
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      const msg = Array.isArray(m) ? m.join(', ') : m || 'No se pudo resolver.';
      if (/firma inv|contrase/i.test(msg)) {
        const left = tries - 1; setTries(left);
        setSigError(left > 0 ? `Contraseña incorrecta. Te quedan ${left} intento(s).` : 'Contraseña incorrecta. Sin intentos restantes.');
      } else setSigError(msg);
    } finally { setSigning(false); }
  }

  function openProposal(i: any) {
    setPropId(i.id);
    setProp({
      proposal: i.proposal || '', proposalCost: i.proposalCost || '',
      proposalRisk: i.proposalRisk || '', requiresThirdParty: !!i.requiresThirdParty,
    });
  }
  async function submitProposal(e: FormEvent) {
    e.preventDefault();
    setPropSaving(true);
    try {
      await api.patch('/incidents/' + propId, {
        proposal: prop.proposal || undefined,
        proposalCost: prop.proposalCost || undefined,
        proposalRisk: prop.proposalRisk || undefined,
        requiresThirdParty: !!prop.requiresThirdParty,
      });
      setPropId(null);
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      await avisar(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar la propuesta.');
    } finally { setPropSaving(false); }
  }

  async function openPhotos(id: string) {
    setPhotoId(id); setFile(null); setCaption('');
    const ev = await api.get('/incidents/' + id + '/evidence').then((r) => r.data).catch(() => []);
    setEvidence(ev || []);
  }
  async function uploadPhoto(e: FormEvent) {
    e.preventDefault();
    if (!file) { await avisar('Selecciona una imagen.'); return; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file); if (caption) fd.append('caption', caption);
      await api.post('/incidents/' + photoId + '/evidence', fd);
      setFile(null); setCaption('');
      const ev = await api.get('/incidents/' + photoId + '/evidence').then((r) => r.data).catch(() => []);
      setEvidence(ev || []);
    } catch { await avisar('No se pudo subir la imagen.'); }
    finally { setUploading(false); }
  }
  async function downloadReport(i: any) {
    try {
      const res = await api.get('/incidents/' + i.id + '/report', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = (i.code || 'informe') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { await avisar('No se pudo generar el informe.'); }
  }

  function clearFilters() { setFq(''); setFCat(''); setFStatus(''); setFrom(''); setTo(''); }

  // Cambio de estado NO terminal (Abierta / En diagnóstico / En proceso / En espera).
  // El cierre (Resuelta) se hace con firma del Jefe (botón "Resolver").
  async function changeStatus(id: string, status: string) {
    try {
      await api.patch('/incidents/' + id, { status });
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      await avisar(Array.isArray(m) ? m.join(', ') : m || 'No se pudo actualizar el estado.');
    }
  }

  if (loading) return <div className="loading">Cargando incidencias…</div>;

  const openIssue = (i: any) => i.status !== 'RESUELTA' && i.status !== 'CERRADA';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Incidencias</h1>
          <p className="page-sub">{rows.length} incidencias · bitácora de fallas de planta</p>
        </div>
        {can('incident.create') && <button className="btn-primary" onClick={() => setShowForm(true)}>+ Nueva incidencia</button>}
      </div>

      <AvisoAmbito valor={ambito} total={rows.length} />

      <div className="filters">
        <FiltroAmbito valor={ambito} onChange={setAmbito} />
        <div style={{ flex: 1, minWidth: 160 }}><label>Buscar<input placeholder="código, título, zona…" value={fq} onChange={(e) => setFq(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} /></label></div>
        <div><label>Categoría<select value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">Todas</option>{CATEGORY_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.items.map((c) => <option key={c} value={c}>{catEs(c)}</option>)}</optgroup>)}</select></label></div>
        <div><label>Estado<select value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">Todos</option>{STATUSES.map((s) => <option key={s} value={s}>{stEs(s)}</option>)}</select></label></div>
        <div><label>Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label></div>
        <div><label>Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
        <button className="btn-primary" onClick={load}>Buscar</button>
        <button className="btn-mini" onClick={clearFilters}>Limpiar</button>
      </div>

      <div className="card">
        <table>
          <thead>
            {/* LA FECHA FALTABA, Y ES LA QUE ALIMENTA EL MTTR. Bloque 66.
                  ------------------------------------------------------------
                  La incidencia es el ARRANQUE del ciclo: desde el QR se
                  reporta, y de ahí sale la orden. Sin la hora en que se
                  reportó no hay «cuánto tardamos», y sin eso el MTTR no se
                  puede calcular ni defender en una reunión.

                  El dato ya venía del servidor —`reportedAt` y `resolvedAt`—
                  y no se pintaba. Otra vez lo mismo: el dato existía y no
                  tenía pantalla. */}
              <tr>
                <th>Código</th><th>Título</th><th>Zona</th><th>Reportada</th>
                <th>Prioridad</th><th>Estado</th><th>Activo</th><th></th>
              </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td style={{ fontWeight: 600 }}>{i.code}</td>
                {/* La categoría baja bajo el título en vez de ocupar columna:
                    describe el título, y con ella eran DIEZ columnas — el tope
                    son ocho, y `verificar:densidad` lo cazó al añadir la fecha. */}
                <td>
                  {i.title}
                  <div className="muted" style={{ fontSize: 11 }}>{catEs(i.category)}</div>
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{i.zone || '—'}</td>
                {/* REPORTADA Y RESUELTA EN UNA SOLA COLUMNA.
                    Es el par que alimenta el MTTR: restar una de otra ES el
                    indicador. Juntas se leen de un vistazo; en dos columnas
                    separadas hay que ir y volver con la vista. */}
                {/* CÓMO SE LEE UNA FECHA EN UNA LISTA DE TRABAJO — bloque 71.
                    ---------------------------------------------------------
                    Antes ponía «26/8, 12:16 a. m.» y debajo «abierta». Tres
                    problemas, y ninguno es de gusto:

                    · `12:16 a. m.` obliga a pensar si es medianoche o
                      mediodía. En una planta de tres turnos la mitad de las
                      incidencias entran de madrugada, así que esa duda sale
                      todos los días. En 24 horas no hay duda.
                    · La fecha exacta NO es lo que se mira primero. Para
                      priorizar, lo que importa es CUÁNTO LLEVA esperando:
                      «hace 8 h» se entiende sin restar nada.
                    · La fecha exacta sigue haciendo falta —para el informe y
                      para discutir con Producción—, así que se queda debajo,
                      pequeña. No se quita: se ordena. */}
                <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  <div style={{ color: 'var(--text)', fontWeight: 600 }}>
                    {haceCuanto(i.reportedAt, '—')}
                  </div>
                  <div style={{ fontSize: 11 }}>{fechaTabla(i.reportedAt, '—')}</div>

                  {i.resolvedAt
                    ? (
                      <div style={{ fontSize: 11, color: 'var(--ok)' }}>
                        resuelta {fechaTabla(i.resolvedAt)}
                      </div>
                    )
                    : <div style={{ fontSize: 11 }}>sigue abierta</div>}

                  {/* Sólo se pinta cuando se sabe. La mayoría de las veces no
                      se sabe, y una línea «ocurrió: —» en todas las filas es
                      ruido que esconde las pocas que sí lo traen — que son
                      justo las que interesan. */}
                  {i.occurredAt && (
                    <div style={{ fontSize: 11 }} title="Cuándo se cayó de verdad, no cuándo se avisó">
                      se cayó {fechaTabla(i.occurredAt)}
                    </div>
                  )}
                </td>
                <td><span className={'badge ' + i.priority}>{i.priority}</span></td>
                <td><span className={'badge ' + statusBadge(i.status)}>{stEs(i.status)}</span></td>
                <td className="muted">
                  {i.asset?.assetCode || '—'}
                  {i.asset?.effectiveStatus && <div style={{ marginTop: 3 }}><span className={'badge ' + i.asset.effectiveStatus} style={{ fontSize: 10 }}>{aEs(i.asset.effectiveStatus)}</span></div>}
                </td>
                {/* La celda de acciones lleva hasta SIETE controles. Con
                    `nowrap` se salían de la tabla y se pisaban entre ellos en
                    pantallas de 1366 px, que es la de los púlpitos. Ahora
                    envuelven en dos filas y se alinean. */}
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  {can('incident.update') && openIssue(i) && (
                    <select aria-label="Filtrar por tren"
                      value={NON_TERMINAL.includes(i.status) ? i.status : 'ABIERTA'}
                      onChange={(e) => changeStatus(i.id, e.target.value)}
                      title="Actualizar estado (avisa al Jefe de Mantenimiento)"
                      /* `minWidth` porque «En diagnóstico» es más ancho que el
                         hueco que le dejaba `width: auto`: el texto se salía y
                         se solapaba con el botón de al lado. Se veía
                         «En diagnósticNo» en la captura de la prueba. */
                      style={{ width: 'auto', minWidth: 132, padding: '4px 6px', marginRight: 4, fontSize: 12 }}
                    >
                      {NON_TERMINAL.map((s) => <option key={s} value={s}>{stEs(s)}</option>)}
                    </select>
                  )}
                  {can('incident.update') && <button className="btn-mini" onClick={() => openPhotos(i.id)}>Fotos</button>}
                  {can('incident.update') && openIssue(i) && (
                    <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => openProposal(i)}>
                      <><Icono n="nota" size={13} /> {i.proposal ? 'Propuesta ✓' : 'Propuesta'}</>
                    </button>
                  )}
                  {can('incident.close') && openIssue(i) && <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => openResolve(i.id)}>Resolver</button>}
                  {can('wo.create') && openIssue(i) && (
                    <button className="btn-mini" style={{ marginLeft: 4, fontWeight: 600 }}
                      title="Crear la orden de trabajo con los datos de esta incidencia"
                      onClick={() => setConvirtiendo(i)}>
                      → OM
                    </button>
                  )}
                  <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => downloadReport(i)}>Informe</button>
                
                  {/* Borrado definitivo. Solo lo pinta si eres Jefe de Mantenimiento. */}
                  <BotonPurgar recurso="incidencia" id={i.id} onBorrado={() => load()} />
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 30 }}>Sin incidencias</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Nueva incidencia" onClose={() => setShowForm(false)}>
          <form onSubmit={create}>
            <div className="sign-note">Registra la falla, haya o no orden. Alimenta el análisis.</div>
            <label>Título
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>Categoría<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORY_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.items.map((c) => <option key={c} value={c}>{catEs(c)}</option>)}</optgroup>)}</select></label></div>
              <div style={{ flex: 1 }}><label>Prioridad<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label></div>
            </div>
            <label>Zona / área (Horno, Laminación, Púlpito…)
              <input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
            </label>
            <label>Activo afectado (opcional)
              <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
              <option value="">— ninguno —</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.assetCode}</option>)}
            </select>
            </label>
            <label>Descripción del problema
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} style={{ width: '100%', resize: 'vertical' }} />
            </label>
            <label>Cámaras afectadas (opcional)
              <input type="number" value={form.affectedCameras} onChange={(e) => setForm({ ...form, affectedCameras: e.target.value })} />
            </label>
            <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Crear incidencia'}</button>
          </form>
        </Modal>
      )}

      {propId && (
        <Modal title="Propuesta técnica de solución" onClose={() => setPropId(null)}>
          <form onSubmit={submitProposal}>
            <div className="sign-note">
              Documenta <b>qué se propone hacer</b> para resolverlo de fondo. Esta información
              sustenta el pedido ante Jefatura y queda en el informe de la incidencia.
            </div>
            <label>Propuesta de solución
              <textarea value={prop.proposal} onChange={(e) => setProp({ ...prop, proposal: e.target.value })}
              rows={4} style={{ width: '100%', resize: 'vertical' }}
              placeholder="Ej: reemplazar el ramal eléctrico del gabinete GAB-T1-R01 y colocar breaker independiente de 16A; hoy comparte circuito con el tablero de iluminación y cae con la carga del horno." />
            </label>
            <label>Recursos / materiales requeridos
              <textarea value={prop.proposalCost} onChange={(e) => setProp({ ...prop, proposalCost: e.target.value })}
              rows={2} style={{ width: '100%', resize: 'vertical' }}
              placeholder="Ej: 1 breaker 16A, 30 m cable THW 2.5 mm², 1 jornada de electricista" />
            </label>
            <label>Riesgo si no se atiende
              <textarea value={prop.proposalRisk} onChange={(e) => setProp({ ...prop, proposalRisk: e.target.value })}
              rows={2} style={{ width: '100%', resize: 'vertical' }}
              placeholder="Ej: pérdida recurrente de visión en el Tren 1 durante colada; riesgo de daño al NVR por caídas de tensión." />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, marginTop: 10 }}>
              <input type="checkbox" checked={!!prop.requiresThirdParty}
                onChange={(e) => setProp({ ...prop, requiresThirdParty: e.target.checked })} style={{ width: 'auto' }} />
              Requiere apoyo de terceros (área eléctrica, contratista)
            </label>
            <button className="btn" disabled={propSaving}>{propSaving ? 'Guardando…' : 'Guardar propuesta'}</button>
          </form>
        </Modal>
      )}

      {photoId && (
        <Modal title="Fotografías de campo" onClose={() => setPhotoId(null)}>
          <form onSubmit={uploadPhoto}>
            <div className="sign-note">Sube fotos de lo que ocurre en campo. Se incrustan en el informe PDF de la incidencia.</div>
            <label>Imagen (JPG / PNG)
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <label>Descripción (opcional)
              <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Ej: cable UTP quemado en el área del horno" />
            </label>
            <button className="btn" disabled={uploading}>{uploading ? 'Subiendo…' : 'Subir foto'}</button>
          </form>
          <div style={{ marginTop: 14 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{evidence.length} foto(s) registradas</div>
            {evidence.map((ev) => (
              <div key={ev.id} style={{ fontSize: 12, padding: '4px 0', borderTop: '1px solid #eee' }}>
                <Icono n="camara" size={14} /> {ev.caption || '(sin descripción)'} <span className="muted">· {fechaHora(ev.createdAt)}</span>
              </div>
            ))}
            {!evidence.length && <div className="muted" style={{ fontSize: 12 }}>Aún no hay fotos.</div>}
          </div>
        </Modal>
      )}

      {resolveId && (
        <Modal title="Resolver incidencia (firmado)" onClose={() => setResolveId(null)}>
          <form onSubmit={submitResolve}>
            <div className="sign-note">Registra cómo se resolvió para el análisis de planta. Confirma tu identidad al final (firma auditada).</div>
            <label>¿Qué se hizo para resolverlo?
              <textarea value={rf.solution} onChange={(e) => setRf({ ...rf, solution: e.target.value })} rows={2} style={{ width: '100%', resize: 'vertical' }} />
            </label>
            <label>Causa raíz
              <input value={rf.rootCause} onChange={(e) => setRf({ ...rf, rootCause: e.target.value })} />
            </label>
            <label>Materiales utilizados
              <textarea value={rf.materials} onChange={(e) => setRf({ ...rf, materials: e.target.value })} rows={2} style={{ width: '100%', resize: 'vertical' }} />
            </label>
            <label>Técnicos que intervinieron
              <input value={rf.interveners} onChange={(e) => setRf({ ...rf, interveners: e.target.value })} placeholder="Nombres separados por coma" />
            </label>
            <label>Responsable de la solución
              <input value={rf.responsibleName} onChange={(e) => setRf({ ...rf, responsibleName: e.target.value })} />
            </label>
            <label>Observaciones / recomendaciones
              <textarea value={rf.observations} onChange={(e) => setRf({ ...rf, observations: e.target.value })} rows={2} style={{ width: '100%', resize: 'vertical' }} />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>Cámaras afectadas<input type="number" value={rf.affectedCameras} onChange={(e) => setRf({ ...rf, affectedCameras: e.target.value })} /></label></div>
              <div style={{ flex: 1 }}><label>Minutos sin visión<input type="number" value={rf.visionDownMin} onChange={(e) => setRf({ ...rf, visionDownMin: e.target.value })} /></label></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, marginTop: 8 }}>
              <input type="checkbox" checked={!!rf.lineManagerNotified} onChange={(e) => setRf({ ...rf, lineManagerNotified: e.target.checked })} style={{ width: 'auto' }} />
              El jefe de línea está enterado del problema
            </label>
            <h4 style={{ marginTop: 12, marginBottom: 4 }}><Icono n="firma" size={15} /> Firma</h4>
            <label>Correo
              <input type="email" value={rf.email} onChange={(e) => setRf({ ...rf, email: e.target.value })} required />
            </label>
            <label>Contraseña
              <input type="password" value={rf.password} onChange={(e) => setRf({ ...rf, password: e.target.value })} required />
            </label>
            {sigError && <div className="error">{sigError}</div>}
            <button className="btn" disabled={signing || tries <= 0}>{signing ? 'Firmando…' : 'Firmar y resolver'}</button>
          </form>
        </Modal>
      )}
      {convirtiendo && (
        <AsignarOm incidente={convirtiendo} onHecho={load} onClose={() => setConvirtiendo(null)} />
      )}

    </div>
  );
}
