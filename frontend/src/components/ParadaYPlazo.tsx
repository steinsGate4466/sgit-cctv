import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Modal from './Modal';
import { useDialogos } from './Dialogos';
import { fecha, fechaHora } from '../formato';
import { duracion } from '../pages/omCatalogos';

/**
 * PARADA Y PLAZO DE UNA ORDEN — bloques 138 y 135.
 *
 * 138 · «Empezó parada / terminó parada». Se declara aquí, dentro de la orden,
 *       con la hora que dijo la radio. Sustituye al módulo de Ventanas de
 *       parada que había que mantener a mano (bloque 130).
 * 135 · Prórroga. El técnico la PIDE con motivo; el supervisor la aprueba o la
 *       rechaza. Quien la pidió no la resuelve (dos llaves). Sólo al aprobarse
 *       cambia la fecha de la orden.
 *
 * Lo que responde el servidor es la verdad: tras cada acción se vuelve a leer.
 */

const errorDe = (e: any, porDefecto: string) => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m || porDefecto;
};

/** «ahora» en el formato de <input type="datetime-local">, en hora local. */
function ahoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const ESTADO_ES: Record<string, string> = { PENDIENTE: 'Pendiente', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada' };
const ESTADO_BADGE: Record<string, string> = { PENDIENTE: 'MEDIA', APROBADA: 'OPERATIVO', RECHAZADA: 'FUERA_SERVICIO' };

export default function ParadaYPlazo({ wo, onClose, onHecho }: {
  wo: any;
  onClose: () => void;
  onHecho: () => void;
}) {
  const { can, user } = useAuth();
  const { avisar, pedirTexto } = useDialogos();
  const [orden, setOrden] = useState<any>(wo);
  const [prorrogas, setProrrogas] = useState<any[]>([]);
  const [hora, setHora] = useState(ahoraLocal());
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const viva = orden.status !== 'CERRADA' && orden.status !== 'CANCELADA';

  const cargar = useCallback(async () => {
    const [o, p] = await Promise.all([
      api.get('/work-orders/' + wo.id).then((r) => r.data).catch(() => null),
      api.get(`/work-orders/${wo.id}/prorrogas`).then((r) => r.data).catch(() => []),
    ]);
    if (o) setOrden(o);
    setProrrogas(Array.isArray(p) ? p : []);
  }, [wo.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function parada(evento: 'INICIO' | 'FIN') {
    setOcupado(true);
    try {
      await api.post(`/work-orders/${wo.id}/parada`, { evento, hora: new Date(hora).toISOString() });
      await cargar(); onHecho();
    } catch (e) { await avisar(errorDe(e, 'No se pudo guardar la parada.')); }
    finally { setOcupado(false); }
  }

  async function pedir(ev: FormEvent) {
    ev.preventDefault();
    setOcupado(true);
    try {
      await api.post(`/work-orders/${wo.id}/prorrogas`, {
        fechaPedida: new Date(nuevaFecha + 'T08:00:00').toISOString(),
        motivo,
      });
      setNuevaFecha(''); setMotivo('');
      await cargar(); onHecho();
    } catch (e) { await avisar(errorDe(e, 'No se pudo pedir la prórroga.')); }
    finally { setOcupado(false); }
  }

  async function resolver(p: any, aprobar: boolean) {
    let nota: string | null | undefined;
    if (!aprobar) {
      nota = await pedirTexto({ titulo: 'Rechazar la prórroga', mensaje: '¿Por qué? El técnico lo va a leer.', obligatorio: true });
      if (nota === null) return;
    }
    setOcupado(true);
    try {
      await api.post(`/work-orders/${wo.id}/prorrogas/${p.id}/${aprobar ? 'aprobar' : 'rechazar'}`, nota ? { nota } : {});
      await cargar(); onHecho();
    } catch (e) { await avisar(errorDe(e, 'No se pudo resolver.')); }
    finally { setOcupado(false); }
  }

  const minutosReales = orden.paradaInicioReal && orden.paradaFinReal
    ? Math.round((new Date(orden.paradaFinReal).getTime() - new Date(orden.paradaInicioReal).getTime()) / 60000)
    : null;
  const pendiente = prorrogas.find((p) => p.estado === 'PENDIENTE');

  return (
    <Modal title={'Parada y plazo · ' + orden.code} onClose={onClose}>
      {/* ------------------------------------------------------- PARADA (138) */}
      <h3 style={{ margin: '0 0 8px' }}>Parada</h3>
      <dl className="kv" style={{ margin: 0 }}>
        <dt>Estimada</dt>
        <dd>{orden.plannedStopAt ? fechaHora(orden.plannedStopAt) : '—'}
          {orden.plannedDurationMin ? ` · ${duracion(orden.plannedDurationMin)}` : ''}</dd>
        <dt>Empezó</dt><dd>{orden.paradaInicioReal ? fechaHora(orden.paradaInicioReal) : 'sin declarar'}</dd>
        <dt>Terminó</dt><dd>{orden.paradaFinReal ? fechaHora(orden.paradaFinReal) : 'sin declarar'}</dd>
        {minutosReales != null && (<><dt>Duró</dt><dd><b>{duracion(minutosReales)}</b></dd></>)}
      </dl>
      {viva && can('wo.update') && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', margin: '10px 0 18px' }}>
          <label style={{ margin: 0 }}>Hora
            <input type="datetime-local" value={hora} onChange={(e) => setHora(e.target.value)} />
          </label>
          <button className="btn-mini" disabled={ocupado} onClick={() => parada('INICIO')}>Empezó la parada</button>
          <button className="btn-mini" disabled={ocupado || !orden.paradaInicioReal} onClick={() => parada('FIN')}>Terminó la parada</button>
        </div>
      )}

      {/* ------------------------------------------------------ PLAZO (135) */}
      <h3 style={{ margin: '8px 0 8px' }}>Plazo</h3>
      <dl className="kv" style={{ margin: 0 }}>
        <dt>Fecha</dt><dd>{fecha(orden.scheduledDate)}</dd>
        {orden.fechaOriginal && (<><dt>Original</dt><dd>{fecha(orden.fechaOriginal)}</dd></>)}
      </dl>

      {prorrogas.length > 0 && (
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>Pide</th><th>Motivo</th><th>Quién</th><th>Estado</th></tr></thead>
          <tbody>
            {prorrogas.map((p) => (
              <tr key={p.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fecha(p.fechaAnterior)} → <b>{fecha(p.fechaPedida)}</b></td>
                <td style={{ fontSize: 12 }}>{p.motivo}{p.nota ? <div className="muted">Respuesta: {p.nota}</div> : null}</td>
                <td style={{ fontSize: 12 }}>{p.pedidaPor?.fullName || '—'}</td>
                <td>
                  <span className={'badge ' + (ESTADO_BADGE[p.estado] || '')}>{ESTADO_ES[p.estado] || p.estado}</span>
                  {p.estado === 'PENDIENTE' && can('wo.approve') && p.pedidaPor?.id !== user?.id && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button className="btn-mini" disabled={ocupado} onClick={() => resolver(p, true)}>Aprobar</button>
                      <button className="btn-mini" disabled={ocupado} onClick={() => resolver(p, false)}>Rechazar</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viva && can('wo.update') && !pendiente && (
        <form onSubmit={pedir} style={{ marginTop: 12 }}>
          <label>Nueva fecha
            <input type="date" required value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} />
          </label>
          <label>Motivo
            <input required minLength={5} maxLength={500} value={motivo}
              placeholder="Ej.: falta el manlift hasta el jueves"
              onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <button className="btn-primary" disabled={ocupado}>Pedir prórroga</button>
        </form>
      )}
      {pendiente && !can('wo.approve') && (
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Hay una prórroga pedida. La aprueba el supervisor.</p>
      )}
    </Modal>
  );
}
