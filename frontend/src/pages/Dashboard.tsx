import { useEffect, useState, ReactNode } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

const COLORS = ['#2e5496', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#c0121f', '#0f766e'];

const TYPE_ES: Record<string, string> = {
  CAMERA: 'Cámara', NVR: 'NVR', SWITCH: 'Switch', WIRELESS: 'Enlace', ROUTER: 'Router',
  FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', FIBER: 'Fibra', CABINET: 'Gabinete',
  DECODER: 'Decoder', PC: 'PC / iVMS', OTHER: 'Otro',
};
const STATUS_ES: Record<string, string> = {
  OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento',
  CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock',
};
const CRIT_ES: Record<string, string> = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Crítica' };
const TRAIN_ES: Record<string, string> = {
  TREN_1: 'Tren 1', TREN_2: 'Tren 2', TREN_3: 'Tren 3',
  PATIO: 'Patio / exteriores', PLANTA_GENERAL: 'Planta general', SIN_ASIGNAR: 'Sin asignar',
};

export default function Dashboard() {
  const [kpis, setKpis] = useState<any>(null);
  const [ov, setOv] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [causes, setCauses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Detalle del tren seleccionado
  const [trainDetail, setTrainDetail] = useState<any>(null);
  const [loadingTrain, setLoadingTrain] = useState(false);

  async function openTrain(t: any) {
    setLoadingTrain(true);
    setTrainDetail({ train: t.train, ...t, activos: [] });
    try {
      const d = await api.get('/dashboard/train/' + t.train).then((r) => r.data);
      setTrainDetail({ ...t, ...d });
    } catch { /* se muestra lo que ya se tiene */ }
    finally { setLoadingTrain(false); }
  }

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/kpis').then((r) => r.data).catch(() => null),
      api.get('/dashboard/overview').then((r) => r.data).catch(() => null),
      api.get('/troubleshooting/metrics').then((r) => r.data).catch(() => null),
      api.get('/dashboard/root-causes').then((r) => r.data).catch(() => []),
    ]).then(([k, o, m, c]) => {
      setKpis(k); setOv(o); setMetrics(m); setCauses(c || []); setLoading(false);
    });
  }, []);

  if (loading) return <div className="loading">Cargando indicadores…</div>;

  const tr = (map: Record<string, string>, arr: any[]) =>
    (arr || []).map((x) => ({ ...x, name: map[x.name] || x.name }));

  return (
    <div>
      <h1 className="page-title">Dashboard Ejecutivo</h1>
      <p className="page-sub">Estado de la infraestructura de CCTV y redes — Aceros Arequipa, Planta Pisco</p>

      {/* ───────── Bloque 1: SALUD DE LA VISIÓN (lo que le importa a Producción) ───────── */}
      <div className="section-title">Salud de la visión</div>
      <div className="kpi-grid">
        <Kpi
          label="Disponibilidad de visión"
          value={(kpis?.cameraAvailabilityPct ?? 0) + '%'}
          cls={availClass(kpis?.cameraAvailabilityPct)}
          hint={`${kpis?.cameras ?? 0} cámaras en operación`}
        />
        <Kpi label="Cámaras sin servicio" value={kpis?.camerasDown ?? 0} cls={kpis?.camerasDown ? 'crit' : 'ok'} hint="Fuera de servicio, con incidencia o en mantenimiento" />
        <Kpi label="Incidencias abiertas" value={kpis?.openIncidents ?? 0} cls={kpis?.openIncidents ? 'red' : 'ok'} hint={`${kpis?.criticalIncidents ?? 0} de prioridad alta/crítica`} />
        <Kpi label="Tiempo medio de reparación" value={(metrics?.mttrMinutes ?? 0) + ' min'} hint="MTTR de incidencias resueltas" />
      </div>

      {(ov?.byTrain?.length ?? 0) > 0 && (
        <div className="panel" style={{ marginTop: 4, marginBottom: 22 }}>
          <h3>Estado por Tren de Laminación</h3>
          <div className="train-grid">
            {ov.byTrain.map((t: any) => (
              <button
                key={t.train}
                className={'train-card ' + availClass(t.disponibilidad)}
                onClick={() => openTrain(t)}
                title="Ver detalle del tren"
              >
                <div className="train-name">{TRAIN_ES[t.train] || t.train}</div>
                <div className="train-pct">{t.disponibilidad}%</div>
                <div className="train-bar">
                  <span style={{ width: `${t.disponibilidad}%` }} />
                </div>
                <div className="train-detail">
                  {t.total} activos · {t.camaras} cámaras
                </div>
                <div className="train-chips">
                  {t.fueraServicio > 0 && <span className="chip crit">{t.fueraServicio} fuera de servicio</span>}
                  {t.conIncidencia > 0 && <span className="chip warn">{t.conIncidencia} con incidencia</span>}
                  {t.enMantenimiento > 0 && <span className="chip info">{t.enMantenimiento} en mant.</span>}
                  {t.fueraServicio === 0 && t.conIncidencia === 0 && t.enMantenimiento === 0 && (
                    <span className="chip ok">Todo operativo</span>
                  )}
                </div>
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
            Haz clic en un tren para ver qué equipos requieren atención.
          </div>
        </div>
      )}

      {trainDetail && (
        <Modal title={'Detalle · ' + (TRAIN_ES[trainDetail.train] || trainDetail.train)} onClose={() => setTrainDetail(null)}>
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
            <div className="kpi"><div className="label">Disponibilidad</div><div className="value">{trainDetail.disponibilidad ?? 0}%</div></div>
            <div className="kpi"><div className="label">Cámaras</div><div className="value">{trainDetail.camaras ?? 0}</div><div className="hint">{trainDetail.camarasCaidas ?? 0} con problema</div></div>
            <div className="kpi warn"><div className="label">OM abiertas</div><div className="value">{trainDetail.omAbiertas ?? 0}</div></div>
            <div className="kpi red"><div className="label">Incidencias</div><div className="value">{trainDetail.incidenciasAbiertas ?? 0}</div></div>
          </div>

          <div className="detail-sec">
            <h4>Equipos que requieren atención</h4>
            {loadingTrain ? (
              <div className="muted" style={{ fontSize: 12 }}>Cargando…</div>
            ) : trainDetail.activos?.length ? (
              trainDetail.activos.map((a: any) => (
                <div key={a.id} className="frow">
                  <span className="v" style={{ fontSize: 13 }}>
                    {a.assetCode}
                    <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>
                      {' · '}{a.location?.name || '—'}{a.cabinet?.code ? ` · ${a.cabinet.code}` : ''}
                    </span>
                  </span>
                  <span className={'badge ' + a.effectiveStatus} style={{ fontSize: 10 }}>
                    {STATUS_ES[a.effectiveStatus] || a.effectiveStatus}
                  </span>
                </div>
              ))
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>
                Todos los equipos de esta zona están operativos.
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ───────── Bloque 2: CUMPLIMIENTO DEL MANTENIMIENTO (el Jefe) ───────── */}
      <div className="section-title">Cumplimiento del mantenimiento</div>
      <div className="kpi-grid">
        <Kpi
          label="Cumplimiento preventivo"
          value={(kpis?.preventiveCompliancePct ?? 100) + '%'}
          cls={complianceClass(kpis?.preventiveCompliancePct)}
          hint={`${kpis?.preventiveOverdue ?? 0} planes vencidos`}
        />
        <Kpi label="OM pendientes" value={kpis?.pendingWorkOrders ?? 0} cls="warn" hint="Abiertas, en proceso o en espera" />
        <Kpi label="OM vencidas" value={kpis?.overdueWorkOrders ?? 0} cls={kpis?.overdueWorkOrders ? 'crit' : 'ok'} hint="Programadas y no ejecutadas" />
        <Kpi label="OM próximas (7 días)" value={kpis?.upcomingWorkOrders ?? 0} hint="Planificar cuadrilla" />
      </div>

      {/* ───────── Bloque 3: RECURSOS Y RIESGO ───────── */}
      <div className="section-title">Recursos y riesgo</div>
      <div className="kpi-grid">
        <Kpi label="Activos críticos" value={kpis?.criticalAssets ?? 0} cls="warn" hint="Su falla afecta producción" />
        <Kpi label="Repuestos bajo mínimo" value={kpis?.lowStockParts ?? 0} cls={kpis?.lowStockParts ? 'crit' : 'ok'} hint="Reponer en almacén" />
        <Kpi label="Accesos por aprobar" value={kpis?.accessRequestsPending ?? 0} cls={kpis?.accessRequestsPending ? 'warn' : 'ok'} hint="Manlift / trabajo en altura" />
        <Kpi label="Activos totales" value={kpis?.totalAssets ?? 0} hint="Inventario técnico" />
      </div>

      {/* ───────── Gráficos ───────── */}
      <div className="section-title">Análisis</div>
      <div className="panel-grid">
        <Panel title="Activos por estado operativo">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={tr(STATUS_ES, ov?.byStatus)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={10} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="value" fill="#2e5496" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Activos por tipo">
          {(ov?.byType?.length ?? 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={tr(TYPE_ES, ov.byType)} dataKey="value" nameKey="name" outerRadius={80} label>
                  {ov.byType.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="empty">Sin datos</div>}
        </Panel>

        <Panel title="Activos por criticidad">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={tr(CRIT_ES, ov?.byCriticality)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="value" fill="#c0121f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Causas raíz más frecuentes">
          {causes.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={causes} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} fontSize={11} />
                <YAxis type="category" dataKey="name" width={170} fontSize={9} />
                <Tooltip />
                <Bar dataKey="value" fill="#d97706" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">
              Aún sin causas raíz registradas.<br />
              <span style={{ fontSize: 11 }}>Se llenan al resolver incidencias indicando la causa raíz.</span>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ label, value, cls, hint }: { label: string; value: any; cls?: string; hint?: string }) {
  return (
    <div className={'kpi ' + (cls || '')}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <div className="panel"><h3>{title}</h3>{children}</div>;
}

function availClass(pct: number | null | undefined) {
  if (pct == null) return '';
  if (pct >= 95) return 'ok';
  if (pct >= 80) return 'warn';
  return 'crit';
}
function complianceClass(pct: number | null | undefined) {
  if (pct == null) return '';
  if (pct >= 90) return 'ok';
  if (pct >= 70) return 'warn';
  return 'crit';
}
