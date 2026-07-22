import { useEffect, useState } from 'react';
import { api } from '../api/client';

// Acciones y entidades en español
const ACTION_ES: Record<string, string> = {
  LOGIN: 'Inició sesión',
  CREATE: 'Creó',
  UPDATE: 'Actualizó',
  DELETE: 'Eliminó',
  REVEAL: 'Reveló credencial',
  RESOLVE: 'Resolvió incidencia',
  CLOSE_WO: 'Cerró OM',
  CREATE_ASSET: 'Registró activo',
  UPDATE_NETWORK: 'Actualizó IP / red',
  FIRMA_FALLIDA: 'Firma fallida (no se agregó)',
};
const ENTITY_ES: Record<string, string> = {
  auth: 'Autenticación',
  assets: 'Activo',
  'work-orders': 'Orden de mantenimiento',
  work_orders: 'Orden de mantenimiento',
  incidents: 'Incidencia',
  credentials: 'Credencial',
  inventory: 'Inventario',
  spare_parts: 'Repuesto',
  locations: 'Ubicación',
  users: 'Usuario',
};
const actionEs = (a: string) => ACTION_ES[a] || a;
const entityEs = (e: string) => ENTITY_ES[e] || e;

// Extrae un detalle legible del payload "after"
function detailOf(e: any): string {
  const a = e.after || {};
  if (a.assetCode) return a.assetCode + (a.firmadoPor ? ' · firmó: ' + a.firmadoPor : '');
  if (a.om) return a.om + (a.firmadoPor ? ' · firmó: ' + a.firmadoPor : '');
  if (a.intento) return 'intento: ' + a.intento + (a.accion ? ' (' + a.accion + ')' : '');
  if (a.ipAddress) return 'IP: ' + a.ipAddress;
  return e.entityId || '—';
}

export default function Audit() {
  const [data, setData] = useState<any>({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: '100' });
    if (from) params.set('from', new Date(from + 'T00:00:00').toISOString());
    if (to) params.set('to', new Date(to + 'T23:59:59.999').toISOString());
    const res = await api.get('/audit?' + params.toString()).then((r) => r.data).catch(() => ({ data: [], total: 0 }));
    setData(res);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const rows = (data.data || []).filter((e: any) => {
    if (!q) return true;
    const s = (actionEs(e.action) + ' ' + entityEs(e.entity) + ' ' + (e.user?.fullName || '') + ' ' + (e.ip || '') + ' ' + detailOf(e)).toLowerCase();
    return s.includes(q.toLowerCase());
  });

  return (
    <div>
      <h1 className="page-title">Auditoría</h1>
      <p className="page-sub">{data.total} eventos · trazabilidad de accesos y cambios (solo Jefe de Mantenimiento)</p>

      <div className="filters">
        <div><label>Desde</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label>Hasta</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label>Buscar</label><input placeholder="usuario, acción, entidad, IP…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn-primary" onClick={load}>Aplicar fechas</button>
      </div>

      {loading ? <div className="loading">Cargando auditoría…</div> : (
        <div className="card">
          <table>
            <thead>
              <tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th><th>IP</th></tr>
            </thead>
            <tbody>
              {rows.map((e: any) => (
                <tr key={e.id}>
                  <td className="muted">{new Date(e.createdAt).toLocaleString()}</td>
                  <td>{e.user?.fullName || '—'}<div className="muted" style={{ fontSize: 10 }}>{e.user?.email || ''}</div></td>
                  <td><span className={'badge ' + (e.action === 'FIRMA_FALLIDA' ? 'FUERA_SERVICIO' : 'MEDIA')}>{actionEs(e.action)}</span></td>
                  <td>{entityEs(e.entity)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{detailOf(e)}</td>
                  <td className="muted">{e.ip || '—'}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>Sin eventos</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
