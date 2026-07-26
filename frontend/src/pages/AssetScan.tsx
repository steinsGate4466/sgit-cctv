import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

/**
 * Ficha rápida del activo — destino del código QR pegado en el equipo.
 * Pensada para el CELULAR en planta: el técnico escanea y ve de inmediato
 * qué equipo es, cómo está y qué puede hacer, sin buscarlo entre cientos.
 */
const TYPE_ES: Record<string, string> = {
  CAMERA: 'Cámara', NVR: 'NVR', SWITCH: 'Switch', WIRELESS: 'Enlace inalámbrico', ROUTER: 'Router',
  FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', FIBER: 'Fibra', CABINET: 'Gabinete',
  DECODER: 'Decodificador', PC: 'PC / iVMS-4200', OTHER: 'Otro',
};
const STATUS_ES: Record<string, string> = {
  OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento',
  CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock',
};

export default function AssetScan() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const [a, setA] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/assets/' + id)
      .then((r) => setA(r.data))
      .catch(() => setErr('No se encontró el activo. Verifica la etiqueta o consulta al Jefe de Mantenimiento.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading">Cargando equipo…</div>;
  if (err) return <div className="scan-wrap"><div className="error">{err}</div></div>;

  const estado = a.effectiveStatus || a.status;

  return (
    <div className="scan-wrap">
      <div className="scan-head">
        <div className="scan-code">{a.assetCode}</div>
        <span className={'badge ' + estado}>{STATUS_ES[estado] || estado}</span>
      </div>

      <div className="card scan-card">
        <Row k="Tipo" v={TYPE_ES[a.type] || a.type} />
        <Row k="Marca / Modelo" v={[a.brand, a.model].filter(Boolean).join(' ')} />
        <Row k="Ubicación" v={a.location?.name} />
        <Row k="Gabinete" v={a.cabinet ? `${a.cabinet.code} — ${a.cabinet.name}` : null} />
        <Row k="Referencia" v={a.referencePlace} />
        <Row k="Criticidad" v={a.criticality} />
        {can('credential.read') && <Row k="IP" v={a.ipAddress} mono />}
      </div>

      {a.accessRequests?.length > 0 && (
        <div className="sign-note" style={{ marginTop: 12 }}>
          🦺 Este equipo tiene una solicitud de <b>acceso especial</b> ({a.accessRequests[0].status}).
          Revisa las condiciones antes de intervenir.
        </div>
      )}

      {a.preventivePlan?.nextDueAt && (
        <div className="scan-note">
          🗓️ Próximo preventivo: <b>{new Date(a.preventivePlan.nextDueAt).toLocaleDateString()}</b>
          {' '}(cada {a.preventivePlan.intervalDays} días)
        </div>
      )}

      <div className="scan-actions">
        {can('incident.create') && (
          <button className="btn-primary" onClick={() => nav('/incidents')}>⚠ Reportar incidencia</button>
        )}
        {can('asset.read') && (
          <button className="btn-mini" onClick={() => nav('/assets')}>Ver ficha completa</button>
        )}
        {can('wo.read') && (
          <button className="btn-mini" onClick={() => nav('/maintenance')}>Órdenes de mantenimiento</button>
        )}
      </div>

      {a.workOrders?.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 22 }}>Últimas intervenciones</div>
          <div className="card scan-card">
            {a.workOrders.slice(0, 5).map((w: any) => (
              <div key={w.code} className="frow">
                <span className="v" style={{ fontSize: 13 }}>{w.code} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>({w.type})</span></span>
                <span className={'badge ' + (w.status === 'CERRADA' ? 'OPERATIVO' : 'MANTENIMIENTO')} style={{ fontSize: 10 }}>{w.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: any; mono?: boolean }) {
  return (
    <div className="frow">
      <span className="k">{k}</span>
      <span className="v" style={mono ? { fontFamily: 'monospace', fontSize: 12 } : undefined}>
        {v === null || v === undefined || v === '' ? '—' : String(v)}
      </span>
    </div>
  );
}
