import { useEffect, useState, ReactNode } from 'react';
import { api } from '../api/client';
import { EsqueletoTablero } from '../components/Esqueleto';
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

export default function Dashboard() {
  const [kpis, setKpis] = useState<any>(null);
  const [ov, setOv] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [causes, setCauses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

  if (loading) return <EsqueletoTablero kpis={4} paneles={2} />;

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

      {/* El estado por Tren tiene su propia pantalla ("Estado por Tren"):
          aquí solo se muestra el resumen ejecutivo de toda la planta. */}
      <div className="hint-link">
        ¿Necesitas el detalle de una zona? Revisa <b>Estado por Tren</b> en el menú.
      </div>

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
