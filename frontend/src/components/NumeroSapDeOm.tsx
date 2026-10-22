import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import { useAuth } from '../auth/AuthContext';
import { mensajeDeError } from '../avisos';
import { avisoDelNumeroSap, normalizarNumeroSap } from '../avisoSap';

/* =============================================================================
   BLOQUE 180 · EL N° DE LA OM EN SAP — «primero el N° SAP»
   -----------------------------------------------------------------------------
   La OM la crea SAP: Producción o el Jefe de Mantenimiento (decisión 2 de
   Cristhian). Aquí sólo se APUNTA su número, y sin él la orden no se abre, no
   avanza, no saca material y no se cierra (lo decide el servidor).

   Dos formas, el mismo guardado:
   · `NumeroSapDeOm`: la ventana, desde la lista de Órdenes.
   · `FaltaOmSap`: el aviso DENTRO de abrir / avance / cerrar. Quien se topa
     con la falta delante del equipo no tiene que salir a buscar otra pantalla:
     si puede, lo apunta ahí; si no, se le dice a quién pedírselo.

   Apuntarlo cuando falta: `wo.create`. Cambiarlo o quitarlo: `wo.approve`.
============================================================================= */

async function guardarNumero(woId: string, texto: string): Promise<{ numero: string | null; aviso: string | null }> {
  const r = await api.patch(`/work-orders/${woId}/sap`, { numero: normalizarNumeroSap(texto) });
  return { numero: r.data?.externalRef ?? null, aviso: r.data?.aviso ?? null };
}

export default function NumeroSapDeOm({ wo, onHecho, onClose }: {
  wo: { id: string; code: string; externalRef?: string | null };
  onHecho: () => void;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const puedeCorregir = can('wo.approve');
  const bloqueado = !!wo.externalRef && !puedeCorregir;
  const [numero, setNumero] = useState(wo.externalRef || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const malo = avisoDelNumeroSap(numero);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (malo) { setError(malo); return; }
    setGuardando(true); setError(''); setAviso('');
    try {
      const r = await guardarNumero(wo.id, numero);
      onHecho();
      // Si el número ya está en otra orden, se dice ANTES de cerrar: no se impide.
      if (r.aviso) setAviso(r.aviso); else onClose();
    } catch (err: any) {
      setError(mensajeDeError(err, 'guardar el N° de OM SAP'));
    } finally { setGuardando(false); }
  }

  return (
    <Modal title={`N° de OM SAP · ${wo.code}`} onClose={onClose}>
      <form onSubmit={guardar}>
        <div className="sign-note">{'La OM se crea en SAP. Sin su número aquí no se abre ni se ejecuta.'}</div>
        <label>{'N° de la OM en SAP'}
          <input className="num-sap" value={numero} maxLength={20} inputMode="numeric" placeholder="Ej.: 4000123456"
            disabled={bloqueado} onChange={(e) => { setNumero(e.target.value); setError(''); }} />
        </label>
        {malo && <div className="num-sap-falta" style={{ fontSize: 12 }}>{malo}</div>}
        {bloqueado && <div className="muted" style={{ fontSize: 12 }}>{'Cambiarlo lo decide el Jefe de Mantenimiento.'}</div>}
        {error && <div className="error">{error}</div>}
        {aviso && <div className="num-sap-falta" style={{ fontSize: 12, marginTop: 6 }}>{aviso}</div>}
        {!bloqueado && !aviso && (
          <button className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar N° de OM'}</button>
        )}
        {aviso && <button type="button" className="btn" onClick={onClose}>{'Entendido'}</button>}
      </form>
    </Modal>
  );
}

/** El aviso de «falta el N° SAP» dentro de abrir / avance / cerrar. */
export function FaltaOmSap({ wo, queSeIntenta, onApuntado }: {
  wo: { id: string; code: string };
  /** «abre», «anota avance», «cierra»: completa la frase «sin él no se …». */
  queSeIntenta: string;
  onApuntado: (numero: string) => void;
}) {
  const { can } = useAuth();
  const puede = can('wo.create') || can('wo.approve');
  const [numero, setNumero] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const malo = avisoDelNumeroSap(numero);

  async function apuntar() {
    if (!normalizarNumeroSap(numero)) { setError('Escribe el N° de la OM de SAP.'); return; }
    if (malo) { setError(malo); return; }
    setGuardando(true); setError('');
    try {
      const r = await guardarNumero(wo.id, numero);
      if (r.numero) onApuntado(r.numero);
      if (r.aviso) setError(r.aviso);
    } catch (err: any) {
      setError(mensajeDeError(err, 'guardar el N° de OM SAP'));
    } finally { setGuardando(false); }
  }

  return (
    <div className="aviso-falta-sap" role="status">
      <b>{`Falta el N° de OM SAP: sin él no se ${queSeIntenta}.`}</b>
      {puede ? (
        <div className="aviso-falta-sap-fila">
          <input className="num-sap" value={numero} maxLength={20} inputMode="numeric" placeholder="N° de la OM en SAP"
            aria-label="N° de la OM en SAP" onChange={(e) => { setNumero(e.target.value); setError(''); }} />
          <button type="button" className="btn-mini" disabled={guardando} onClick={apuntar}>
            {guardando ? 'Guardando…' : 'Apuntar'}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12 }}>{'Pídeselo a quien la creó en SAP: Producción o el Jefe de Mantenimiento.'}</div>
      )}
      {error && <div style={{ fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
