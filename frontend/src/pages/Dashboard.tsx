import { useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { EsqueletoTablero } from '../components/Esqueleto';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

const COLORS = ['#2e5496', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#c0121f', '#0f766e'];

const TYPE_ES: Record<string, string> = {
  CAMERA: 'Cámara', NVR: 'NVR', SWITCH: 'Switch', WIRELESS: 'Enlace', ROUTER: 'Router',
  FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', CABINET: 'Gabinete',
  DECODER: 'Decoder', PC: 'PC / iVMS', OTHER: 'Otro',
};
const STATUS_ES: Record<string, string> = {
  OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento',
  CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock',
};
const CRIT_ES: Record<string, string> = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Crítica' };

export default function Dashboard() {
  const nav = useNavigate();
  const [kpis, setKpis] = useState<any>(null);
  const [ov, setOv] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [causes, setCauses] = useState<any[]>([]);
  const [bandeja, setBandeja] = useState<any>(null);
  const [criticos, setCriticos] = useState<any[]>([]);
  const [reparto, setReparto] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      api.get('/dashboard/kpis').then((r) => r.data).catch(() => null),
      api.get('/dashboard/overview').then((r) => r.data).catch(() => null),
      api.get('/troubleshooting/metrics').then((r) => r.data).catch(() => null),
      api.get('/dashboard/root-causes').then((r) => r.data).catch(() => []),
      // La bandeja y los puntos criticos YA existian como pantallas; el
      // tablero solo trae su resumen para contestar lo primero que uno se
      // pregunta al abrir: "¿que hago primero?" y "¿donde me duele la red?".
      api.get('/dashboard/bandeja').then((r) => r.data).catch(() => null),
      api.get('/network/criticos').then((r) => r.data?.equipos || []).catch(() => []),
      /* EL REPARTO DEL TRABAJO (bloque 80). Lo pidió el usuario aquí: es el
         quesito que el ingeniero dibujó en el centro de su hoja, y el Dashboard
         es la pantalla de ANÁLISIS. En Indicadores sigue estando con su meta
         al lado; aquí va la foto de hoy, que es lo que se mira al entrar. */
      api.get('/indicadores', { params: { dias: 90 } })
        .then((r) => r.data?.reparto).catch(() => null),
    ]).then(([k, o, m, c, b, cr, rep]) => {
      setKpis(k); setOv(o); setMetrics(m); setCauses(c || []);
      setBandeja(b); setCriticos(cr.slice(0, 3)); setReparto(rep); setLoading(false);
    });
  }, []);

  if (loading) return <EsqueletoTablero kpis={4} paneles={2} />;

  const tr = (map: Record<string, string>, arr: any[]) =>
    (arr || []).map((x) => ({ ...x, name: map[x.name] || x.name }));

  return (
    <div>
      <h1 className="page-title">Dashboard Ejecutivo</h1>
      <p className="page-sub">Estado de la infraestructura de CCTV y redes — Aceros Arequipa, Planta Pisco</p>

      {/* ───────── ¿QUÉ HAGO PRIMERO? ─────────
          Va ANTES que los números. Un tablero que solo describe obliga a
          deducir; este empieza diciendo qué espera una decisión HOY, y cada
          tarjeta lleva directo a la pantalla donde se resuelve. */}
      {bandeja?.resumen && bandeja.resumen.total > 0 && (
        <>
          <div className="section-title">Qué hago primero</div>
          <div className="accion-strip">
            {bandeja.resumen.vencidas > 0 && (
              <button className="accion crit" onClick={() => nav('/bandeja')}>
                <b>{bandeja.resumen.vencidas}</b> órdenes vencidas
                <span>pasaron de fecha y siguen abiertas</span>
              </button>
            )}
            {bandeja.resumen.incidenciasCriticas > 0 && (
              <button className="accion crit" onClick={() => nav('/incidents')}>
                <b>{bandeja.resumen.incidenciasCriticas}</b> incidencias críticas
                <span>abiertas ahora mismo</span>
              </button>
            )}
            {bandeja.resumen.sinDetallar > 0 && (
              <button className="accion warn" onClick={() => nav('/bandeja')}>
                <b>{bandeja.resumen.sinDetallar}</b> órdenes sin detallar
                <span>asignadas pero aún no se pueden trabajar</span>
              </button>
            )}
            {bandeja.resumen.esperaExcedida > 0 && (
              <button className="accion warn" onClick={() => nav('/bandeja')}>
                <b>{bandeja.resumen.esperaExcedida}</b> esperas excedidas
                <span>llevan parado más de lo que su motivo permite</span>
              </button>
            )}
            {bandeja.resumen.accesos > 0 && (
              <button className="accion warn" onClick={() => nav('/access')}>
                <b>{bandeja.resumen.accesos}</b> permisos de altura
                <span>esperan tu autorización</span>
              </button>
            )}
            {bandeja.resumen.bajoMinimo > 0 && (
              <button className="accion" onClick={() => nav('/inventory')}>
                <b>{bandeja.resumen.bajoMinimo}</b> repuestos bajo mínimo
                <span>reponer antes de que falten</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Riesgo de red: los 3 equipos que más cámaras se llevarían por
          delante. Sale del análisis de impacto (bloque 7); aquí solo asoma. */}
      {criticos.length > 0 && criticos[0]?.camarasAfectadas > 0 && (
        <div className="riesgo-strip" onClick={() => nav('/topologia')} role="button" tabIndex={0}>
          <span className="rs-titulo">Puntos críticos de la red:</span>
          {criticos.map((c: any) => (
            <span key={c.id} className="rs-item">
              <b>{c.code}</b> se llevaría <b>{c.camarasAfectadas}</b> cámaras
            </span>
          ))}
          <span className="rs-ver">ver análisis →</span>
        </div>
      )}

      {/* ───────── LO QUE HAY QUE ATENDER (bloque 80) ─────────
          -----------------------------------------------------------------
          Había DOCE indicadores en tres bloques. El usuario: «quita todo eso
          innecesario, sólo deja análisis».

          Tenía razón, y el motivo es que estaban DUPLICADOS: el cumplimiento
          del preventivo y las OM vencidas viven en Indicadores, la salud de la
          visión en «Estado por Tren», los activos totales en Activos. Doce
          números repartidos entre cuatro pantallas hacen que ninguno se mire.

          Se quedan CUATRO, y el criterio es uno solo: **que se pueda hacer
          algo con ellos hoy**. Los cuatro llevan a una pantalla donde actuar;
          los ocho que se fueron sólo describían. */}
      <div className="section-title">Lo que hay que atender</div>
      <div className="kpi-grid">
        <Kpi
          label="Cámaras sin servicio" value={kpis?.camerasDown ?? 0}
          cls={kpis?.camerasDown ? 'crit' : 'ok'}
          hint="Fuera de servicio, con incidencia o en mantenimiento"
          ir={() => nav('/assets?status=FUERA_SERVICIO')}
        />
        <Kpi
          label="Incidencias abiertas" value={kpis?.openIncidents ?? 0}
          cls={kpis?.openIncidents ? 'red' : 'ok'}
          hint={`${kpis?.criticalIncidents ?? 0} de prioridad alta o crítica`}
          ir={() => nav('/incidents')}
        />
        <Kpi
          label="Órdenes vencidas" value={kpis?.overdueWorkOrders ?? 0}
          cls={kpis?.overdueWorkOrders ? 'crit' : 'ok'}
          hint="Programadas y no ejecutadas"
          ir={() => nav('/bandeja')}
        />
        <Kpi
          label="Repuestos bajo mínimo" value={kpis?.lowStockParts ?? 0}
          cls={kpis?.lowStockParts ? 'crit' : 'ok'}
          hint="Reponer en almacén"
          ir={() => nav('/inventory')}
        />
      </div>

      {/* ───────── Gráficos ───────── */}
      <div className="section-title">Análisis</div>
      <div className="panel-grid">
        {/* EL QUESITO DEL INGENIERO, EL PRIMERO DEL ANÁLISIS (bloque 80).
            -----------------------------------------------------------------
            Es el que dibujó en el centro de su hoja, y contesta la pregunta
            que ninguno de los otros contesta: **¿apagamos incendios o nos
            adelantamos?**

            Los otros tres paneles describen el inventario —cuántos hay de cada
            tipo, en qué estado—. Éste describe cómo se TRABAJA, y por eso va
            primero.

            SIN PREDICTIVO: en CCTV no hay nada que predecir. Una cámara da
            imagen o no la da. */}
        <Panel title="Cómo se reparte el trabajo">
          {reparto?.pct ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Correctivo', value: reparto.pct.correctivo },
                      { name: 'Preventivo', value: reparto.pct.preventivo },
                    ].filter((x) => x.value > 0)}
                    dataKey="value" nameKey="name" outerRadius={70} label
                  >
                    {['#c0392b', '#15803d']
                      .filter((_, i) => [reparto.pct.correctivo, reparto.pct.preventivo][i] > 0)
                      .map((c, i) => <Cell key={i} fill={c} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [`${v} %`, String(n)]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="muted" style={{ fontSize: 12 }}>{reparto.lectura}</div>
            </>
          ) : (
            /* No se pinta un quesito vacío: sin órdenes no hay reparto, y un
               círculo en blanco parece un fallo de carga. */
            <div className="empty">Sin órdenes en los últimos 90 días.</div>
          )}
        </Panel>

        <Panel title="Activos por estado operativo">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={tr(STATUS_ES, ov?.byStatus)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={10} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip formatter={(v: any) => [`${v} activo(s)`, '']} labelFormatter={(l: any) => String(l)} />
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
                <Tooltip formatter={(v: any) => [`${v} activo(s)`, '']} labelFormatter={(l: any) => String(l)} />
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
              <Tooltip formatter={(v: any) => [`${v} activo(s)`, '']} labelFormatter={(l: any) => String(l)} />
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
                {/* Aquí lo que se cuenta son VECES QUE APARECIÓ ESA CAUSA, no
                    equipos. Poner «activo(s)» sería mentir con una unidad. */}
                <Tooltip formatter={(v: any) => [`${v} vez(ces)`, '']} labelFormatter={(l: any) => String(l)} />
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

function Kpi({ label, value, cls, hint, ir }: {
  label: string; value: any; cls?: string; hint?: string; ir?: () => void;
}) {
  // Si el indicador sabe a dónde llevar, es un botón. Un número que alarma
  // y no lleva a ningún sitio obliga a buscar en el menú qué pantalla era.
  return (
    <div
      className={'kpi ' + (cls || '') + (ir ? ' kpi-link' : '')}
      onClick={ir}
      role={ir ? 'button' : undefined}
      tabIndex={ir ? 0 : undefined}
      onKeyDown={ir ? (e) => { if (e.key === 'Enter') ir(); } : undefined}
    >
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
