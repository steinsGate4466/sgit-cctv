import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import { useAuth } from '../auth/AuthContext';
import { CAUSAS, CAUSA_ES, fh, duracion } from '../pages/omCatalogos';
import OmHerramientas, { HerramientaMarcada } from './OmHerramientas';

/**
 * Pantallas de EJECUCIÓN EN CAMPO de una orden de mantenimiento.
 *
 * Son tres momentos distintos y por eso son tres diálogos separados:
 *   ABRIR    — el técnico llega al sitio, firma y declara con quién va.
 *   AVANCE   — una orden no siempre termina el mismo día; deja el % y el motivo.
 *   CERRAR   — el Jefe firma, pone la hora real y la causa encontrada.
 */

interface Props {
  wo: any;                     // orden sobre la que se actúa
  accion: 'abrir' | 'avance' | 'cerrar';
  onClose: () => void;
  onHecho: () => void;         // recargar el listado
}

export default function OmCampo({ wo, accion, onClose, onHecho }: Props) {
  const { user } = useAuth();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [tecnicos, setTecnicos] = useState<any[]>([]);

  // ---- abrir ----
  const [inicio, setInicio] = useState('');
  const [acompanante, setAcompanante] = useState('');

  // ---- avance ----
  const [pct, setPct] = useState<number>(wo?.progressPct ?? 0);
  const [nota, setNota] = useState('');
  const [historial, setHistorial] = useState<any[]>([]);

  // ---- cerrar ----
  const [fin, setFin] = useState('');
  const [causa, setCausa] = useState('');
  const [causaNota, setCausaNota] = useState('');
  const [reincidente, setReincidente] = useState(false);

  // ---- herramientas (solo al abrir) ----
  const [herramientas, setHerramientas] = useState<HerramientaMarcada[]>([]);

  // ---- firma (abrir y cerrar) ----
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (accion === 'abrir') {
      // Solo usuarios activos: no tiene sentido declarar como acompañante a
      // alguien dado de baja.
      api.get('/users').then((r) => {
        const lista = Array.isArray(r.data) ? r.data : r.data?.data || [];
        setTecnicos(lista.filter((u: any) => u.active !== false && u.id !== user?.id));
      }).catch(() => setTecnicos([]));
    }
    if (accion === 'avance') {
      api.get('/work-orders/' + wo.id + '/progress')
        .then((r) => setHistorial(r.data || [])).catch(() => setHistorial([]));
    }
  }, [accion, wo?.id, user?.id]);

  function mensajeError(err: any) {
    const m = err?.response?.data?.message;
    return Array.isArray(m) ? m.join(', ') : m || 'No se pudo completar la acción.';
  }

  /** Fecha-hora local del formulario -> ISO. Vacío = que decida el servidor. */
  const iso = (v: string) => (v ? new Date(v).toISOString() : undefined);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      if (accion === 'abrir') {
        await api.post('/work-orders/' + wo.id + '/open', {
          email, password,
          startedAt: iso(inicio),
          companionId: acompanante || undefined,
        });
        // La encuesta se guarda DESPUÉS de la apertura firmada. Al revés, si la
        // firma falla quedarían herramientas registradas para una orden que
        // nunca se abrió.
        if (herramientas.length) {
          await api.post('/work-orders/' + wo.id + '/tools', { items: herramientas })
            .catch(() => {
              window.alert(
                'La orden se abrió, pero la lista de herramientas no se pudo guardar. '
                + 'Puedes registrarla de nuevo desde la orden.',
              );
            });
        }
      } else if (accion === 'avance') {
        await api.post('/work-orders/' + wo.id + '/progress', {
          pct: Number(pct),
          note: nota.trim() || undefined,
        });
      } else {
        // Cerrar una orden que no llegó al 100 % es válido —a veces se decide
        // no continuar— pero tiene que ser una decisión consciente.
        if ((wo.progressPct ?? 0) < 100) {
          const ok = window.confirm(
            `El avance registrado es ${wo.progressPct ?? 0}%.\n\n` +
            '¿Confirmas el cierre de la orden?',
          );
          if (!ok) { setGuardando(false); return; }
        }
        await api.post('/work-orders/' + wo.id + '/close', {
          email, password,
          endedAt: iso(fin),
          rootCause: causa || undefined,
          rootCauseNote: causaNota.trim() || undefined,
          isRecurrent: reincidente,
        });
      }
      onHecho();
      onClose();
    } catch (err: any) {
      setError(mensajeError(err));
    } finally { setGuardando(false); }
  }

  const titulo = accion === 'abrir' ? 'Abrir en campo · ' + wo.code
    : accion === 'avance' ? 'Reportar avance · ' + wo.code
    : 'Cerrar orden · ' + wo.code;

  return (
    <Modal title={titulo} onClose={onClose}>
      <form onSubmit={enviar}>

        {/* ---------------------------------------------------------- ABRIR */}
        {accion === 'abrir' && (
          <>
            <div className="sign-note">
              Al firmar quedas como responsable de esta orden. Si es de mapeo,
              todo activo que registres queda ligado a ella.
            </div>

            {wo.plannedStopAt && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Parada estimada por Producción: <strong>{fh(wo.plannedStopAt)}</strong>
                {wo.plannedDurationMin ? ` · ${duracion(wo.plannedDurationMin)}` : ''}
              </div>
            )}

            <label>Hora real de inicio</label>
            <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 10 }}>
              La que confirmaste por radio con Producción. Si lo dejas vacío se toma este momento.
            </div>

            <label>Acompañante en campo</label>
            <select value={acompanante} onChange={(e) => setAcompanante(e.target.value)}>
              <option value="">— sin acompañante —</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>{t.fullName} — {t.role?.name || t.roleName || ''}</option>
              ))}
            </select>
            <div className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 10 }}>
              Queda registrado para trazabilidad y seguridad.
            </div>

            <OmHerramientas workOrderId={wo.id} onChange={setHerramientas} />
          </>
        )}

        {/* --------------------------------------------------------- AVANCE */}
        {accion === 'avance' && (
          <>
            <div className="sign-note">
              Si el trabajo no se terminó, deja el avance y el motivo. La orden
              queda en proceso: no hace falta cerrarla ni inventar un final.
            </div>

            <label>Avance: <strong>{pct}%</strong></label>
            <input type="range" min={0} max={100} step={5} value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              style={{ width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }} className="muted">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>

            <label style={{ marginTop: 10 }}>
              ¿Por qué no se avanzó más?
              {pct < (wo.progressPct ?? 0) && <span style={{ color: '#b91c1c' }}> (obligatorio: el avance baja)</span>}
            </label>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3}
              style={{ width: '100%', resize: 'vertical' }}
              placeholder="Ej: la parada se acortó, Producción reinició antes / faltó manlift / no llegó el repuesto" />

            {historial.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Avances anteriores</div>
                {historial.map((h) => (
                  <div key={h.id} style={{
                    borderLeft: '3px solid #cbd5e1', paddingLeft: 10, marginBottom: 8, fontSize: 12,
                  }}>
                    <div><strong>{h.pct}%</strong> · {fh(h.reportedAt)} · {h.reportedBy?.fullName || '—'}</div>
                    {h.note && <div className="muted">{h.note}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* --------------------------------------------------------- CERRAR */}
        {accion === 'cerrar' && (
          <>
            <div className="sign-note">
              El cierre lo firma el Jefe de Mantenimiento. La causa que elijas
              es lo que permitirá saber después por qué algo vuelve a fallar.
            </div>

            {wo.startedAt && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Trabajo iniciado: <strong>{fh(wo.startedAt)}</strong>
                {wo.openedBy?.fullName ? ` por ${wo.openedBy.fullName}` : ''}
                {wo.companion?.fullName ? ` · acompañó ${wo.companion.fullName}` : ''}
              </div>
            )}

            <label>Hora real de cierre</label>
            <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} />

            <label>Causa encontrada</label>
            <select value={causa} onChange={(e) => setCausa(e.target.value)}>
              <option value="">— sin especificar —</option>
              {CAUSAS.map((g) => (
                <optgroup key={g.grupo} label={g.grupo}>
                  {g.opciones.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                </optgroup>
              ))}
            </select>

            {causa === 'SIN_FALLA_ENCONTRADA' && (
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                Está bien registrarlo. Varias órdenes seguidas así sobre el mismo
                equipo apuntan a una falla intermitente que conviene investigar.
              </div>
            )}

            <label>Detalle (opcional)</label>
            <textarea value={causaNota} onChange={(e) => setCausaNota(e.target.value)} rows={2}
              style={{ width: '100%', resize: 'vertical' }}
              placeholder="Lo que convenga dejar escrito para la próxima vez" />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input type="checkbox" checked={reincidente} onChange={(e) => setReincidente(e.target.checked)} />
              <span>Este problema ya se había presentado antes</span>
            </label>

            {/* El Jefe ve qué declaró el técnico al salir. Si faltó una
                herramienta y la orden quedó sin resolver, ahí está el motivo. */}
            <OmHerramientas workOrderId={wo.id} onChange={() => {}} soloLectura />
          </>
        )}

        {/* ----------------------------------------------------------- FIRMA */}
        {accion !== 'avance' && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Firma electrónica</div>
            <label>Correo</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label>Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required autoComplete="current-password" />
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 10, background: '#fee2e2', color: '#991b1b',
            padding: '8px 10px', borderRadius: 6, fontSize: 13,
          }}>{error}</div>
        )}

        <button className="btn" disabled={guardando} style={{ marginTop: 12 }}>
          {guardando ? 'Guardando…'
            : accion === 'abrir' ? 'Abrir y empezar'
            : accion === 'avance' ? 'Guardar avance'
            : 'Cerrar orden'}
        </button>
      </form>
    </Modal>
  );
}

/** Resumen de tiempos y desviación, para la ficha de la orden. */
export function OmDesviacion({ d }: { d: any }) {
  if (!d) return null;
  const tarde = (d.retrasoInicioMin ?? 0) > 0;
  const excedio = (d.desviacionMin ?? 0) > 0;
  return (
    <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
      <div className="frow"><span className="k">Duración estimada</span>
        <span className="v">{duracion(d.duracionEstimadaMin)}</span></div>
      <div className="frow"><span className="k">Duración real</span>
        <span className="v">{duracion(d.duracionRealMin)}</span></div>
      <div className="frow"><span className="k">Arranque</span>
        <span className="v">
          {d.retrasoInicioMin === null ? '—'
            : tarde ? `${duracion(d.retrasoInicioMin)} tarde`
            : `${duracion(Math.abs(d.retrasoInicioMin))} antes`}
        </span></div>
      <div className="frow"><span className="k">Desviación</span>
        <span className="v" style={{ color: excedio ? '#b91c1c' : undefined }}>
          {d.desviacionMin === null ? '—'
            : `${excedio ? '+' : ''}${duracion(d.desviacionMin)}` +
              (d.desviacionPct !== null ? ` (${d.desviacionPct > 0 ? '+' : ''}${d.desviacionPct}%)` : '')}
        </span></div>
    </div>
  );
}
