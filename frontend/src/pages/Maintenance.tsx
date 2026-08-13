import { useEffect, useState, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import FiltroAmbito, { Ambito, AMBITO_VACIO, AvisoAmbito } from '../components/FiltroAmbito';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';
import BorrarDefinitivo from '../components/BorrarDefinitivo';
import OmCampo from '../components/OmCampo';
import HistorialActivo from '../components/HistorialActivo';
import AsignarOm from '../components/AsignarOm';
import DetallarOm from '../components/DetallarOm';
import OmMateriales from '../components/OmMateriales';
import { WO_TYPES, WO_TYPE_ES, CANALES, CANAL_ES, CAUSA_ES } from './omCatalogos';
import Icono from '../components/Iconos';

const TYPES = WO_TYPES; // incluye MAPEO: el levantamiento también es una OM
// Estados que el técnico puede fijar al registrar la intervención (el cierre lo hace el Jefe).
const WORK_STATES = ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'];
// Estado efectivo del activo (coherente con el módulo de Activos).
const ASSET_STATUS_ES: Record<string, string> = {
  OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento',
  CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock',
};
const aEs = (s: string) => ASSET_STATUS_ES[s] || s;

// Checklist de condición del equipo (evidencia detallada del técnico).
const CONDITION_ITEMS = ['Limpieza', 'Lente / imagen', 'Cableado', 'Fijación / soporte', 'Energía / PoE', 'Conectividad'];
const COND_STATES = ['OK', 'Observado', 'Cambiar'];

function woBadge(s: string) {
  if (s === 'CERRADA') return 'OPERATIVO';
  if (s === 'CANCELADA') return 'BAJA';
  return 'MANTENIMIENTO';
}

function isOverdue(w: any) {
  return w.scheduledDate && new Date(w.scheduledDate) < new Date() && w.status !== 'CERRADA' && w.status !== 'CANCELADA';
}

export default function Maintenance() {
  const { can, user } = useAuth();
  const navegar = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  // Borrado DEFINITIVO de una orden. No es cancelar: cancelar deja constancia
  // de que se pidió y no se hizo; esto es para el papel que nunca debió
  // existir. El servidor rechaza las CERRADAS y las que sacaron material.
  const [omAPurgar, setOmAPurgar] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Buscador documental (registro para análisis de recurrencias).
  const [fq, setFq] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fType, setFType] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_VACIO);
  const [parametros, setParametros] = useSearchParams();
  // Nombres de las causas del catálogo editable (3E). Sin esto, una causa
  // creada por el usuario saldría en crudo: PRENSAESTOPA_SUELTO.
  const [nombreCausa, setNombreCausa] = useState<Record<string, string>>({});
  // 4A: asignar (ingeniero) y detallar (técnico de red) son dos actos distintos.
  const [asignando, setAsignando] = useState(false);
  const [detallando, setDetallando] = useState<any>(null);
  const [soloSinDetallar, setSoloSinDetallar] = useState(false);

  // Alta de OM (solo Jefe). El código es MANUAL (número que genera SAP).
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const FORM_VACIO = {
    code: '', type: 'PREVENTIVO', assetId: '', locationId: '', activity: '', responsible: '',
    materials: '', zone: '', incidentId: '', scheduledDate: '',
    requestedBy: '', requestChannel: '', externalRef: '',
    plannedStopAt: '', plannedDurationMin: '',
  };
  const [form, setForm] = useState<any>(FORM_VACIO);

  // Registro de intervención (técnico): qué se intervino en el equipo.
  const [intId, setIntId] = useState<string | null>(null);
  const [intForm, setIntForm] = useState<any>({ activity: '', diagnosis: '', materials: '', zone: '', status: 'EN_PROCESO' });
  const [intSaving, setIntSaving] = useState(false);

  // Ejecución en campo: abrir, avance y cierre viven en OmCampo.
  const [campo, setCampo] = useState<{ wo: any; accion: 'abrir' | 'avance' | 'cerrar' } | null>(null);
  // Ubicaciones: una OM de mapeo cubre una zona, no un activo.
  const [locations, setLocations] = useState<any[]>([]);
  // Materiales y reemplazo de equipo de la orden.
  const [matsFor, setMatsFor] = useState<any>(null);

  // Fotografías / evidencias de la intervención.
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: '200' });
    if (fq.trim()) params.set('q', fq.trim());
    if (fType) params.set('type', fType);
    if (fStatus) params.set('status', fStatus);
    // Fecha local → límites de día en ISO/UTC (respeta el día completo).
    if (from) params.set('from', new Date(from + 'T00:00:00').toISOString());
    if (to) params.set('to', new Date(to + 'T23:59:59.999').toISOString());
    // Ámbito de planta: lo resuelve el servidor contra el árbol de ubicaciones.
    if (ambito.tren) params.set('tren', ambito.tren);
    if (ambito.etapa) params.set('etapa', ambito.etapa);
    const [wo, ast, inc, loc] = await Promise.all([
      api.get('/work-orders?' + params.toString()).then((r) => r.data).catch(() => ({ data: [] })),
      api.get('/assets/options').then((r) => r.data).catch(() => []),
      api.get('/incidents').then((r) => r.data).catch(() => []),
      api.get('/locations').then((r) => r.data).catch(() => []),
    ]);
    setRows(wo.data || []);
    setAssets(ast || []);
    setIncidents(Array.isArray(inc) ? inc : inc.data || []);
    setLocations(loc || []);
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

  // Catálogo de causas: se pide una vez y se guarda como diccionario
  // código -> nombre, para traducir lo que muestran las tablas.
  useEffect(() => {
    api.get('/catalogos/CAUSA?todas=true')
      .then((r) => {
        const m: Record<string, string> = {};
        for (const i of r.data?.items || []) m[i.code] = i.name;
        setNombreCausa(m);
      })
      .catch(() => setNombreCausa({}));
  }, []);

  // ALTA PRELLENADA DESDE OTRA PANTALLA (3C).
  // Cableado manda aquí un tramo fuera de norma con la actividad ya redactada.
  // Se abre el formulario con todo puesto y el usuario solo revisa y guarda:
  // es la diferencia entre "hay que abrir una OM" y que la OM esté abierta.
  // Los parámetros se LIMPIAN de la URL después, para que recargar la página
  // no vuelva a abrir el formulario una y otra vez.
  useEffect(() => {
    if (parametros.get('nueva') !== '1') return;
    setForm({
      ...FORM_VACIO,
      type: parametros.get('tipo') || 'MEJORA',
      assetId: parametros.get('activo') || '',
      activity: parametros.get('actividad') || '',
    });
    setParametros({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parametros]);

  function clearFilters() {
    setFq(''); setFrom(''); setTo(''); setFType(''); setFStatus('');
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: any = { type: form.type, activity: form.activity };
      // Activo O ubicación: una orden de mapeo cubre una zona completa.
      if (form.assetId) body.assetId = form.assetId;
      if (form.locationId) body.locationId = form.locationId;
      // Recepción del pedido de Producción
      if (form.requestedBy) body.requestedBy = form.requestedBy.trim();
      if (form.requestChannel) body.requestChannel = form.requestChannel;
      if (form.externalRef) body.externalRef = form.externalRef.trim();
      if (form.plannedStopAt) body.plannedStopAt = new Date(form.plannedStopAt).toISOString();
      if (form.plannedDurationMin) body.plannedDurationMin = Number(form.plannedDurationMin);
      if (form.responsible) body.responsible = form.responsible.trim();
      if (form.materials) body.materials = form.materials;
      if (form.code) body.code = form.code.trim();
      if (form.zone) body.zone = form.zone.trim();
      if (form.incidentId) body.incidentId = form.incidentId;
      if (form.scheduledDate) body.scheduledDate = new Date(form.scheduledDate + 'T08:00:00').toISOString();
      await api.post('/work-orders', body);
      setShowForm(false);
      setForm(FORM_VACIO);
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo crear la orden de mantenimiento.');
    } finally { setSaving(false); }
  }

  function openIntervention(w: any) {
    setIntId(w.id);
    setIntForm({ activity: w.activity || '', diagnosis: w.diagnosis || '', materials: w.materials || '', zone: w.zone || '', status: w.status === 'CERRADA' || w.status === 'CANCELADA' ? 'EN_PROCESO' : w.status, condition: w.condition || {} });
  }
  async function submitIntervention(e: FormEvent) {
    e.preventDefault();
    setIntSaving(true);
    try {
      await api.patch('/work-orders/' + intId, {
        activity: intForm.activity || undefined,
        diagnosis: intForm.diagnosis || undefined,
        materials: intForm.materials || undefined,
        zone: intForm.zone || undefined,
        status: intForm.status,
        condition: intForm.condition && Object.keys(intForm.condition).length ? intForm.condition : undefined,
      });
      setIntId(null);
      await load();
    } catch {
      window.alert('No se pudo registrar la intervención.');
    } finally { setIntSaving(false); }
  }

  async function openPhotos(id: string) {
    setPhotoId(id); setFile(null); setCaption('');
    const ev = await api.get('/work-orders/' + id + '/evidence').then((r) => r.data).catch(() => []);
    setEvidence(ev || []);
  }
  async function uploadPhoto(e: FormEvent) {
    e.preventDefault();
    if (!file) { window.alert('Selecciona una imagen.'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (caption) fd.append('caption', caption);
      await api.post('/work-orders/' + photoId + '/evidence', fd);
      setFile(null); setCaption('');
      const ev = await api.get('/work-orders/' + photoId + '/evidence').then((r) => r.data).catch(() => []);
      setEvidence(ev || []);
      await load();
    } catch {
      window.alert('No se pudo subir la imagen.');
    } finally { setUploading(false); }
  }
  async function downloadReport(w: any) {
    try {
      const res = await api.get('/work-orders/' + w.id + '/report', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = (w.code || 'informe') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert('No se pudo generar el informe.');
    }
  }

  if (loading) return <div className="loading">Cargando órdenes de mantenimiento…</div>;

  const openIncidents = incidents.filter((i) => i.status !== 'CERRADA');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Órdenes de Mantenimiento</h1>
          <p className="page-sub">{rows.length} órdenes · preventivo, correctivo y mejora</p>
        </div>
        {/* ASIGNAR es lo que hará el ingeniero el 95 % de las veces: cuatro
            campos. El alta completa se queda para los casos en que de verdad
            se conoce todo de antemano. */}
        {can('wo.create') && (
          <button className="btn-primary" onClick={() => setAsignando(true)}>+ Asignar trabajo</button>
        )}
        {can('wo.create') && (
          <button className="btn-mini" style={{ marginLeft: 8 }} onClick={() => setShowForm(true)}>
            Alta completa
          </button>
        )}
      </div>

      <AvisoAmbito valor={ambito} total={rows.length} />

      <div className="filters">
        <FiltroAmbito valor={ambito} onChange={setAmbito} />
        <div style={{ flex: 1, minWidth: 180 }}><label>Buscar</label><input placeholder="código OM, incidencia, actividad, zona…" value={fq} onChange={(e) => setFq(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} /></div>
        <div><label>Tipo</label><select value={fType} onChange={(e) => setFType(e.target.value)}><option value="">Todos</option>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
        <div><label>Estado</label><select value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">Todos</option>{['ABIERTA', 'EN_PROCESO', 'EN_ESPERA', 'CERRADA', 'CANCELADA'].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label>Desde</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label>Hasta</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="btn-primary" onClick={load}>Buscar</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, alignSelf: 'flex-end', paddingBottom: 6 }}>
          <input type="checkbox" checked={soloSinDetallar} style={{ width: 'auto' }}
            onChange={(e) => setSoloSinDetallar(e.target.checked)} />
          Solo sin detallar
        </label>
        <button className="btn-mini" onClick={clearFilters}>Limpiar</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Código</th><th>Tipo</th><th>Zona</th><th>Actividad</th><th>Estado</th><th>Avance</th><th>Activo / Ubicación</th><th>Programada</th><th></th></tr>
          </thead>
          <tbody>
            {rows
              .filter((w: any) => !soloSinDetallar || !w.detailedAt)
              .map((w: any) => (
              <tr key={w.id}>
                <td style={{ fontWeight: 600 }}>
                  {w.code}
                  {w.incident && <div className="muted" style={{ fontSize: 10 }}>◦ {w.incident.code}</div>}
                </td>
                <td className="muted" style={{ fontSize: 11 }}>{WO_TYPE_ES[w.type] || w.type}</td>
                <td className="muted" style={{ fontSize: 12 }}>{w.zone || '—'}</td>
                <td style={{ fontSize: 12 }}>{w.activity || '—'}</td>
                <td>
                  <span className={'badge ' + woBadge(w.status)}>{w.status}</span>
                  {w.isRecurrent && <div className="muted" style={{ fontSize: 10 }}>reincidente</div>}
                </td>
                <td style={{ minWidth: 90 }}>
                  {w.status === 'CERRADA' ? (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {/* Se lee el código nuevo primero y el enum después, que
                          es lo que guardan las órdenes cerradas antes de 3E.
                          El nombre sale del catálogo; si no está, de la tabla
                          de siempre; y en último caso, el código en crudo. */}
                      {(() => {
                        const c = w.rootCauseCode || w.rootCause;
                        return c ? (nombreCausa[c] || CAUSA_ES[c] || c) : '—';
                      })()}
                    </span>
                  ) : (
                    <div>
                      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{
                          width: `${w.progressPct || 0}%`, height: '100%',
                          background: (w.progressPct || 0) >= 100 ? '#16a34a' : '#2563eb',
                        }} />
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>{w.progressPct || 0}%</div>
                    </div>
                  )}
                </td>
                <td className="muted">
                  {/* Que se vea SIN tener que mirar la columna de acciones: una
                      orden sin detallar no es trabajo listo, y mezclarla con el
                      resto es como el tablero deja de ser creíble. */}
                  {!w.detailedAt && (
                    <div style={{ fontSize: 10, color: '#b45309', fontWeight: 700 }}>SIN DETALLAR</div>
                  )}
                  {w.scopeChanged && (
                    <div style={{ fontSize: 10, color: 'var(--steel)' }} title={w.scopeNote || ''}>
                      alcance cambiado
                    </div>
                  )}
                  {w.asset?.assetCode
                    || (w.location?.name ? <span style={{ fontStyle: 'italic' }}>{w.location.name}</span> : '—')}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {w.scheduledDate ? new Date(w.scheduledDate).toLocaleDateString() : '—'}
                  {isOverdue(w) && <span className="badge FUERA_SERVICIO" style={{ marginLeft: 6 }}>Vencida</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {/* SIN DETALLAR: es lo primero que hay que hacer con esta
                      orden, así que su botón va delante de todo lo demás.
                      Va FUERA del condicional de abajo, no dentro: meterlo
                      dentro rompía el JSX porque una llave de comentario no
                      puede abrir donde ya se está evaluando una expresión. */}
                  {!w.detailedAt && w.status !== 'CERRADA' && w.status !== 'CANCELADA'
                    && can('wo.update') && (
                    <button className="btn-mini"
                      style={{ borderColor: 'var(--warn)', color: '#b45309', fontWeight: 600, marginRight: 4 }}
                      onClick={() => setDetallando(w)}>
                      Detallar
                    </button>
                  )}
                  {w.status !== 'CERRADA' && w.status !== 'CANCELADA' && can('wo.update') && (
                    <button className="btn-mini" onClick={() => openIntervention(w)}>Registrar</button>
                  )}
                  {w.status !== 'CERRADA' && w.status !== 'CANCELADA' && can('wo.update') && (
                    <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => openPhotos(w.id)}>Fotos</button>
                  )}
                  {w.status !== 'CERRADA' && w.status !== 'CANCELADA' && can('wo.update') && !w.startedAt && (
                    <button className="btn-mini" style={{ marginLeft: 4 }}
                      onClick={() => setCampo({ wo: w, accion: 'abrir' })}>Abrir</button>
                  )}
                  {w.status !== 'CERRADA' && w.status !== 'CANCELADA' && can('wo.update') && w.startedAt && (
                    <button className="btn-mini" style={{ marginLeft: 4 }}
                      onClick={() => setCampo({ wo: w, accion: 'avance' })}>Avance</button>
                  )}
                  {/* En una orden de MAPEO ya abierta, el técnico entra a
                      registrar equipos sin tener que navegar a otra parte:
                      es el flujo natural estando en campo. Los activos que
                      registre quedan ligados a esta orden. */}
                  {w.type === 'MAPEO' && w.startedAt && w.status !== 'CERRADA'
                    && w.status !== 'CANCELADA' && can('asset.create') && (
                    <button className="btn-mini" style={{ marginLeft: 4, fontWeight: 600 }}
                      title="Registrar un activo dentro de esta orden de mapeo"
                      onClick={() => navegar(`/assets?om=${w.id}&codigo=${encodeURIComponent(w.code)}`)}>
                      + Registrar activo
                    </button>
                  )}
                  {w.status !== 'CERRADA' && w.status !== 'CANCELADA' && can('wo.approve') && (
                    <button className="btn-mini" style={{ marginLeft: 4 }}
                      onClick={() => setCampo({ wo: w, accion: 'cerrar' })}>Cerrar</button>
                  )}
                  <button className="btn-mini" style={{ marginLeft: 4 }}
                    title="Materiales previstos/usados y reemplazo de equipo"
                    onClick={() => setMatsFor(w)}><Icono n="inventario" size={14} /> Materiales</button>
                  <button className="btn-mini" style={{ marginLeft: 4 }} onClick={() => downloadReport(w)}>Informe</button>
                  {/* Sólo el Jefe. También en las CERRADAS: antes del estreno,
                      las cerradas de prueba son justo las que estorban. El
                      diálogo pide una segunda confirmación y lo marca como
                      forzado en la auditoría. */}
                  {can('wo.approve') && user?.role === 'Jefe de Mantenimiento' && (
                    <button className="btn-mini btn-peligro" style={{ marginLeft: 4 }}
                      title={w.status === 'CERRADA'
                        ? 'Borrar definitivamente (está cerrada: pedirá segunda confirmación)'
                        : 'Borrar definitivamente: para órdenes de prueba o duplicadas'}
                      onClick={() => setOmAPurgar(w)}><Icono n="papelera" size={14} /> Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 30 }}>Sin órdenes de mantenimiento</td></tr>}
          </tbody>
        </table>
      </div>

      {omAPurgar && (
        <BorrarDefinitivo
          tipo="om"
          id={omAPurgar.id}
          onCerrar={() => setOmAPurgar(null)}
          onBorrado={(r) => {
            setOmAPurgar(null);
            alert(
              `Borrada ${r.code} y ${r.arrastrado} registro(s) asociados.` +
              (r.conservado ? `\n\nSe conservaron ${r.conservado} registro(s) que no dependen de la orden (equipos levantados, inspecciones).` : ''),
            );
            load();
          }}
        />
      )}

      {showForm && (
        <Modal title="Nueva orden de mantenimiento" onClose={() => setShowForm(false)}>
          <form onSubmit={create}>
            <label>Código OM (SAP)</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="N.º generado por SAP (si lo dejas vacío se asigna uno provisional)" />
            <label>Tipo</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{WO_TYPE_ES[t] || t}</option>)}
            </select>
            {form.type === 'MAPEO' ? (
              <>
                <label>Zona a levantar (obligatorio)</label>
                <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value, assetId: '' })} required>
                  <option value="">— selecciona la ubicación —</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 10 }}>
                  Una orden de mapeo cubre una zona: el técnico levantará todos los
                  equipos que encuentre allí.
                </div>
              </>
            ) : (
              <>
                <label>Activo</label>
                <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} required>
                  <option value="">— selecciona —</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.assetCode}</option>)}
                </select>
                <label>O bien una zona completa (si afecta a varios equipos)</label>
                <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                  <option value="">— ninguna —</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </>
            )}
            {/* En cuanto se elige el activo aparece su historial: el ingeniero
                decide con datos en vez de crear la orden a ciegas. */}
            {form.assetId && <HistorialActivo assetId={form.assetId} compacto />}

            <label>Referencia del sitio</label>
            <input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })}
              placeholder="Ej: columna 14, junto a la escalera norte, poste de la izquierda" />
            <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 10 }}>
              El detalle que ayuda a encontrar el punto exacto en planta.
            </div>
            <label>Incidencia relacionada (opcional)</label>
            <select value={form.incidentId} onChange={(e) => setForm({ ...form, incidentId: e.target.value })}>
              <option value="">— ninguna —</option>
              {openIncidents.map((i) => <option key={i.id} value={i.id}>{i.code} — {i.title}</option>)}
            </select>
            <label>Actividad / descripción</label>
            <input value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} />
            <label>Responsable</label>
            <input value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} placeholder="Nombre del responsable de la OM" />
            <label>Materiales (uno por línea)</label>
            <textarea value={form.materials} onChange={(e) => setForm({ ...form, materials: e.target.value })} rows={3} style={{ width: '100%', resize: 'vertical' }} placeholder="Ej: 2x Conector RJ45 / 1x Fuente PoE 48V" />
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Recepción del pedido</div>
              <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
                Producción crea la orden en SAP y la manda por WhatsApp. Registrarlo
                aquí es lo que evita que se pierda de boca en boca.
              </div>
              <label>¿Quién la pidió?</label>
              <input value={form.requestedBy} onChange={(e) => setForm({ ...form, requestedBy: e.target.value })}
                placeholder="Nombre de quien la solicitó en Producción" />
              <label>¿Por dónde llegó?</label>
              <select value={form.requestChannel} onChange={(e) => setForm({ ...form, requestChannel: e.target.value })}>
                <option value="">— sin especificar —</option>
                {CANALES.map((c) => <option key={c} value={c}>{CANAL_ES[c]}</option>)}
              </select>
              <label>N.º de orden en SAP</label>
              <input value={form.externalRef} onChange={(e) => setForm({ ...form, externalRef: e.target.value })}
                placeholder="Si Producción ya la creó en SAP" />
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Parada estimada</div>
              <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
                Es tentativa. El técnico confirmará por radio la hora real cuando esté en campo.
              </div>
              <label>Hora estimada de parada</label>
              <input type="datetime-local" value={form.plannedStopAt}
                onChange={(e) => setForm({ ...form, plannedStopAt: e.target.value })} />
              <label>Duración estimada (minutos)</label>
              <input type="number" min={1} value={form.plannedDurationMin}
                onChange={(e) => setForm({ ...form, plannedDurationMin: e.target.value })}
                placeholder="Ej: 120" />
            </div>

            <label style={{ marginTop: 14 }}>Fecha programada</label>
            <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
            <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Crear OM'}</button>
          </form>
        </Modal>
      )}

      {intId && (
        <Modal title="Registrar intervención" onClose={() => setIntId(null)}>
          <form onSubmit={submitIntervention}>
            <div className="sign-note">Registra qué se está interviniendo en el equipo. El cierre definitivo lo realiza el Jefe de Mantenimiento.</div>
            <label>Zona de intervención</label>
            <input value={intForm.zone} onChange={(e) => setIntForm({ ...intForm, zone: e.target.value })} placeholder="Ej: Horno, Tren 1, Púlpito…" />
            <label>Actividad realizada</label>
            <input value={intForm.activity} onChange={(e) => setIntForm({ ...intForm, activity: e.target.value })} />
            <label>Diagnóstico / detalle de la intervención</label>
            <input value={intForm.diagnosis} onChange={(e) => setIntForm({ ...intForm, diagnosis: e.target.value })} />
            <label>Materiales utilizados (uno por línea)</label>
            <textarea value={intForm.materials} onChange={(e) => setIntForm({ ...intForm, materials: e.target.value })} rows={3} style={{ width: '100%', resize: 'vertical' }} placeholder="Ej: 2x Conector RJ45 / 1x Fuente PoE 48V" />
            <label>Condición del equipo (checklist)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
              {CONDITION_ITEMS.map((item) => (
                <div key={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13 }}>{item}</span>
                  <select
                    value={intForm.condition?.[item] || 'OK'}
                    onChange={(e) => setIntForm({ ...intForm, condition: { ...(intForm.condition || {}), [item]: e.target.value } })}
                    style={{ width: 140 }}
                  >
                    {COND_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>Marca “Observado” o “Cambiar” lo que amerite; alimenta el análisis de reemplazo y el predictivo.</div>
            <label>Estado</label>
            <select value={intForm.status} onChange={(e) => setIntForm({ ...intForm, status: e.target.value })}>
              {WORK_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn" disabled={intSaving}>{intSaving ? 'Guardando…' : 'Guardar intervención'}</button>
          </form>
        </Modal>
      )}


      {asignando && (
        <AsignarOm onHecho={load} onClose={() => setAsignando(false)} />
      )}

      {detallando && (
        <DetallarOm wo={detallando} onHecho={load} onClose={() => setDetallando(null)} />
      )}

      {matsFor && (
        <OmMateriales wo={matsFor} onClose={() => { setMatsFor(null); load(); }} />
      )}

      {campo && (
        <OmCampo
          wo={campo.wo}
          accion={campo.accion}
          onClose={() => setCampo(null)}
          onHecho={load}
        />
      )}

      {photoId && (
        <Modal title="Fotografías de la intervención" onClose={() => setPhotoId(null)}>
          <form onSubmit={uploadPhoto}>
            <div className="sign-note">Sube fotos del trabajo realizado. Se incrustarán en el informe PDF de la OM.</div>
            <label>Imagen (JPG / PNG)</label>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <label>Descripción (opcional)</label>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Ej: cámara T1 antes de la limpieza" />
            <button className="btn" disabled={uploading}>{uploading ? 'Subiendo…' : 'Subir foto'}</button>
          </form>
          <div style={{ marginTop: 14 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{evidence.length} foto(s) registradas</div>
            {evidence.map((ev) => (
              <div key={ev.id} style={{ fontSize: 12, padding: '4px 0', borderTop: '1px solid #eee' }}>
                <Icono n="camara" size={14} /> {ev.caption || '(sin descripción)'} <span className="muted">· {new Date(ev.createdAt).toLocaleString()}</span>
              </div>
            ))}
            {!evidence.length && <div className="muted" style={{ fontSize: 12 }}>Aún no hay fotos.</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
