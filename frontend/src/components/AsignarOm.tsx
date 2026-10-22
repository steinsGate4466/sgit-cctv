import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import SelectorDeActivo from './SelectorDeActivo';
import Modal from './Modal';
import { WO_TYPES_NUEVA, WO_TYPE_ES } from '../pages/omCatalogos';
import { useDialogos } from './Dialogos';
import { RESPUESTA_DEL_AVISO, avisoDelNumeroSap, normalizarNumeroSap, tipoDeAviso, tipoDeOrdenSugerido } from '../avisoSap';

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
    /* Bloque 180: lo PROPONE el aviso (no funciona → correctivo, se va a
       dañar → preventivo, pedido → mejora); lo decide quien la trata. */
    type: incidente ? tipoDeOrdenSugerido(incidente.tipoAviso) : 'PREVENTIVO',
    /* AUDITORÍA DE PROCESOS 21/10: la fecha nace VACÍA a propósito. Con
       «hoy» puesto, el servidor nunca calculaba el plazo por criticidad
       (`fechaLimite`) y toda orden asignada vencía esa misma noche: el nivel
       de servicio se hundía con trabajo recién pedido. Vacía no es «sin
       fecha»: el servidor SIEMPRE pone una (bloque 4A). */
    activity: '', assetId: incidente?.assetId || '', technicianId: '', scheduledDate: '',
    // Bloque 180: si la OM ya existe en SAP, su número entra desde el principio.
    externalRef: '',
  });
  const [activos, setActivos] = useState<any[]>([]);
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/assets/options').then((r) => r.data).catch(() => []),
      // Bloque 172 · sólo quien puede ejecutar la orden (wo.update), no todos los usuarios.
      api.get('/users/ejecutores').then((r) => r.data).catch(() => []),
    ]).then(([a, u]) => {
      setActivos(a || []);
      const lista = Array.isArray(u) ? u : (u as any)?.data || [];
      setTecnicos(lista.filter((x: any) => x.active !== false));
    });
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(''); setAviso('');
    const malSap = avisoDelNumeroSap(form.externalRef);
    if (malSap) { setError(malSap); return; }
    setGuardando(true);
    try {
      const cuerpo = {
        type: form.type,
        activity: form.activity,
        assetId: form.assetId || undefined,
        technicianId: form.technicianId || undefined,
        scheduledDate: form.scheduledDate || undefined,
        externalRef: normalizarNumeroSap(form.externalRef) || undefined,
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
      // Bloque 180: la OM de SAP ya estaba en otra orden. No se impide; se dice.
      if (r.data?.avisoSap) await avisar(r.data.avisoSap);
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
          Sólo lo que sabes: el técnico completa el resto.
        </div>

        {/* BLOQUE 180 · REVERTIDO el «una incidencia es siempre correctivo» del
            21/10. Lo corrigió Cristhian: un gabinete destrozado que funciona
            no es un correctivo, es un preventivo o una mejora. El aviso
            PROPONE el tipo; quien trata la orden lo DECIDE. */}
        <label>Tipo de trabajo
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {WO_TYPES_NUEVA.map((t) => <option key={t} value={t}>{WO_TYPE_ES[t] || t}</option>)}
        </select>
        </label>
        {incidente && (
          <div className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 8 }}>
            {`El aviso dice «${RESPUESTA_DEL_AVISO[tipoDeAviso(incidente.tipoAviso)]}»: se propone ${(WO_TYPE_ES[tipoDeOrdenSugerido(incidente.tipoAviso)] || '').toLowerCase()}.`}
          </div>
        )}

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

        {/* BLOQUE 121 · agrupado por tipo. Antes eran cuatrocientos equipos de
            catorce tipos en una lista plana ordenada por código: una cámara,
            un switch y una pantalla seguidos. Elegir el de al lado deja la
            orden apuntada al equipo equivocado. */}
        <SelectorDeActivo
          etiqueta="Equipo (opcional si aún no se sabe cuál)"
          opciones={activos}
          valor={form.assetId}
          onChange={(id) => setForm({ ...form, assetId: id })}
          vacio="— lo determina el técnico —"
        />

        <label>¿A quién se lo asignas?
          <select value={form.technicianId} onChange={(e) => setForm({ ...form, technicianId: e.target.value })}>
          <option value="">— sin asignar —</option>
          {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.fullName}{t.rol ? ` · ${t.rol}` : ''}</option>)}
        </select>
        </label>

        {/* Bloque 180 · «primero el N° SAP»: sin él la orden se crea, pero no
            se abre. Si Producción o el Jefe ya la creó en SAP, va aquí. */}
        <label>{'N° de OM SAP (si ya existe)'}
          <input className="num-sap" value={form.externalRef} maxLength={20} inputMode="numeric" placeholder="Ej.: 4000123456"
            onChange={(e) => setForm({ ...form, externalRef: e.target.value })} />
        </label>
        {avisoDelNumeroSap(form.externalRef) && <div className="num-sap-falta" style={{ fontSize: 12 }}>{avisoDelNumeroSap(form.externalRef)}</div>}

        <label title="Vacío: el sistema pone el plazo según la criticidad del equipo (lo crítico en dos días, lo de menos riesgo en veinte).">
          Para cuándo (vacío = según criticidad)
          <input type="date" value={form.scheduledDate}
          onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
        </label>

        {error && <div style={{ color: 'var(--crit)', fontSize: 12, marginTop: 8 }}>{error}</div>}
        {aviso && <div style={{ color: 'var(--warn-texto)', fontSize: 12, marginTop: 8 }}>{aviso}</div>}

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
