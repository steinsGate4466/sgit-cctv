import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import HistorialActivo from './HistorialActivo';

/**
 * DETALLAR UNA ORDEN — lo que hace el técnico de red.
 *
 * El ingeniero dijo QUÉ hay que hacer. Aquí se pone lo que solo se sabe con el
 * contexto delante: qué equipo exactamente y cuánto va a costar.
 *
 * SE PUEDE CAMBIAR EL EQUIPO. Si el ingeniero pidió revisar la cámara 45 y al
 * llegar se ve que el problema es el switch, arreglar la cámara no sirve de
 * nada. No se impide: se pide el motivo y queda marcado, para que el ingeniero
 * vea qué se pidió frente a qué se hizo.
 */
export default function DetallarOm({ wo, onHecho, onClose }: {
  wo: any; onHecho: () => void; onClose: () => void;
}) {
  const [form, setForm] = useState<any>({
    assetId: wo.assetId || '',
    activity: wo.activity || '',
    plannedDurationMin: wo.plannedDurationMin ?? '',
    plannedStopAt: '',
    scopeNote: '',
  });
  const [activos, setActivos] = useState<any[]>([]);
  const [tipica, setTipica] = useState<any>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/assets/options').then((r) => setActivos(r.data || [])).catch(() => setActivos([]));
    // Cuánto suele tardar esto en este equipo. El dato ya estaba guardado en
    // las órdenes cerradas y no lo miraba nadie.
    api.get('/work-orders/' + wo.id + '/duracion-tipica')
      .then((r) => setTipica(r.data)).catch(() => setTipica(null));
  }, [wo.id]);

  const cambiaAlcance = !!wo.assignedAssetId && !!form.assetId && wo.assignedAssetId !== form.assetId;
  const asignado = activos.find((a) => a.id === wo.assignedAssetId);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(''); setGuardando(true);
    try {
      await api.patch('/work-orders/' + wo.id + '/detallar', {
        assetId: form.assetId || null,
        activity: form.activity,
        plannedDurationMin: form.plannedDurationMin === '' ? null : Number(form.plannedDurationMin),
        plannedStopAt: form.plannedStopAt || undefined,
        scopeNote: form.scopeNote,
      });
      onHecho();
      onClose();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'No se pudo detallar.');
    } finally { setGuardando(false); }
  }

  return (
    <Modal title={'Detallar · ' + wo.code} onClose={onClose}>
      <form onSubmit={enviar}>
        <div className="sign-note" style={{ marginBottom: 12 }}>
          <b>Lo que pidió el ingeniero:</b> {wo.activity || '—'}
          {asignado && <> · sobre <b>{asignado.assetCode}</b></>}
        </div>

        <label>Equipo sobre el que se va a trabajar
          <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
          <option value="">— sin equipo (trabajo de zona) —</option>
          {activos.map((a) => (
            <option key={a.id} value={a.id}>{a.assetCode}{a.referencePlace ? ` · ${a.referencePlace}` : ''}</option>
          ))}
        </select>
        </label>

        {cambiaAlcance && (
          <div style={{
            background: '#fff4e5', border: '1px solid #f5dcb0', borderLeft: '4px solid var(--warn)',
            borderRadius: 8, padding: '10px 12px', margin: '10px 0',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Estás cambiando el equipo asignado</div>
            <div className="muted" style={{ fontSize: 11, margin: '4px 0 8px' }}>
              Está bien hacerlo si el problema es otro. Pero el ingeniero tiene
              que poder ver qué pidió y qué se hizo, así que explica por qué.
            </div>
            <label>Motivo
              <input value={form.scopeNote} required
              onChange={(e) => setForm({ ...form, scopeNote: e.target.value })}
              placeholder="ej. la cámara está bien; el que no da enlace es el switch del rack 3" />
            </label>
          </div>
        )}

        <label>Qué se va a hacer
          <textarea rows={2} value={form.activity}
          onChange={(e) => setForm({ ...form, activity: e.target.value })} />
        </label>

        <label>Duración estimada (minutos)
          <input type="number" min={0} value={form.plannedDurationMin}
          onChange={(e) => setForm({ ...form, plannedDurationMin: e.target.value })} />
        </label>
        {tipica ? (
          <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 10 }}>
            Las últimas {tipica.muestras} órdenes de este tipo en este equipo
            tomaron <b>{tipica.mediaMin} min</b> de media ({tipica.minutos.join(', ')}).
            <button type="button" className="btn-mini" style={{ marginLeft: 8 }}
              onClick={() => setForm({ ...form, plannedDurationMin: tipica.mediaMin })}>
              usar {tipica.mediaMin}
            </button>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 10 }}>
            Todavía no hay trabajos cerrados de este tipo en este equipo para
            comparar. A partir del segundo, el sistema te lo sugiere.
          </div>
        )}

        <label>Parada prevista (opcional)
          <input type="datetime-local" value={form.plannedStopAt}
          onChange={(e) => setForm({ ...form, plannedStopAt: e.target.value })} />
        </label>

        {form.assetId && (
          <div style={{ marginTop: 12 }}>
            <HistorialActivo assetId={form.assetId} compacto />
          </div>
        )}

        {error && <div style={{ color: 'var(--crit)', fontSize: 12, marginTop: 8 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn-primary" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Dejar lista para trabajar'}
          </button>
          <button type="button" className="btn-mini" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
