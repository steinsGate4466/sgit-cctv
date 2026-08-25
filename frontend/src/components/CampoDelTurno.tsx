import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Icono from './Iconos';
import { useAuth } from '../auth/AuthContext';
import { enviarConRespaldo } from '../envio-seguro';
import { fecha } from '../formato';

/**
 * LO QUE DEJÓ EL TURNO ANTERIOR, Y CÓMO SE ARREGLA ESTO — bloque 29.
 *
 * ===========================================================================
 *  POR QUÉ VIVE EN EL QR Y NO EN UN MÓDULO
 * ===========================================================================
 *  La entrega de turno no falla porque no haya dónde escribirla: falla porque
 *  hay que acordarse de escribirla al FINAL del turno, cansado y con ganas de
 *  irse. Una bitácora así se abandona en tres semanas.
 *
 *  Aquí la nota se pega al EQUIPO y se escribe trabajando. El que entra no
 *  tiene que buscar nada: escanea el QR de la cámara que va a tocar y le sale
 *  lo que el anterior dejó dicho. Es el mismo gesto que ya hace.
 *
 *  Y debajo, el procedimiento del MODELO. No de esta cámara: del modelo. Si
 *  colgara de cada activo habría 300 procedimientos vacíos.
 */

const TIPO_NOTA: Record<string, { et: string; icono: string; clase: string }> = {
  DEJADO_A_MEDIAS:  { et: 'Quedó a medias',   icono: 'alerta',   clase: 'warn' },
  VIGILAR:          { et: 'Hay que vigilar',  icono: 'ojo',      clase: '' },
  RIESGO_ACCESO:    { et: 'Riesgo de acceso', icono: 'seguridad', clase: 'crit' },
  ESPERANDO_A_OTRO: { et: 'Esperando a otro', icono: 'reloj',    clase: '' },
};

export default function CampoDelTurno({ assetId }: { assetId: string }) {
  const { can } = useAuth();
  const puedeEscribir = can('wo.update');

  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [verProc, setVerProc] = useState(false);
  const [resolviendo, setResolviendo] = useState('');
  const [nueva, setNueva] = useState(false);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setD((await api.get(`/activos/${assetId}/campo`)).data); }
    catch { /* la ficha ya avisa si el equipo no carga; no se duplica el error */ }
    finally { setCargando(false); }
  }, [assetId]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando || !d) return null;

  const proc = d.procedimiento;

  return (
    <>
      {/* ---- 1. LO QUE DEJÓ EL ANTERIOR ---- */}
      {d.notas.length > 0 && (
        <div className="card scan-card" style={{ borderLeft: '4px solid var(--warn,#d97706)' }}>
          <h4 style={{ margin: '10px 0 6px' }}>
            <Icono n="nota" size={15} /> Lo que dejó dicho el turno anterior
          </h4>
          {d.notas.map((n: any) => {
            const t = TIPO_NOTA[n.tipo] || TIPO_NOTA.VIGILAR;
            return (
              <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className={'badge ' + t.clase}>
                  <Icono n={t.icono} size={12} /> {t.et}
                </span>
                <div style={{ fontSize: 13.5, marginTop: 5, lineHeight: 1.5 }}>{n.texto}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                  {n.autor?.fullName || 'Alguien'} ·{' '}
                  {fecha(n.createdAt)}
                  {n.workOrder?.code && ` · ${n.workOrder.code}`}
                </div>
                {/* Bloque 40: con try/catch y bloqueado mientras viaja. Antes,
                    si fallaba, la nota seguía ahí y el técnico no sabía si se
                    había registrado o no. */}
                {puedeEscribir && (
                  <button className="btn-mini" style={{ marginTop: 6 }}
                    disabled={resolviendo === n.id}
                    onClick={async () => {
                      setResolviendo(n.id);
                      try {
                        await api.patch(`/notas-campo/${n.id}/resolver`);
                        setMsg('Aviso marcado como atendido.');
                        await cargar();
                      } catch (e: any) {
                        setMsg(e?.response?.data?.message || 'No se pudo marcar como atendido.');
                      } finally { setResolviendo(''); }
                    }}>
                    <Icono n="ok" size={13} /> Ya está resuelto
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {msg && <div className="card explica scan-card">{msg}</div>}

      {/* ---- 2. DEJAR UN AVISO PARA EL SIGUIENTE ---- */}
      {puedeEscribir && (
        nueva
          ? <NotaNueva assetId={assetId}
              onListo={(t) => { setNueva(false); setMsg(t); cargar(); }}
              onCancelar={() => setNueva(false)} />
          : (
            <button className="btn-mini" style={{ margin: '10px 0', width: '100%' }}
              onClick={() => setNueva(true)}>
              <Icono n="nota" size={14} /> Dejar un aviso para el siguiente turno
            </button>
          )
      )}

      {/* ---- 3. CÓMO SE ARREGLA ESTE MODELO ---- */}
      <div className="card scan-card">
        <h4 style={{ margin: '10px 0 6px' }}>
          <Icono n="llaveInglesa" size={15} /> Cómo se restaura
        </h4>
        {!proc ? (
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5, paddingBottom: 10 }}>
            Todavía nadie ha escrito cómo se restaura este modelo. No se te
            enseña el de otro parecido a propósito: los pasos cambian.
            <div style={{ marginTop: 4 }}>
              Si acabas de arreglarlo, eres quien mejor lo puede contar.
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{proc.titulo}</div>
            <div className="muted" style={{ fontSize: 11.5, margin: '2px 0 8px' }}>
              {[proc.marca, proc.modelo].filter(Boolean).join(' ') || 'Genérico del tipo'}
              {proc.minutosEstimados ? ` · suele llevar ${proc.minutosEstimados} min` : ''}
            </div>

            {proc.advertencias && (
              <div className="card peligro" style={{ margin: '0 0 10px' }}>
                <Icono n="alerta" size={13} /> {proc.advertencias}
              </div>
            )}

            {!verProc ? (
              <button className="btn-mini" onClick={() => setVerProc(true)}>
                Ver los {proc.pasos.length} pasos
              </button>
            ) : (
              <ol style={{ fontSize: 13.5, lineHeight: 1.6, paddingLeft: 20, margin: '0 0 10px' }}>
                {proc.pasos.map((p: string, i: number) => <li key={i} style={{ marginBottom: 4 }}>{p}</li>)}
              </ol>
            )}

            {verProc && puedeEscribir && (
              <MejoraNueva procedimientoId={proc.id}
                onListo={(t) => { setMsg(t); setVerProc(false); }} />
            )}
          </>
        )}
      </div>
    </>
  );
}

/** Dejar el aviso. Tres campos y fuera: se rellena de pie, con guantes. */
function NotaNueva({ assetId, onListo, onCancelar }: {
  assetId: string; onListo: (m: string) => void; onCancelar: () => void;
}) {
  const [tipo, setTipo] = useState('DEJADO_A_MEDIAS');
  const [texto, setTexto] = useState('');
  const [dias, setDias] = useState(30);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  return (
    <div className="card scan-card" style={{ padding: '12px 14px' }}>
      <b style={{ fontSize: 13 }}>Un aviso para el que llegue después</b>
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}

      <label>Qué tipo de aviso
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
        {Object.entries(TIPO_NOTA).map(([k, v]) => <option key={k} value={k}>{v.et}</option>)}
      </select>
      </label>

      <label>El aviso
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
        placeholder="La dejé conectada al puerto 8 del switch provisional; hay que pasarla al 3 cuando llegue el patch cord." />
      </label>

      <label>Caduca en (días)
        <input type="number" value={dias} min={0} max={365}
             onChange={(e) => setDias(Number(e.target.value))} />
      </label>
      <small className="muted">
        Los avisos caducan solos para que la lista siga siendo útil.
      </small>

      <div className="card-acciones" style={{ marginTop: 12 }}>
        <button className="btn-mini" onClick={onCancelar}>Cancelar</button>
        <button className="btn-primary" disabled={guardando || texto.trim().length < 5}
          onClick={async () => {
            setGuardando(true); setError('');
            try {
              await enviarConRespaldo('post', `/activos/${assetId}/notas`,
                { tipo, texto, diasVigencia: dias }, 'Aviso de turno');
              onListo('Aviso guardado. Lo verá el que escanee este equipo.');
            } catch (e: any) {
              setError(e?.response?.data?.message || 'No se pudo guardar.');
            } finally { setGuardando(false); }
          }}>
          {guardando ? 'Guardando…' : 'Dejar el aviso'}
        </button>
      </div>
    </div>
  );
}

/**
 * Proponer una mejora al procedimiento, con los MINUTOS REALES.
 *
 * Esto es lo que hace que cada mantenimiento mejore el siguiente: comparando
 * lo estimado con lo que de verdad costó se ve si el procedimiento está
 * mejorando, o si sólo lo parece sobre el papel.
 */
function MejoraNueva({ procedimientoId, onListo }: {
  procedimientoId: string; onListo: (m: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [minutos, setMinutos] = useState<number | ''>('');
  const [error, setError] = useState('');

  if (!abierto) {
    return (
      <button className="btn-mini" onClick={() => setAbierto(true)}>
        <Icono n="mejora" size={13} /> Proponer una mejora
      </button>
    );
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <b style={{ fontSize: 12.5 }}>Lo que aprendiste arreglándolo</b>
      {error && <div className="error" style={{ marginTop: 6 }}>{error}</div>}

      <label>La mejora
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
        placeholder="Antes de desmontar, prueba a reiniciar el PoE del puerto: en tres de cada cuatro veces vuelve sola y te ahorras subir." />
      </label>

      <label>Cuánto te llevó de verdad (minutos)
        <input type="number" value={minutos} min={1}
             onChange={(e) => setMinutos(e.target.value ? Number(e.target.value) : '')} />
      </label>
      <small className="muted">
        Sin este número no se puede saber si el procedimiento está mejorando.
      </small>

      <div className="card-acciones" style={{ marginTop: 10 }}>
        <button className="btn-mini" onClick={() => setAbierto(false)}>Cancelar</button>
        <button className="btn-primary" disabled={texto.trim().length < 10}
          onClick={async () => {
            setError('');
            try {
              await enviarConRespaldo('post', `/procedimientos/${procedimientoId}/mejoras`,
                { texto, minutosReales: minutos || undefined }, 'Mejora de procedimiento');
              setAbierto(false);
              onListo('Propuesta enviada. La revisa el Jefe de Mantenimiento antes de entrar al procedimiento.');
            } catch (e: any) {
              setError(e?.response?.data?.message || 'No se pudo enviar.');
            }
          }}>
          Proponer
        </button>
      </div>
    </div>
  );
}
