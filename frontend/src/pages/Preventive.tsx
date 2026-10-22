import { useEffect, useState, FormEvent } from 'react';
import SelectorDeActivo from '../components/SelectorDeActivo';
import { api } from '../api/client';
import RutinasEditor from '../components/RutinasEditor';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';
import { useDialogos } from '../components/Dialogos';
import { fecha } from '../formato';
import { WO_STATUS_ES } from './omCatalogos';
import { ComoSeCalcula } from '../components/Patron';
import { hoyParaInput } from '../fechas';
import { avisoDelNumeroSap, normalizarNumeroSap } from '../avisoSap';
import { mensajeDeError } from '../avisos';

// Estado del plan -> clase de badge existente.
const PLAN_BADGE: Record<string, string> = {
  AL_DIA: 'OPERATIVO', PROXIMO: 'MANTENIMIENTO', VENCIDO: 'FUERA_SERVICIO',
  SIN_PROGRAMAR: 'CON_INCIDENCIA', INACTIVO: 'BAJA',
};
const PLAN_ES: Record<string, string> = {
  AL_DIA: 'Al día', PROXIMO: 'Próximo', VENCIDO: 'Vencido', SIN_PROGRAMAR: 'Sin programar', INACTIVO: 'Inactivo',
};

export default function Preventive() {
  const { avisar } = useDialogos();
  const { can } = useAuth();
  const [plans, setPlans] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [oms, setOms] = useState<any[]>([]);
  /* Bloque 180 · el PROGRAMA: qué rutina toca y si ya tiene su OM de SAP.
     Sustituye a «Generar OM vencidas» y al interruptor de los automáticos:
     SGIT ya no crea preventivas, las genera SAP y aquí se vinculan. */
  const [programa, setPrograma] = useState<any>(null);
  const [vinculando, setVinculando] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<'plan' | 'rutinas'>('plan');

  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [p, s, w, pg] = await Promise.all([
      api.get('/preventive/plans').then((r) => r.data).catch(() => []),
      api.get('/preventive/summary').then((r) => r.data).catch(() => null),
      api.get('/work-orders?type=PREVENTIVO&pageSize=200').then((r) => r.data).catch(() => ({ data: [] })),
      api.get('/preventive/programa?dias=30').then((r) => r.data).catch(() => null),
    ]);
    setPlans(p || []);
    setSummary(s);
    setOms(w.data || []);
    setPrograma(pg);
  }
  useEffect(() => {
    let vigente = true;
    Promise.all([
      api.get('/preventive/plans').then((r) => r.data).catch(() => []),
      api.get('/preventive/summary').then((r) => r.data).catch(() => null),
      api.get('/assets/options').then((r) => r.data).catch(() => []),
      api.get('/work-orders?type=PREVENTIVO&pageSize=200').then((r) => r.data).catch(() => ({ data: [] })),
      api.get('/preventive/programa?dias=30').then((r) => r.data).catch(() => null),
    ]).then(([p, s, a, w, pg]) => {
      if (!vigente) return;
      setPlans(p || []); setSummary(s); setAssets(a || []); setOms(w.data || []); setPrograma(pg); setLoading(false);
    });
    return () => { vigente = false; };
  }, []);

  async function downloadOM(w: any) {
    try {
      const res = await api.get('/work-orders/' + w.id + '/report', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = (w.code || 'informe') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { await avisar('No se pudo generar el informe.'); }
  }
  function openNew() {
    // Bloque 168: vacío = lo decide el ambiente de la etapa y el último preventivo cerrado (servidor).
    setForm({ assetId: '', intervalDays: '', zoneCritical: false, lastServiceAt: '', active: true });
  }
  function openEdit(p: any) {
    setForm({
      assetId: p.assetId, assetCode: p.asset?.assetCode,
      intervalDays: p.intervalDays, zoneCritical: p.zoneCritical,
      lastServiceAt: p.lastServiceAt ? String(p.lastServiceAt).slice(0, 10) : '',
      active: p.active,
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.assetId) { await avisar('Selecciona un activo.'); return; }
    setSaving(true);
    try {
      const body: any = {
        assetId: form.assetId,
        intervalDays: Number(form.intervalDays) || (form.zoneCritical ? 30 : undefined),
        zoneCritical: !!form.zoneCritical,
        active: !!form.active,
      };
      if (form.lastServiceAt) body.lastServiceAt = new Date(form.lastServiceAt + 'T08:00:00').toISOString();
      await api.post('/preventive/plans', body);
      setForm(null);
      await load();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      await avisar(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar el plan.');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="loading">Cargando plan preventivo…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Mantenimiento Preventivo</h1>
          <p className="page-sub" title="30 días en zonas críticas (suciedad), 60 días en el resto.">Programación por activo</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {vista === 'plan' && can('wo.create') && <button className="btn-mini" onClick={openNew}>+ Nuevo plan</button>}
        </div>
      </div>

      {/* El PLAN dice CUÁNDO se visita cada equipo. La RUTINA dice QUÉ se hace
          en esa visita. Son las dos mitades del preventivo y hasta ahora solo
          existía la primera. */}
      <div className="tabs" style={{ margin: '14px 0' }}>
        <button className={vista === 'plan' ? 'tab active' : 'tab'}
          onClick={() => setVista('plan')}>Plan · cuándo</button>
        <button className={vista === 'rutinas' ? 'tab active' : 'tab'}
          onClick={() => setVista('rutinas')}>Rutinas · qué se hace</button>
      </div>

      {vista === 'rutinas' && <RutinasEditor />}

      {vista === 'plan' && (
      <>

      {/* BLOQUE 180 · EL PROGRAMA. Qué rutina toca en 30 días y si ya tiene
          su OM de SAP. SGIT no crea la orden: la genera SAP (plan y hoja de
          ruta) y aquí se VINCULA, con los pasos de la hoja y la fecha. */}
      {programa && <ProgramaPreventivo programa={programa} puedeVincular={can('wo.approve')} onVincular={setVinculando} />}

      <div className="kpi-grid">
        <div className="kpi ok"><div className="label">Al día</div><div className="value">{summary?.alDia ?? 0}</div></div>
        <div className="kpi warn"><div className="label">Próximos (30 días)</div><div className="value">{summary?.proximos ?? 0}</div></div>
        <div className="kpi crit"><div className="label">Vencidos</div><div className="value">{summary?.vencidos ?? 0}</div></div>
        <div className="kpi"><div className="label">Sin programar</div><div className="value">{summary?.sinProgramar ?? 0}</div></div>
        <div className="kpi"><div className="label">Total con plan</div><div className="value">{summary?.total ?? 0}</div></div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Activo</th><th>Ubicación</th><th>Zona</th><th>Intervalo</th><th>Último</th><th>Próximo</th><th>Estado</th>{can('wo.create') && <th></th>}</tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.asset?.assetCode || '—'}</td>
                <td className="muted">{p.asset?.location?.name || '—'}</td>
                <td>{p.zoneCritical ? <span className="badge ALTA">Crítica</span> : <span className="badge BAJA">Normal</span>}</td>
                <td>{p.intervalDays} días</td>
                <td className="muted">{fecha(p.lastServiceAt)}</td>
                <td className="muted">{fecha(p.nextDueAt)}</td>
                <td><span className={'badge ' + (PLAN_BADGE[p.statusPlan] || 'BAJA')}>{PLAN_ES[p.statusPlan] || p.statusPlan}</span></td>
                {can('wo.create') && <td><button className="btn-mini" onClick={() => openEdit(p)}>Editar</button></td>}
              </tr>
            ))}
            {/* Caso vacío: una tabla en blanco se lee como «se rompió», no como
                «todavía no hay nada». UNA línea: antes salían dos seguidas. */}
            {!plans.length && (
              <tr><td colSpan={8} className="fila-vacia">{'Todavía no hay planes. Crea uno con «+ Nuevo plan».'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h3 style={{ margin: '22px 0 10px', color: 'var(--tinta-marca)', fontSize: 15 }}>Órdenes preventivas ({oms.length})</h3>
      <div className="card">
        <table>
          <thead>
            <tr><th>Código</th><th>Activo</th><th>Zona</th><th>Actividad</th><th>Estado</th><th>Programada</th><th></th></tr>
          </thead>
          <tbody>
            {oms.map((w) => (
              <tr key={w.id}>
                <td style={{ fontWeight: 600 }}>
                  {w.code}
                  {/* Bloque 180: la OM es de SAP; sin su número no se abre. */}
                  {w.externalRef
                    ? <div className="num-sap muted" style={{ fontSize: 11, fontWeight: 400 }}>{'SAP ' + w.externalRef}</div>
                    : w.status !== 'CERRADA' && w.status !== 'CANCELADA' && <div className="num-sap-falta" style={{ fontSize: 11 }}>{'Sin N° SAP'}</div>}
                </td>
                <td className="muted">{w.asset?.assetCode || '—'}</td>
                <td className="muted" style={{ fontSize: 12 }}>{w.zone || '—'}</td>
                <td style={{ fontSize: 12 }}>{w.activity || '—'}</td>
                <td><span className={'badge ' + (w.status === 'CERRADA' ? 'OPERATIVO' : w.status === 'CANCELADA' ? 'BAJA' : 'MANTENIMIENTO')}>{WO_STATUS_ES[w.status] || w.status}</span></td>
                <td className="muted" style={{ fontSize: 12 }}>{w.scheduledDate ? fecha(w.scheduledDate) : '—'}</td>
                <td><button className="btn-mini" onClick={() => downloadOM(w)}>Informe</button></td>
              </tr>
            ))}
            {!oms.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>{'Aún no hay OM preventivas: se crean al vincular la OM de SAP de una rutina.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.assetCode ? 'Editar plan · ' + form.assetCode : 'Nuevo plan preventivo'} onClose={() => setForm(null)}>
          <form onSubmit={submit}>
            {!form.assetCode && (
              <>
                <SelectorDeActivo
                  etiqueta="Activo"
                  opciones={assets}
                  /* Bloque 172 · la fuente PoE va dentro del plan de su equipo padre. */
                  excluir={['PHONE', 'PSU']}
                  valor={form.assetId}
                  onChange={(id) => setForm({ ...form, assetId: id })}
                  vacio="— selecciona —"
                />
              </>
            )}
            {/* Optimización 21/10: la casilla «zona crítica → 30 días» repetía a
                mano lo que ya calcula el sistema con la letra A/B/C y el ambiente
                de la etapa (manda el que más exige). Vacío = calculado. */}
            <label>Intervalo (días)
              <input type="number" min={1} value={form.intervalDays} placeholder="Según el ambiente de su etapa" onChange={(e) => setForm({ ...form, intervalDays: e.target.value })} />
            </label>
            <label>Último mantenimiento (opcional)
              <input type="date" max={hoyParaInput()} value={form.lastServiceAt} title="Vacío: se toma el último preventivo cerrado del equipo" onChange={(e) => setForm({ ...form, lastServiceAt: e.target.value })} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, marginTop: 10 }}>
              <input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} style={{ width: 'auto' }} />
              Plan activo
            </label>
            <button className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar plan'}</button>
          </form>
        </Modal>
      )}
      {vinculando && (
        <VincularSap fila={vinculando} onClose={() => setVinculando(null)} onHecho={load} />
      )}
      </>
      )}

      <ComoSeCalcula>
        <p>
          SGIT <b>no crea</b> órdenes preventivas: la OM de cada rutina la
          genera <b>SAP</b> con su plan y su hoja de ruta, y aquí se vincula a
          la rutina que tocaba. Correctivo, mejora e instalación nacen de un aviso.
        </p>
        <p>
          El intervalo de cada plan sale de la <b>criticidad de la zona</b>, que
          declara Producción: 30 días donde hay suciedad y 60 en el resto. Si la
          zona cambia de criticidad, el intervalo cambia solo.
        </p>
      </ComoSeCalcula>
    </div>
  );
}

/* =============================================================================
   BLOQUE 180 · EL PROGRAMA DEL PREVENTIVO
   -----------------------------------------------------------------------------
   Qué rutina toca en los próximos 30 días y si ya tiene su OM de SAP. Lo que
   sale «Sin OM» es trabajo que SAP todavía no generó o que nadie vinculó: es
   la lista con la que el Jefe va a SAP. Vincular lo hace el Jefe (wo.approve).
============================================================================= */
function ProgramaPreventivo({ programa, puedeVincular, onVincular }: {
  programa: any;
  puedeVincular: boolean;
  onVincular: (fila: any) => void;
}) {
  const r = programa?.resumen || {};
  const filas: any[] = programa?.filas || [];
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3>{'Programa · lo que toca en 30 días'}</h3>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        {`${r.tocan ?? 0} rutinas · ${r.sinOm ?? 0} sin OM · ${r.omSinSap ?? 0} sin N° SAP · ${r.vinculadas ?? 0} vinculadas`}
      </div>
      {!filas.length ? (
        <div className="fila-vacia">{'Nada toca en los próximos 30 días.'}</div>
      ) : (
        <div className="desliza">
          <table>
            <thead>
              <tr><th>Equipo</th><th>Toca</th><th>Programada</th><th>OM</th>{puedeVincular && <th></th>}</tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.planId}>
                  <td>
                    <b>{f.assetCode}</b>
                    <div className="muted" style={{ fontSize: 11 }}>{f.zona || '—'}</div>
                  </td>
                  <td className="sin-partir">
                    {fecha(f.vence)}
                    {f.vencida && <div><span className="badge FUERA_SERVICIO">{'Vencida'}</span></div>}
                  </td>
                  <td className="sin-partir" title={f.esperandoParada ? 'La zona exige tren parado: la fecha es la de la próxima ventana de parada.' : undefined}>
                    {fecha(f.programada)}
                    {f.esperandoParada && <div className="muted" style={{ fontSize: 11 }}>{'espera parada'}</div>}
                  </td>
                  <td>
                    {f.orden ? (
                      <>
                        {f.orden.code}
                        {f.orden.externalRef
                          ? <div className="num-sap muted" style={{ fontSize: 11 }}>{'SAP ' + f.orden.externalRef}</div>
                          : <div className="num-sap-falta" style={{ fontSize: 11 }}>{'Sin N° SAP'}</div>}
                      </>
                    ) : <span className="num-sap-falta">{'Sin OM'}</span>}
                  </td>
                  {puedeVincular && (
                    <td>
                      {!f.orden?.externalRef && (
                        <button className="btn-mini" onClick={() => onVincular(f)}>{'Vincular OM SAP'}</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** BLOQUE 180 · apuntar la OM que generó SAP en la rutina que tocaba. */
function VincularSap({ fila, onClose, onHecho }: { fila: any; onClose: () => void; onHecho: () => void }) {
  const [numero, setNumero] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const malo = avisoDelNumeroSap(numero);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!normalizarNumeroSap(numero)) { setError('Escribe el N° de la OM que generó SAP.'); return; }
    if (malo) { setError(malo); return; }
    setGuardando(true); setError('');
    try {
      const r = await api.post(`/preventive/activo/${fila.assetId}/vincular-sap`, { numero: normalizarNumeroSap(numero) });
      onHecho();
      /* Lo que hay que saber se dice ANTES de cerrar: un N° SAP repetido o
         que la rutina espera una parada de tren. */
      const partes = [
        r.data?.aviso,
        r.data?.esperandoParada ? 'La zona exige tren parado: la orden queda para la próxima ventana de parada.' : '',
      ].filter(Boolean);
      if (partes.length) setAviso(partes.join(' ')); else onClose();
    } catch (err: any) {
      setError(mensajeDeError(err, 'vincular la OM de SAP'));
    } finally { setGuardando(false); }
  }

  return (
    <Modal title={'Vincular OM SAP · ' + fila.assetCode} onClose={onClose}>
      <form onSubmit={guardar}>
        <div className="sign-note">
          {fila.orden
            ? `Se apunta en ${fila.orden.code}, la preventiva que ya tiene.`
            : 'La orden nace con los pasos de su hoja de ruta y la fecha del programa.'}
        </div>
        <label>{'N° de la OM preventiva en SAP'}
          <input className="num-sap" value={numero} maxLength={20} inputMode="numeric" placeholder="Ej.: 4000123456"
            disabled={!!aviso} onChange={(e) => { setNumero(e.target.value); setError(''); }} />
        </label>
        {malo && <div className="num-sap-falta" style={{ fontSize: 12 }}>{malo}</div>}
        {error && <div className="error">{error}</div>}
        {aviso ? (
          <>
            <div className="num-sap-falta" style={{ fontSize: 12, marginTop: 6 }}>{aviso}</div>
            <button type="button" className="btn" onClick={onClose}>{'Entendido'}</button>
          </>
        ) : (
          <button className="btn" disabled={guardando}>{guardando ? 'Vinculando…' : 'Vincular'}</button>
        )}
      </form>
    </Modal>
  );
}
