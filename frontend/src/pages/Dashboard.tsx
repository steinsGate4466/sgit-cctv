import { useEffect, useState, ReactNode } from 'react';
import { api } from '../api/client';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

const COLORS = ['#2e5496', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#c0121f'];

export default function Dashboard() {
  const [kpis, setKpis] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/kpis').then((r) => r.data).catch(() => null),
      api.get('/assets').then((r) => r.data).catch(() => []),
      api.get('/troubleshooting/metrics').then((r) => r.data).catch(() => null),
    ]).then(([k, a, m]) => {
      setKpis(k);
      setAssets(a || []);
      setMetrics(m);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="loading">Cargando indicadores…</div>;

  const STATUS_ES: Record<string, string> = { OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento', CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock' };
  const byType = groupCount(assets, 'type');
  // Estado efectivo (derivado de OM/incidencias) para que coincida con los módulos.
  const byStatus = groupCount(assets.map((a) => ({ st: STATUS_ES[a.effectiveStatus || a.status] || a.effectiveStatus || a.status })), 'st');
  const byCrit = groupCount(assets, 'criticality');
  const rootCauses = (metrics?.incidentsByRootCause || []).map((c: any) => ({ name: c.category, value: c.count }));

  return (
    <div>
      <h1 className="page-title">Dashboard Ejecutivo</h1>
      <p className="page-sub">Estado de la infraestructura de CCTV y redes — Planta Pisco</p>

      <div className="kpi-grid">
        <Kpi label="Activos totales" value={kpis?.totalAssets ?? 0} />
        <Kpi label="Disponibilidad de visión" value={(kpis?.cameraAvailabilityPct ?? 0) + '%'} cls={availClass(kpis?.cameraAvailabilityPct)} hint={`${kpis?.cameras ?? 0} cámaras`} />
        <Kpi label="Cámaras fuera de servicio" value={kpis?.camerasDown ?? 0} cls={kpis?.camerasDown ? 'crit' : 'ok'} />
        <Kpi label="Activos críticos" value={kpis?.criticalAssets ?? 0} cls="warn" />
        <Kpi label="Incidencias abiertas" value={kpis?.openIncidents ?? 0} cls={kpis?.openIncidents ? 'red' : 'ok'} />
        <Kpi label="Mantenimientos pendientes" value={kpis?.pendingWorkOrders ?? 0} cls="warn" />
        <Kpi label="OM vencidas" value={kpis?.overdueWorkOrders ?? 0} cls={kpis?.overdueWorkOrders ? 'crit' : 'ok'} hint="Programadas y no ejecutadas" />
        <Kpi label="OM próximas (7 días)" value={kpis?.upcomingWorkOrders ?? 0} cls="warn" />
      </div>

      <div className="panel-grid">
        <Panel title="Activos por tipo">
          {byType.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" outerRadius={85} label>
                  {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="empty">Sin datos</div>}
        </Panel>

        <Panel title="Activos por estado">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byStatus}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="value" fill="#2e5496" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Activos por criticidad">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byCrit}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="value" fill="#c0121f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Incidencias por causa raíz">
          {rootCauses.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rootCauses} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} fontSize={11} />
                <YAxis type="category" dataKey="name" width={150} fontSize={10} />
                <Tooltip />
                <Bar dataKey="value" fill="#d97706" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty">Sin incidencias registradas</div>}
        </Panel>
      </div>

      {metrics && (
        <div className="kpi-grid" style={{ marginTop: 22 }}>
          <Kpi label="MTTR (min)" value={metrics.mttrMinutes ?? 0} hint="Tiempo medio de reparación" />
          <Kpi label="Tiempo sin visión (min)" value={metrics.avgVisionDownMinutes ?? 0} hint="Promedio por incidencia" />
          <Kpi label="Incidencias resueltas" value={metrics.resolvedIncidents ?? 0} cls="ok" />
        </div>
      )}
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

function groupCount(arr: any[], key: string) {
  const m: Record<string, number> = {};
  for (const it of arr) {
    const k = it[key] || '—';
    m[k] = (m[k] || 0) + 1;
  }
  return Object.entries(m).map(([name, value]) => ({ name, value }));
}

function availClass(pct: number | null | undefined) {
  if (pct == null) return '';
  if (pct >= 95) return 'ok';
  if (pct >= 80) return 'warn';
  return 'crit';
}
