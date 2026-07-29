import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * Tablero POR TREN. Cada zona productiva tiene su propia pantalla, sin mezclarse
 * con el resto de la planta. Pensado para que lo entienda cualquiera: un semáforo
 * grande, texto en lenguaje claro y solo lo que requiere acción.
 */
const TRAINS = [
  { id: 'TREN_1', label: 'Tren 1' },
  { id: 'TREN_2', label: 'Tren 2' },
  { id: 'TREN_3', label: 'Tren 3' },
  { id: 'PATIO', label: 'Patio' },
  { id: 'PLANTA_GENERAL', label: 'Planta general' },
  { id: 'SIN_ASIGNAR', label: 'Sin asignar' },
];
const STATUS_ES: Record<string, string> = {
  OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento',
  CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock',
};
const TYPE_ES: Record<string, string> = {
  CAMERA: 'Cámara', NVR: 'NVR', SWITCH: 'Switch', WIRELESS: 'Enlace', ROUTER: 'Router',
  FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', FIBER: 'Fibra', CABINET: 'Gabinete',
  DECODER: 'Decoder', PC: 'PC / iVMS', OTHER: 'Otro',
};
const fmt = (d: any) => (d ? new Date(d).toLocaleDateString() : '—');

/** Semáforo: traduce el porcentaje a un mensaje que cualquiera entiende. */
function semaforo(pct: number) {
  if (pct >= 95) return { cls: 'ok', txt: 'Operación normal', icon: '●' };
  if (pct >= 80) return { cls: 'warn', txt: 'Requiere atención', icon: '●' };
  return { cls: 'crit', txt: 'Situación crítica', icon: '●' };
}

export default function TrainBoard() {
  const [train, setTrain] = useState('TREN_1');
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'atencion' | 'activos' | 'trabajos'>('atencion');

  useEffect(() => {
    setLoading(true);
    api.get('/dashboard/train/' + train)
      .then((r) => setD(r.data))
      .catch(() => setD(null))
      .finally(() => setLoading(false));
  }, [train]);

  const r = d?.resumen;
  const sem = semaforo(r?.disponibilidad ?? 100);

  return (
    <div>
      <h1 className="page-title">Estado por Tren</h1>
      <p className="page-sub">Situación de la videovigilancia y la red de cada zona productiva</p>

      {/* Selector de tren */}
      <div className="train-tabs">
        {TRAINS.map((t) => (
          <button
            key={t.id}
            className={'train-tab' + (train === t.id ? ' active' : '')}
            onClick={() => setTrain(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Cargando estado del tren…</div>
      ) : !d ? (
        <div className="card" style={{ padding: 30, textAlign: 'center' }} >
          <div className="muted">No se pudo cargar la información de esta zona.</div>
        </div>
      ) : r.totalActivos === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)' }}>Sin activos registrados en esta zona</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Asigna el Tren a los equipos desde el módulo <b>Activos</b> para verlos aquí.
          </div>
        </div>
      ) : (
        <>
          {/* Estado general — grande y claro */}
          <div className={'status-hero ' + sem.cls}>
            <div className="sh-left">
              <div className="sh-dot">{sem.icon}</div>
              <div>
                <div className="sh-title">{sem.txt}</div>
                <div className="sh-sub">
                  {r.operativos} de {r.enOperacion} equipos funcionando con normalidad
                </div>
              </div>
            </div>
            <div className="sh-right">
              <div className="sh-pct">{r.disponibilidad}%</div>
              <div className="sh-label">disponibilidad</div>
            </div>
          </div>

          {/* Lo esencial en 4 números */}
          <div className="kpi-grid" style={{ marginTop: 16 }}>
            <Kpi label="Cámaras funcionando" value={`${r.camarasOperativas}/${r.camaras}`}
                 cls={r.camarasCaidas ? 'warn' : 'ok'}
                 hint={r.camarasCaidas ? `${r.camarasCaidas} sin imagen o con falla` : 'Todas operativas'} />
            <Kpi label="Incidencias abiertas" value={r.incidenciasAbiertas}
                 cls={r.incidenciasCriticas ? 'crit' : r.incidenciasAbiertas ? 'warn' : 'ok'}
                 hint={r.incidenciasCriticas ? `${r.incidenciasCriticas} de prioridad alta` : 'Sin urgencias'} />
            <Kpi label="Trabajos pendientes" value={r.omAbiertas}
                 cls={r.omVencidas ? 'crit' : 'warn'}
                 hint={r.omVencidas ? `${r.omVencidas} fuera de plazo` : 'Dentro de plazo'} />
            <Kpi label="Preventivos vencidos" value={r.preventivosVencidos}
                 cls={r.preventivosVencidos ? 'crit' : 'ok'}
                 hint={r.preventivosVencidos ? 'Reprogramar limpieza/revisión' : 'Plan al día'} />
          </div>

          {/* Desglose visual del estado */}
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>Cómo están los {r.enOperacion} equipos de esta zona</h3>
            <div className="stack-bar">
              <Seg n={r.operativos} tot={r.enOperacion} cls="ok" />
              <Seg n={r.enMantenimiento} tot={r.enOperacion} cls="info" />
              <Seg n={r.conIncidencia} tot={r.enOperacion} cls="warn" />
              <Seg n={r.fueraServicio} tot={r.enOperacion} cls="crit" />
            </div>
            <div className="stack-legend">
              <Leg cls="ok" n={r.operativos} t="Operativos" />
              <Leg cls="info" n={r.enMantenimiento} t="En mantenimiento" />
              <Leg cls="warn" n={r.conIncidencia} t="Con incidencia" />
              <Leg cls="crit" n={r.fueraServicio} t="Fuera de servicio" />
            </div>
          </div>

          {/* Pestañas de detalle */}
          <div className="subtabs">
            <button className={'subtab' + (tab === 'atencion' ? ' active' : '')} onClick={() => setTab('atencion')}>
              Requieren atención ({d.requierenAtencion?.length ?? 0})
            </button>
            <button className={'subtab' + (tab === 'trabajos' ? ' active' : '')} onClick={() => setTab('trabajos')}>
              Trabajos e incidencias ({(d.ordenes?.length ?? 0) + (d.incidencias?.length ?? 0)})
            </button>
            <button className={'subtab' + (tab === 'activos' ? ' active' : '')} onClick={() => setTab('activos')}>
              Todos los equipos ({r.totalActivos})
            </button>
          </div>

          {tab === 'atencion' && (
            <div className="card">
              <table>
                <thead><tr><th>Equipo</th><th>Tipo</th><th>Ubicación</th><th>Criticidad</th><th>Estado</th></tr></thead>
                <tbody>
                  {d.requierenAtencion?.map((a: any) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.assetCode}</td>
                      <td className="muted">{TYPE_ES[a.type] || a.type}</td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {a.location?.name || '—'}{a.cabinet?.code ? ` · ${a.cabinet.code}` : ''}
                      </td>
                      <td><span className={'badge ' + a.criticality}>{a.criticality}</span></td>
                      <td><span className={'badge ' + a.effectiveStatus}>{STATUS_ES[a.effectiveStatus]}</span></td>
                    </tr>
                  ))}
                  {!d.requierenAtencion?.length && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 34 }}>
                      <div style={{ fontSize: 15, color: 'var(--ok)', fontWeight: 600 }}>✓ Todo en orden</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Ningún equipo de esta zona requiere atención.</div>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'trabajos' && (
            <>
              <div className="section-title">Órdenes de mantenimiento abiertas</div>
              <div className="card">
                <table>
                  <thead><tr><th>Código</th><th>Equipo</th><th>Tipo</th><th>Trabajo</th><th>Programada</th></tr></thead>
                  <tbody>
                    {d.ordenes?.map((w: any) => (
                      <tr key={w.id}>
                        <td style={{ fontWeight: 600 }}>{w.code}</td>
                        <td className="muted">{w.asset?.assetCode}</td>
                        <td className="muted" style={{ fontSize: 11 }}>{w.type}</td>
                        <td style={{ fontSize: 12 }}>{w.activity || '—'}</td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {fmt(w.scheduledDate)}
                          {w.vencida && <div><span className="badge FUERA_SERVICIO" style={{ fontSize: 10 }}>Vencida</span></div>}
                        </td>
                      </tr>
                    ))}
                    {!d.ordenes?.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 24 }}>Sin trabajos pendientes.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="section-title">Incidencias abiertas</div>
              <div className="card">
                <table>
                  <thead><tr><th>Código</th><th>Equipo</th><th>Problema</th><th>Prioridad</th><th>Reportada</th></tr></thead>
                  <tbody>
                    {d.incidencias?.map((i: any) => (
                      <tr key={i.id}>
                        <td style={{ fontWeight: 600 }}>{i.code}</td>
                        <td className="muted">{i.asset?.assetCode || '—'}</td>
                        <td style={{ fontSize: 12 }}>{i.title}</td>
                        <td><span className={'badge ' + i.priority}>{i.priority}</span></td>
                        <td className="muted" style={{ fontSize: 12 }}>{fmt(i.reportedAt)}</td>
                      </tr>
                    ))}
                    {!d.incidencias?.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 24 }}>Sin incidencias abiertas.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'activos' && (
            <div className="card">
              <table>
                <thead><tr><th>Equipo</th><th>Tipo</th><th>Ubicación</th><th>Estado</th><th>Próx. preventivo</th></tr></thead>
                <tbody>
                  {d.activos?.map((a: any) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.assetCode}</td>
                      <td className="muted">{TYPE_ES[a.type] || a.type}</td>
                      <td className="muted" style={{ fontSize: 12 }}>{a.location?.name || '—'}</td>
                      <td><span className={'badge ' + a.effectiveStatus}>{STATUS_ES[a.effectiveStatus]}</span></td>
                      <td className="muted" style={{ fontSize: 12 }}>{fmt(a.preventivePlan?.nextDueAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
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
function Seg({ n, tot, cls }: { n: number; tot: number; cls: string }) {
  if (!n || !tot) return null;
  return <span className={'seg ' + cls} style={{ width: `${(n / tot) * 100}%` }} title={`${n}`} />;
}
function Leg({ cls, n, t }: { cls: string; n: number; t: string }) {
  return (
    <span className="leg">
      <span className={'leg-dot ' + cls} />
      <b>{n}</b> {t}
    </span>
  );
}
