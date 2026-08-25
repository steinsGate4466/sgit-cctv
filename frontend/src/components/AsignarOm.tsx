import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import { WO_TYPES, WO_TYPE_ES } from '../pages/omCatalogos';
import { useDialogos } from './Dialogos';

/**
 * ASIGNAR UNA ORDEN — lo que hace el ingeniero. Cuatro campos.
 *
 * POR QUÉ TAN CORTO
 * El alta completa tenía 15 campos, y los rellenaba él. Pero el ingeniero no
 * sabe cuál cámara exactamente, ni qué tramo, ni qué materiales: eso lo sabe
 * el técnico de red. Pedírselo le hacía inventar datos que después alguien
 * corregía.
 *
 * Aquí solo dice QUÉ hay que hacer, SOBRE QUÉ, A QUIÉN y PARA CUÁNDO. Y lo
 * último ni siquiera es obligatorio: si no lo pone, el sistema calcula el
 * plazo por la criticidad del equipo.
 */
export default function AsignarOm({ incidente, onHecho, onClose }: {
  /** Si viene, la orden nace de esta incidencia y llega con todo puesto. */
  incidente?: any;
  onHecho: () => void;
  onClose: () => void;
}) {
  const { avisar } = useDialogos();
  const [form, setForm] = useState<any>({
    type: incidente ? 'CORRECTIVO' : 'PREVENTIVO',
    activity: '', assetId: incidente?.assetId || '', technicianId: '', scheduledDate: '',
  });
  const [activos, setActivos] = useState<any[]>([]);
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/assets/options').then((r) => r.data).catch(() => []),
      api.get('/users').then((r) => r.data).catch(() => []),
    ]).then(([a, u]) => {
      setActivos(a || []);
      const lista = Array.isArray(u) ? u : (u as any)?.data || [];
      setTecnicos(lista.filter((x: any) => x.active !== false));
    });
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(''); setAviso(''); setGuardando(true);
    try {
      const cuerpo = {
        type: form.type,
        activity: form.activity,
        assetId: form.assetId || undefined,
        technicianId: form.technicianId || undefined,
        scheduledDate: form.scheduledDate || undefined,
      };
      const r = incidente
        ? await api.post('/work-orders/desde-incidencia/' + incidente.id, cuerpo)
        : await api.post('/work-orders/asignar', cuerpo);

      // El aviso de duplicado NO impide crear: a veces hacen falta dos trabajos
      // distintos sobre el mismo equipo. Pero abrir la segunda sin saber que
      // existe la primera es como se duplica el trabajo en campo.
      if (r.data?.avisoDuplicado) {
        await avisar(r.data.avisoDuplicado + '\n\nLa orden se creó igualmente.');
      }
      onHecho();
      onClose();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'No se pudo asignar.');
    } finally { setGuardando(false); }
  }

  return (
    <Modal title={incidente ? 'Convertir en orden · ' + incidente.code : 'Asignar trabajo'} onClose={onClose}>
      <form onSubmit={enviar}>
        <div className="sign-note" style={{ marginBottom: 12 }}>
          Sólo lo que sabes. El técnico de red completa equipo, materiales y duración.
        </div>

        <label>Tipo de trabajo
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {WO_TYPES.map((t) => <option key={t} value={t}>{WO_TYPE_ES[t] || t}</option>)}
        </select>
        </label>

        <label>¿Qué hay que hacer?
          <textarea
          rows={2}
          value={form.activity}
          onChange={(e) => setForm({ ...form, activity: e.target.value })}
          placeholder={incidente
            ? 'Se rellenará con la incidencia si lo dejas vacío'
            : 'ej. Revisar las cámaras del lecho de enfriamiento'}
        />
        </label>

        <label>Equipo (opcional si aún no se sabe cuál)
          <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
          <option value="">— lo determina el técnico —</option>
          {activos.map((a) => (
            <option key={a.id} value={a.id}>{a.assetCode}{a.referencePlace ? ` · ${a.referencePlace}` : ''}</option>
          ))}
        </select>
        </label>

        <label>¿A quién se lo asignas?
          <select value={form.technicianId} onChange={(e) => setForm({ ...form, technicianId: e.target.value })}>
          <option value="">— sin asignar —</option>
          {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
        </select>
        </label>

        <label>Para cuándo (opcional)
          <input type="date" value={form.scheduledDate}
          onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
        </label>
        <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 10 }}>
          Si lo dejas vacío, el sistema pone el plazo según la criticidad del
          equipo: lo crítico en dos días, lo de menos riesgo en veinte.
        </div>

        {error && <div style={{ color: 'var(--crit)', fontSize: 12, marginTop: 8 }}>{error}</div>}
        {aviso && <div style={{ color: '#b45309', fontSize: 12, marginTop: 8 }}>{aviso}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn-primary" disabled={guardando}>
            {guardando ? 'Asignando…' : 'Asignar'}
          </button>
          <button type="button" className="btn-mini" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
