import { useEffect, useState, FormEvent } from 'react';
import ElegirConClics from './ElegirConClics';
import { paraInput } from '../fechas';

/** Bloque 169 · por qué el técnico cambia el equipo de la orden. */
const MOTIVOS_ALCANCE = [
  'El equipo pedido está bien; la falla está en otro equipo',
  'La orden tenía el equipo equivocado',
  'Se amplía a otro equipo del mismo tramo',
];
import SelectorDeActivo from './SelectorDeActivo';
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
    // Bloque 169: si ya tenía parada estimada, se conserva (antes se vaciaba).
    plannedStopAt: wo.plannedStopAt ? paraInput(wo.plannedStopAt) : '',
    scopeNote: '',
  });
  /* Bloque 169 · qué se va a hacer, del catálogo de trabajos; por qué cambia
     el equipo, de una lista. El texto queda para el detalle. */
  const [trabajos, setTrabajos] = useState<any[]>([]);
  useEffect(() => {
    let vivo = true;
    api.get('/catalogos/TRABAJO_OM').then((r) => { if (vivo) setTrabajos(r.data?.items || []); }).catch(() => { if (vivo) setTrabajos([]); });
    return () => { vivo = false; };
  }, []);
  const [activos, setActivos] = useState<any[]>([]);
  const [tipica, setTipica] = useState<any>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  /* Bloque 115: con dos órdenes abiertas seguidas, la duración típica de la
     primera puede llegar después y quedarse puesta sobre la segunda. */
  useEffect(() => {
    let vivo = true;
    api.get('/assets/options')
      .then((r) => { if (vivo) setActivos(r.data || []); })
      .catch(() => { if (vivo) setActivos([]); });
    // Cuánto suele tardar esto en este equipo. El dato ya estaba guardado en
    // las órdenes cerradas y no lo miraba nadie.
    api.get('/work-orders/' + wo.id + '/duracion-tipica')
      .then((r) => { if (vivo) setTipica(r.data); })
      .catch(() => { if (vivo) setTipica(null); });
    return () => { vivo = false; };
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
        // Revisión: en ISO, como el alta de OM. Sin convertir, el servidor (UTC) lo corría 5 h.
        plannedStopAt: form.plannedStopAt ? new Date(form.plannedStopAt).toISOString() : undefined,
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

        <SelectorDeActivo
          etiqueta="Equipo sobre el que se va a trabajar"
          opciones={activos}
          valor={form.assetId}
          onChange={(id) => setForm({ ...form, assetId: id })}
          vacio="— sin equipo (trabajo de zona) —"
        />

        {cambiaAlcance && (
          <div style={{
            background: 'var(--warn-fondo)', border: '1px solid var(--warn-borde)', borderLeft: '4px solid var(--warn)',
            borderRadius: 8, padding: '10px 12px', margin: '10px 0',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Estás cambiando el equipo asignado</div>
            <div className="muted" style={{ fontSize: 11, margin: '4px 0 8px' }}>
              Explica por qué, para que el ingeniero pueda comparar lo pedido con lo hecho.
            </div>
            <ElegirConClics etiqueta="Motivo" valor={MOTIVOS_ALCANCE.includes(form.scopeNote) ? [form.scopeNote] : []}
              opciones={MOTIVOS_ALCANCE.map((m) => ({ valor: m, texto: m }))}
              onChange={(v) => setForm({ ...form, scopeNote: v[0] || '' })} />
          </div>
        )}

        {trabajos.some((t) => !t.group || t.group === wo.type) && (
          <label>{'Trabajo'}
            <select value="" onChange={(e) => {
              const t = trabajos.find((x) => x.code === e.target.value);
              if (t) setForm({ ...form, activity: t.notes || t.name });
            }}>
              <option value="">{'— elige del catálogo para llenar lo que se va a hacer —'}</option>
              {trabajos.filter((t) => !t.group || t.group === wo.type).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </label>
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
            Sin trabajos cerrados de este tipo para comparar. A partir del segundo se sugiere.
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
