import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import SelectorDeActivo from '../components/SelectorDeActivo';
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
/* Bloque 172 · «Crítica» iba como VALOR: la base espera CRITICA y respondía
   «priority must be one of…». Elegir prioridad crítica al reportar daba error. */
const PRIORITIES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
const PRIORIDAD_ES: Record<string, string> = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Crítica' };

/* Bloque 172 · las categorías del tipo de equipo elegido, primero y aparte.
   Con una cámara elegida, «Falla de UPS» o «Transformador» arriba del todo
   invitaban a equivocarse de categoría; el resto sigue disponible debajo
   (una cámara sin imagen puede ser, de verdad, un corte de energía). */
const GRUPO_DEL_TIPO: Record<string, string> = {
  CAMERA: 'CCTV / NVR', NVR: 'CCTV / NVR', DECODER: 'CCTV / NVR', PC: 'CCTV / NVR', PANTALLA: 'CCTV / NVR',
  SWITCH: 'Red / Conectividad', WIRELESS: 'Red / Conectividad', ROUTER: 'Red / Conectividad',
  FIREWALL: 'Red / Conectividad', SERVER: 'Red / Conectividad',
  UPS: 'Eléctrico', PSU: 'Eléctrico',
};
function gruposDeCategoria(tipo?: string | null) {
  const suyo = tipo ? GRUPO_DEL_TIPO[tipo] : null;
  if (!suyo) return CATEGORY_GROUPS;
  const g = CATEGORY_GROUPS.find((x) => x.label === suyo)!;
  return [{ ...g, label: `${g.label} · para este equipo` }, ...CATEGORY_GROUPS.filter((x) => x.label !== suyo)];
}
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
  /* Bloque 139: quien puede actualizar incidencias es quien las clasifica.
     Los demás (Producción, púlpito) sólo cuentan qué pasa. */
  const completaTecnico = can('incident.update');
  const [rows, setRows] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Buscador
  /* `?q=INC-2026-0005` — se llega desde el botón «Abrir» de la bandeja.
     ---------------------------------------------------------------------------
     No se hizo una pantalla de detalle nueva: filtrando por el código queda
     UNA sola fila, y con la tabla vacía de lo demás caben todos sus datos —
     quién avisó, cuándo se reportó, cuándo se cayó, el estado— más los botones
     de actuar. Una pantalla de detalle habría sido un sitio más que mantener
     para enseñar lo mismo. */
  const [fq, setFq] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
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
  // Bloque 168: prioridad '' = la de la zona (el servidor no deja bajarla).
  const [form, setForm] = useState<any>({ title: '', category: 'GENERAL', priority: '', assetId: '', zone: '', description: '', affectedCameras: '' });
  const [causas, setCausas] = useState<any[]>([]);
  const [acciones, setAcciones] = useState<any[]>([]);
  /** La zona se sabe por el equipo: se rellena si nadie la escribió. */
  const zonaDe = (id: string) => { const a = assets.find((x) => x.id === id); return a ? a.referencePlace || a.locationName || '' : ''; };

  /* `?nueva=1&activo=…` — bloque 159. Llega desde los accesos rápidos del
     Dashboard y de la bandeja: abre el alta con el equipo puesto (si lo hay).
     Se limpia la URL para que recargar no vuelva a abrirla. */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('nueva') !== '1' || !can('incident.create')) return;
    const activo = q.get('activo') || '';
    if (activo) setForm((f: any) => ({ ...f, assetId: activo }));
    setShowForm(true);
    window.history.replaceState(null, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      /* Bloque 139: quien sólo reporta no clasifica. Categoría y prioridad las
         pone el técnico después; mandarlas con el valor por defecto diría que
         alguien las eligió. */
      /* Bloque 169: el título, si no se escribe, se arma con lo ELEGIDO
         (categoría + equipo). Prioridad vacía = la de la zona (no se manda). */
      const equipo = assets.find((a) => a.id === form.assetId)?.assetCode;
      const titulo = form.title.trim() || [completaTecnico && form.category !== 'GENERAL' ? catEs(form.category) : '', equipo].filter(Boolean).join(' — ');
      if (titulo.length < 3) { await avisar('Elige la categoría y el equipo, o escribe qué pasa.'); return; }
      const body: any = { title: titulo };
      if (completaTecnico) { body.category = form.category; if (form.priority) body.priority = form.priority; }
      if (form.assetId) body.assetId = form.assetId;
      if (form.zone) body.zone = form.zone.trim();
      if (form.description) body.description = form.description;
      if (form.affectedCameras) body.affectedCameras = Number(form.affectedCameras);
      await api.post('/incidents', body);
      setShowForm(false);
      setForm({ title: '', category: 'GENERAL', priority: '', assetId: '', zone: '', description: '', affectedCameras: '' });
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      await avisar(Array.isArray(m) ? m.join(', ') : m || 'No se pudo crear la incidencia.');
    } finally { setSaving(false); }
  }

  function openResolve(id: string) {
    setResolveId(id); setSigError(''); setTries(5);
    /* Bloque 168: lo que el sistema ya sabe no se teclea. Quien firma es el
       responsable y uno de los que intervino; las cámaras afectadas vienen de
       la incidencia; los minutos sin visión, de cuándo cayó hasta ahora. */
    const i = rows.find((x) => x.id === id) || {};
    const desde = i.occurredAt || i.reportedAt;
    const minutos = desde ? Math.max(0, Math.round((Date.now() - new Date(desde).getTime()) / 60000)) : '';
    const yo = user?.fullName || '';
    setRf({ solution: '', accion: '', rootCause: '', rootCauseOtra: '', materials: '', interveners: yo, responsibleName: yo, observations: '', lineManagerNotified: false,
      affectedCameras: i.affectedCameras ?? '', visionDownMin: String(minutos), email: user?.email || '', password: '' });
    if (!causas.length) {
      api.get('/catalogos/CAUSA').then((r) => setCausas(r.data?.items || [])).catch(() => setCausas([]));
      api.get('/catalogos/ACCION').then((r) => setAcciones(r.data?.items || [])).catch(() => setAcciones([]));
    }
  }
  async function submitResolve(e: FormEvent) {
    e.preventDefault();
    setSigError(''); setSigning(true);
    try {
      const body: any = { email: rf.email, password: rf.password };
      for (const k of ['solution', 'rootCause', 'materials', 'interveners', 'responsibleName', 'observations']) if (rf[k]) body[k] = rf[k];
      if (rf.rootCause === '__OTRA__') body.rootCause = (rf.rootCauseOtra || '').trim() || undefined;
      // Bloque 169: lo que se hizo, del catálogo de acciones; el texto es el detalle.
      const accion = acciones.find((a) => a.code === rf.accion)?.name;
      body.solution = [accion, (rf.solution || '').trim()].filter(Boolean).join('. ') || undefined;
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
      category: i.category || 'GENERAL', priority: i.priority || 'MEDIA',
      proposal: i.proposal || '', proposalCost: i.proposalCost || '',
      proposalRisk: i.proposalRisk || '', requiresThirdParty: !!i.requiresThirdParty,
    });
  }
  async function submitProposal(e: FormEvent) {
    e.preventDefault();
    setPropSaving(true);
    try {
      await api.patch('/incidents/' + propId, {
        // Bloque 139: aquí el técnico completa lo que quien reportó no sabía.
        category: prop.category || undefined,
        priority: prop.priority || undefined,
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
          <p className="page-sub">{rows.length} incidencias · bitácora de planta</p>
        </div>
        {can('incident.create') && <button className="btn-primary" onClick={() => setShowForm(true)}>+ Nueva incidencia</button>}
      </div>

      {/* REPORTAR ES EL PRIMER PASO, NO EL ÚLTIMO — bloque 72.
          =====================================================================
          Palabras del usuario, y describen exactamente para qué existe este
          módulo: «una incidencia que sólo se queda en incidencia no se podrá
          intervenir». Y la otra mitad, que es la que da sentido a todo:
          «un técnico que no puede asignar OM no significa que se quede de
          brazos cruzados; debe reportar para que se haga una OM lo más
          pronto posible».

          Sin decirlo en pantalla pasan las dos cosas malas:
            · quien reporta cree que con eso ya está pedido el trabajo,
            · y quien mira la lista no sabe que le toca convertirla.

          El texto CAMBIA según lo que cada uno pueda hacer. A quien puede
          abrir órdenes se le dice que le toca; a quien no, se le confirma que
          su parte sirvió — que es lo que hace que vuelva a reportar. */}
      {/* CORTO A PROPÓSITO. La primera versión explicaba lo mismo en cincuenta
          palabras y `verificar:densidad` la tiró: Incidencias pasó de 180 a
          217 palabras. Tenía razón — esto es una lista de trabajo, no un
          manual, y un párrafo encima de la tabla se salta a la segunda vez.
          Dicho en una línea, se lee. */}
      <div className="scan-note" style={{ marginBottom: 12 }}>
        <b>Sin orden no se interviene.</b>{' '}
        {can('wo.create') ? 'Conviértela con el botón → OM.' : 'La abre Mantenimiento.'}
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
                {/* Bloque 171 · `nowrap` sólo en la hora y la fecha. En toda la
                    celda, el nombre y el cargo de quien reportó («Administrador
                    SGIT · Jefe de Mantenimiento») la ensanchaban y el título de
                    la incidencia quedaba en una columna de una palabra. */}
                <td className="muted" style={{ fontSize: 12, minWidth: 130 }}>
                  <div style={{ color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {haceCuanto(i.reportedAt, '—')}
                  </div>
                  <div style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fechaTabla(i.reportedAt, '—')}</div>

                  {/* QUIÉN LA REPORTÓ — bloque 94.
                      Se agrupa en esta misma celda, que ya apila la hora y el
                      estado: la tabla se queda en siete columnas y no hay que
                      tocar el ancho. Sin el nombre, la lista dice que hay un
                      problema pero no a quién preguntar. */}
                  {i.reportedBy && (
                    <div style={{ fontSize: 11, color: 'var(--text)' }}>
                      <b>{i.reportedBy.fullName}</b>
                      {i.reportedBy.role?.name ? ` · ${i.reportedBy.role.name}` : ''}
                    </div>
                  )}

                  {i.resolvedAt
                    ? (
                      <div style={{ fontSize: 11, color: 'var(--ok)' }}>
                        resuelta {fechaTabla(i.resolvedAt)}
                      </div>
                    )
                    : <div style={{ fontSize: 11 }}>abierta</div>}

                  {/* Sólo se pinta cuando se sabe. La mayoría de las veces no
                      se sabe, y una línea «ocurrió: —» en todas las filas es
                      ruido que esconde las pocas que sí lo traen — que son
                      justo las que interesan. */}
                  {i.occurredAt && (
                    <div style={{ fontSize: 11 }} title="Cuándo se cayó de verdad, no cuándo se avisó">
                      cayó {fechaTabla(i.occurredAt)}
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
                    <select aria-label="Estado de la incidencia"
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
                  {can('wo.create') && openIssue(i) && (
                    <button className="btn-mini" style={{ fontWeight: 600 }}
                      title="Crear la orden de trabajo con los datos de esta incidencia"
                      onClick={() => setConvirtiendo(i)}>
                      → OM
                    </button>
                  )}
                  {can('incident.close') && openIssue(i) && <button className="btn-mini" onClick={() => openResolve(i.id)}>Resolver</button>}
                  {/* BLOQUE 171 · seis botones por fila eran una pared (la misma
                      queja que Órdenes en el bloque 133). Delante quedan el
                      estado, «→ OM» y «Resolver», que deciden; lo demás va al
                      menú «⋯». Nada se quita. */}
                  <details className="acciones-fila">
                    <summary className="btn-mini" style={{ cursor: 'pointer' }}
                      aria-label="Más acciones de esta incidencia" title="Más acciones">⋯</summary>
                    <div className="acciones-fila-menu">
                      {can('incident.update') && <button className="btn-mini" onClick={() => openPhotos(i.id)}>Fotos</button>}
                      {can('incident.update') && openIssue(i) && (
                        <button className="btn-mini" onClick={() => openProposal(i)}>
                          <><Icono n="nota" size={13} /> {i.proposal ? 'Propuesta ✓' : 'Propuesta'}</>
                        </button>
                      )}
                      <button className="btn-mini" onClick={() => downloadReport(i)}>Informe</button>
                      {/* Borrado definitivo. Solo lo pinta si eres Jefe de Mantenimiento. */}
                      <BotonPurgar recurso="incidencia" id={i.id} onBorrado={() => load()} />
                    </div>
                  </details>
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
            {/* BLOQUE 139 · EL FORMULARIO SE PARTE. Quien reporta cuenta qué ve;
                el técnico clasifica después. Pedirle a un operador la
                categoría y la prioridad es pedirle que invente. */}
            <div className="sign-note">
              {completaTecnico ? 'Registra la falla, haya o no orden.' : 'Cuenta qué pasa. El técnico completa el resto.'}
            </div>
            {/* Bloque 169: primero el equipo (rellena la zona y el título), después lo demás. */}
            {/* BLOQUE 121 · agrupado por tipo y con su ubicación. Una
                incidencia puede ser de cualquier equipo, así que NO se filtra:
                se agrupa. Filtrar dejaría fuera justo el que falló. */}
            <SelectorDeActivo
              etiqueta="Activo afectado (opcional)"
              opciones={assets}
              valor={form.assetId}
              onChange={(id) => setForm({ ...form, assetId: id, zone: form.zone.trim() && form.zone !== zonaDe(form.assetId) ? form.zone : zonaDe(id) })}
              vacio="— ninguno —"
            />
            <label>{completaTecnico ? 'Título' : '¿Qué pasa?'}
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required={!completaTecnico} minLength={3}
                placeholder={completaTecnico ? 'Opcional: se arma con la categoría y el equipo' : 'Ej.: la cámara del lecho se ve negra'} />
            </label>
            {completaTecnico && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>Categoría<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{gruposDeCategoria(assets.find((a: any) => a.id === form.assetId)?.type).map((g) => <optgroup key={g.label} label={g.label}>{g.items.map((c) => <option key={c} value={c}>{catEs(c)}</option>)}</optgroup>)}</select></label></div>
              <div style={{ flex: 1 }}><label>Prioridad<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="">{'Según la zona'}</option>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORIDAD_ES[p]}</option>)}</select></label></div>
            </div>
            )}
            <label>Zona o área
              <input value={form.zone} placeholder="Horno, laminación, púlpito…" onChange={(e) => setForm({ ...form, zone: e.target.value })} />
            </label>
            <label>Descripción del problema
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} style={{ width: '100%', resize: 'vertical' }} />
            </label>
            {completaTecnico && (
            <label>Cámaras afectadas (opcional)
              <input type="number" value={form.affectedCameras} onChange={(e) => setForm({ ...form, affectedCameras: e.target.value })} />
            </label>
            )}
            <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Crear incidencia'}</button>
          </form>
        </Modal>
      )}

      {propId && (
        <Modal title="Propuesta técnica de solución" onClose={() => setPropId(null)}>
          <form onSubmit={submitProposal}>
            <div className="sign-note">
              <b>Qué se propone hacer</b> para resolverlo de fondo. Va al informe.
            </div>
            {/* Bloque 139 · la clasificación la completa el técnico, no quien
                reportó. Va primero: es lo que ordena la bandeja. */}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><label>Categoría<select value={prop.category} onChange={(e) => setProp({ ...prop, category: e.target.value })}>{CATEGORY_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.items.map((c) => <option key={c} value={c}>{catEs(c)}</option>)}</optgroup>)}</select></label></div>
              <div style={{ flex: 1 }}><label>Prioridad<select value={prop.priority} onChange={(e) => setProp({ ...prop, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORIDAD_ES[p]}</option>)}</select></label></div>
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
              Necesita a terceros (eléctricos, contratista)
            </label>
            <button className="btn" disabled={propSaving}>{propSaving ? 'Guardando…' : 'Guardar propuesta'}</button>
          </form>
        </Modal>
      )}

      {photoId && (
        <Modal title="Fotografías de campo" onClose={() => setPhotoId(null)}>
          <form onSubmit={uploadPhoto}>
            <div className="sign-note">Fotos de campo. Van al informe PDF.</div>
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
              <div key={ev.id} style={{ fontSize: 12, padding: '4px 0', borderTop: '1px solid var(--border)' }}>
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
            <div className="sign-note">Cómo se resolvió. Al final firmas con tu contraseña.</div>
            <label>¿Qué se hizo para resolverlo?
              <select value={rf.accion} onChange={(e) => setRf({ ...rf, accion: e.target.value })} required={acciones.length > 0}>
                <option value="">{'— elige del catálogo —'}</option>
                {acciones.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
              </select>
            </label>
            <label>{'Detalle (opcional)'}
              <input value={rf.solution} onChange={(e) => setRf({ ...rf, solution: e.target.value })} />
            </label>
            <label>Causa raíz
              <select value={rf.rootCause} onChange={(e) => setRf({ ...rf, rootCause: e.target.value })} required>
                <option value="">{'— elige del catálogo —'}</option>
                {causas.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
                <option value="__OTRA__">{'Otra (no está en el catálogo)'}</option>
              </select>
            </label>
            {rf.rootCause === '__OTRA__' && (
              <label>{'¿Cuál?'}
                <input value={rf.rootCauseOtra} onChange={(e) => setRf({ ...rf, rootCauseOtra: e.target.value })} required minLength={3} />
              </label>
            )}
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
              El jefe de línea ya lo sabe
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
