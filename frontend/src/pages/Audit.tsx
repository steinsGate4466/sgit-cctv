import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { fecha, hora } from '../formato';

/** Traducción de acciones: la auditoría debe leerse sin conocer el código. */
const ACTION_ES: Record<string, string> = {
  LOGIN: 'Inició sesión',
  LOGIN_FALLIDO: 'Intento de acceso fallido',
  LOGIN_BLOQUEADO: 'Acceso bloqueado por intentos',
  CREATE: 'Creó',
  UPDATE: 'Actualizó',
  DELETE: 'Eliminó',
  REVEAL: 'Reveló una contraseña de equipo',
  RESOLVE: 'Resolvió incidencia',
  CLOSE_WO: 'Cerró orden de mantenimiento',
  CREATE_ASSET: 'Registró activo',
  UPDATE_ASSET: 'Editó activo (firmado)',
  DELETE_ASSET: 'Dio de baja un activo',
  UPDATE_NETWORK: 'Actualizó IP / datos de red',
  CREATE_CABINET: 'Registró gabinete',
  UPDATE_CABINET: 'Actualizó gabinete',
  PREVENTIVE_PLAN: 'Configuró plan preventivo',
  PREVENTIVE_GENERATE: 'Generó órdenes preventivas',
  CREATE_ACCESS_REQUEST: 'Solicitó acceso especial',
  UPDATE_ACCESS_REQUEST: 'Actualizó solicitud de acceso',
  APROBAR_ACCESO: 'Aprobó acceso especial',
  RECHAZAR_ACCESO: 'Rechazó acceso especial',
  FIRMA_FALLIDA: 'Firma inválida (no se registró)',
};
const ENTITY_ES: Record<string, string> = {
  auth: 'Autenticación', assets: 'Activo', 'work-orders': 'Orden de mantenimiento',
  work_orders: 'Orden de mantenimiento', incidents: 'Incidencia', credentials: 'Credencial',
  inventory: 'Inventario', spare_parts: 'Repuesto', locations: 'Ubicación', users: 'Usuario',
  cabinets: 'Gabinete', access_requests: 'Solicitud de acceso', preventive_plans: 'Plan preventivo',
};
/** Acciones sensibles: se resaltan para revisarlas primero. */
const CRITICAS = ['FIRMA_FALLIDA', 'LOGIN_FALLIDO', 'LOGIN_BLOQUEADO', 'DELETE_ASSET', 'REVEAL', 'DELETE'];
const APROBACIONES = ['CLOSE_WO', 'RESOLVE', 'APROBAR_ACCESO', 'RECHAZAR_ACCESO'];

const actionEs = (a: string) => ACTION_ES[a] || a;
const entityEs = (e: string) => ENTITY_ES[e] || e;
const badgeOf = (a: string) =>
  CRITICAS.includes(a) ? 'FUERA_SERVICIO' : APROBACIONES.includes(a) ? 'OPERATIVO' : 'MEDIA';

/** Resumen legible de lo que ocurrió, a partir del detalle guardado. */
function detailOf(e: any): string {
  const a = e.after || {};
  const partes: string[] = [];
  if (a.assetCode) partes.push(a.assetCode);
  if (a.codigo) partes.push(a.codigo);
  if (a.om) partes.push(a.om);
  if (a.incidente) partes.push(a.incidente);
  if (a.activo) partes.push(a.activo);
  if (a.code) partes.push(a.code);
  if (a.email) partes.push(a.email);
  if (a.intento) partes.push('intento con: ' + a.intento);
  if (a.motivo) partes.push(a.motivo);
  if (a.accion) partes.push('acción: ' + a.accion);
  if (a.ipAddress) partes.push('nueva IP: ' + a.ipAddress);
  if (a.generadas !== undefined) partes.push(`${a.generadas} generada(s)`);
  if (a.intervaloDias) partes.push(`cada ${a.intervaloDias} días`);
  if (a.firmadoPor) partes.push('firmó: ' + a.firmadoPor);
  if (a.minutosRestantes) partes.push(`espera ${a.minutosRestantes} min`);
  return partes.length ? partes.join(' · ') : (e.entityId ? e.entityId.slice(0, 8) + '…' : '—');
}

export default function Audit() {
  const [data, setData] = useState<any>({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [soloCriticas, setSoloCriticas] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: '200' });
    if (from) params.set('from', new Date(from + 'T00:00:00').toISOString());
    if (to) params.set('to', new Date(to + 'T23:59:59.999').toISOString());
    const res = await api.get('/audit?' + params.toString()).then((r) => r.data).catch(() => ({ data: [], total: 0 }));
    setData(res);
    setLoading(false);
  }
  // La carga es intencionalmente ÚNICA al montar: los filtros de esta pantalla
  // se aplican en memoria, no en el servidor. Declarar `load` como dependencia
  // obligaría a envolverla en useCallback y volvería a consultar el servidor en
  // cada tecla, que es exactamente lo que no queremos aquí.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const todas = data.data || [];
  const rows = todas.filter((e: any) => {
    if (soloCriticas && !CRITICAS.includes(e.action)) return false;
    if (!q) return true;
    const s = (actionEs(e.action) + ' ' + entityEs(e.entity) + ' ' + (e.user?.fullName || '') + ' ' +
      (e.user?.email || '') + ' ' + (e.ip || '') + ' ' + detailOf(e)).toLowerCase();
    return s.includes(q.toLowerCase());
  });

  const nCriticas = todas.filter((e: any) => CRITICAS.includes(e.action)).length;
  const nAccesos = todas.filter((e: any) => e.action.startsWith('LOGIN')).length;
  const nFirmas = todas.filter((e: any) => APROBACIONES.includes(e.action)).length;

  return (
    <div>
      <h1 className="page-title">Auditoría</h1>
      <p className="page-sub">Quién hizo qué, cuándo y desde dónde · trazabilidad completa del sistema</p>

      <div className="kpi-grid">
        <div className="kpi"><div className="label">Eventos registrados</div><div className="value">{data.total}</div><div className="hint">Historial completo</div></div>
        <div className="kpi crit"><div className="label">Eventos sensibles</div><div className="value">{nCriticas}</div><div className="hint">Firmas fallidas, bajas, claves reveladas</div></div>
        <div className="kpi ok"><div className="label">Firmas y aprobaciones</div><div className="value">{nFirmas}</div><div className="hint">Cierres y autorizaciones</div></div>
        <div className="kpi"><div className="label">Accesos al sistema</div><div className="value">{nAccesos}</div><div className="hint">Inicios de sesión e intentos</div></div>
      </div>

      <div className="filters">
        <div><label>Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label></div>
        <div><label>Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label>Buscar
            <input placeholder="usuario, acción, activo, IP…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <button className="btn-primary" onClick={load}>Aplicar fechas</button>
        <button
          className={'btn-mini' + (soloCriticas ? ' btn-danger' : '')}
          onClick={() => setSoloCriticas((v) => !v)}
        >
          {soloCriticas ? '✓ Solo sensibles' : 'Solo sensibles'}
        </button>
      </div>

      {loading ? <div className="loading">Cargando auditoría…</div> : (
        <>
          <div className="card">
            <table>
              <thead>
                <tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Sobre</th><th>Detalle</th><th>Origen</th></tr>
              </thead>
              <tbody>
                {rows.map((e: any) => (
                  <tr key={e.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {fecha(e.createdAt)}
                      <div style={{ fontSize: 11 }}>{hora(e.createdAt)}</div>
                    </td>
                    <td>
                      {e.user?.fullName || <span className="muted">Sistema</span>}
                      <div className="muted" style={{ fontSize: 10 }}>{e.user?.email || ''}</div>
                    </td>
                    <td><span className={'badge ' + badgeOf(e.action)}>{actionEs(e.action)}</span></td>
                    <td className="muted" style={{ fontSize: 12 }}>{entityEs(e.entity)}</td>
                    <td style={{ fontSize: 12 }}>{detailOf(e)}</td>
                    {/* ORIGEN: tres datos apilados, del más útil al más técnico.
                        Arriba el sitio ("PC Púlpito T2") cuando la IP está en el
                        registro de equipos; si no, la IP cruda con un aviso de
                        que ese equipo no está registrado. */}
                    <td style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                      {e.origen
                        ? <div style={{ fontWeight: 700, color: 'var(--navy)' }}>{e.origen}</div>
                        : e.ip && e.ip !== 'local (servidor)'
                          ? <div className="muted" title="Esta IP no está en el registro de equipos conocidos">equipo sin registrar</div>
                          : null}
                      <div className="muted" style={{ fontFamily: 'monospace' }}>{e.ip || '—'}</div>
                      {e.dispositivo && <div className="muted">{e.dispositivo}</div>}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                    Sin eventos que coincidan con el filtro.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>
            Mostrando {rows.length} de {todas.length} eventos cargados · “Origen” es la dirección desde la que se conectó el usuario.
          </div>
        </>
      )}
    </div>
  );
}
