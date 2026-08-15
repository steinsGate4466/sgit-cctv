import { useEffect, useState, FormEvent } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import { useAuth } from '../auth/AuthContext';
// CAUSAS y CAUSA_ES ya no se importan: las listas vienen del servidor (3E).
// El archivo omCatalogos sigue existiendo porque otras pantallas usan fh y
// duracion, y porque CAUSA_ES aun traduce las causas de ordenes ANTIGUAS.
import { fh, duracion } from '../pages/omCatalogos';
import OmHerramientas, { HerramientaMarcada } from './OmHerramientas';
import RutinaEnCampo from './RutinaEnCampo';
import { useDialogos } from './Dialogos';

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
  const { confirmar, avisar } = useDialogos();
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
  const [sintoma, setSintoma] = useState('');
  // OJO con el nombre: la propiedad `accion` ya es el modo de la pantalla
  // (abrir / avance / cerrar). Esta es la ACCIÓN REALIZADA del catálogo, y si
  // se llamara igual la taparía sin que TypeScript dijera nada.
  const [accionRealizada, setAccionRealizada] = useState('');
  const [causaNota, setCausaNota] = useState('');
  const [motivoAvance, setMotivoAvance] = useState('');
  // Catálogos editables (3E). Se piden al servidor: no están en el código.
  const [catalogos, setCatalogos] = useState<any>(null);
  const [reincidente, setReincidente] = useState(false);

  // ---- permiso de acceso (solo al abrir) ----
  const [acceso, setAcceso] = useState<any>(null);

  // ---- material retirado y no usado (solo al cerrar) ----
  const [sobrante, setSobrante] = useState<any[]>([]);
  const [devolviendo, setDevolviendo] = useState(false);
  // Motivo por el que la rutina preventiva impide cerrar, si lo hay.
  const [bloqueoRutina, setBloqueoRutina] = useState<string | null>(null);

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

      // Permiso de altura. Se pregunta AQUÍ y no en otro sitio porque este es
      // el único momento en que sirve: después el técnico ya está subido.
      api.get('/work-orders/' + wo.id + '/acceso')
        .then((r) => setAcceso(r.data)).catch(() => setAcceso(null));
    }
    if (accion === 'avance') {
      api.get('/work-orders/' + wo.id + '/progress')
        .then((r) => setHistorial(r.data || [])).catch(() => setHistorial([]));
    }
    if (accion === 'cerrar' || accion === 'avance') {
      // Las cuatro listas de una vez: una sola ida al servidor.
      api.get('/catalogos/todos')
        .then((r) => setCatalogos(r.data)).catch(() => setCatalogos(null));
    }
    if (accion === 'cerrar') {
      // Al cerrar se mira qué material salió de almacén y no se consumió.
      // Es el momento en que se sabe: antes no, después ya no se acuerda nadie.
      api.get('/work-orders/' + wo.id + '/materials')
        .then((r) => setSobrante((r.data?.items || []).filter((m: any) => m.porDevolver > 0)))
        .catch(() => setSobrante([]));
    }
  }, [accion, wo?.id, user?.id]);

  /** Devuelve al almacén lo que sobró, desde la propia pantalla de cierre. */
  async function devolverSobrante() {
    setDevolviendo(true);
    try {
      await api.post('/work-orders/' + wo.id + '/materials/devolucion', {});
      setSobrante([]);
    } catch (err: any) {
      setError(mensajeError(err));
    } finally { setDevolviendo(false); }
  }

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
            .catch(async () => {
              await avisar(
                'La orden se abrió, pero la lista de herramientas no se pudo guardar. '
                + 'Puedes registrarla de nuevo desde la orden.',
              );
            });
        }
      } else if (accion === 'avance') {
        await api.post('/work-orders/' + wo.id + '/progress', {
          reasonCode: motivoAvance || undefined,
          pct: Number(pct),
          note: nota.trim() || undefined,
        });
      } else {
        // Cerrar una orden que no llegó al 100 % es válido —a veces se decide
        // no continuar— pero tiene que ser una decisión consciente.
        if ((wo.progressPct ?? 0) < 100) {
          const ok = await confirmar(
            `El avance registrado es ${wo.progressPct ?? 0}%.\n\n` +
            '¿Confirmas el cierre de la orden?',
          );
          if (!ok) { setGuardando(false); return; }
        }
        // LA RUTINA MANDA: si quedan puntos sin responder, o un "no conforme"
        // sin explicar, no se cierra. El servidor no lo sabe —el cierre es una
        // operación aparte— así que se comprueba aquí, con el motivo exacto.
        if (bloqueoRutina) {
          setError('No se puede cerrar: ' + bloqueoRutina);
          setGuardando(false);
          return;
        }

        // MATERIAL SIN DEVOLVER
        // El cable UTP es el caso normal, no la excepción: se retira un rollo
        // o un tramo largo y se usa lo que hace falta. Si esto no se pregunta
        // AQUÍ, no se pregunta nunca, y el stock del sistema queda por debajo
        // del real para siempre.
        // No se bloquea el cierre: a veces el material se queda en el gabinete
        // a propósito para el trabajo del día siguiente. Pero tiene que ser una
        // decisión consciente, no un olvido.
        if (sobrante.length > 0) {
          const detalle = sobrante
            .map((m: any) => `  · ${m.description}: retirado ${m.withdrawnQty}, usado ${m.usedQty ?? 0} → sobran ${m.porDevolver} ${m.unit || ''}`)
            .join('\n');
          const ok = await confirmar(
            'Hay material retirado que no se declaró como usado:\n\n' + detalle +
            '\n\nSi NO vuelve al almacén, el stock del sistema quedará por debajo del real.\n\n' +
            'Aceptar = cerrar sin devolver (se queda contigo).\n' +
            'Cancelar = volver y devolverlo primero.',
          );
          if (!ok) { setGuardando(false); return; }
        }

        await api.post('/work-orders/' + wo.id + '/close', {
          email, password,
          endedAt: iso(fin),
          // Se manda el CÓDIGO del catálogo. El servidor escribe también el
          // enum cuando coincide, para que los informes viejos sigan leyendo.
          rootCauseCode: causa || undefined,
          rootCause: causa || undefined,
          symptomCode: sintoma || undefined,
          actionCode: accionRealizada || undefined,
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
        {accion === 'abrir' && acceso?.aplica && (
          <div style={{
            background: acceso.aprobado && !acceso.faltan?.length ? '#e7f7ee' : '#fdecec',
            border: '1px solid ' + (acceso.aprobado && !acceso.faltan?.length ? '#bfe9cf' : '#f6c9c9'),
            borderLeft: '4px solid ' + (acceso.aprobado && !acceso.faltan?.length ? 'var(--ok)' : 'var(--crit)'),
            borderRadius: 8, padding: '10px 12px', marginBottom: 12,
          }}>
            <div style={{
              fontWeight: 700, fontSize: 13,
              color: acceso.aprobado && !acceso.faltan?.length ? '#166534' : '#991b1b',
            }}>
              {acceso.aprobado && !acceso.faltan?.length ? 'Permiso de acceso en regla' : 'ATENCIÓN — permiso de acceso'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>{acceso.resumen}</div>
            {acceso.solicitud?.heightMeters != null && (
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                Trabajo a {acceso.solicitud.heightMeters} m · medio: {acceso.solicitud.means}
              </div>
            )}
          </div>
        )}

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
          <ListaCatalogo
            etiqueta="¿Por qué no se avanzó más?"
            valor={motivoAvance}
            onChange={setMotivoAvance}
            items={catalogos?.MOTIVO_AVANCE}
            vacio="Todavía no hay motivos configurados. Se crean en Ubicaciones → Catálogos."
          />
        )}

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

            {/* LA RUTINA, SOLO EN PREVENTIVO.
                En un correctivo no hay rutina que seguir: se va a arreglar algo
                concreto. Enseñarla ahí sería ruido. */}
            {wo.type === 'PREVENTIVO' && (
              <RutinaEnCampo workOrderId={wo.id} onCambio={setBloqueoRutina} />
            )}

            {sobrante.length > 0 && (
              <div style={{
                background: '#fff4e5', border: '1px solid #f5dcb0',
                borderLeft: '4px solid var(--warn)', borderRadius: 8,
                padding: '10px 12px', marginBottom: 12,
              }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                  Material retirado que no se usó
                </div>
                {sobrante.map((m: any) => (
                  <div key={m.id} style={{ fontSize: 12 }}>
                    {m.description}: retirado <b>{m.withdrawnQty}</b>, usado{' '}
                    <b>{m.usedQty ?? 0}</b> → sobran{' '}
                    <b style={{ color: '#b45309' }}>{m.porDevolver} {m.unit || ''}</b>
                  </div>
                ))}
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                  Con el cable esto es lo normal: se retira un tramo y se usa lo
                  que hace falta. Si no vuelve, el stock queda por debajo del real.
                </div>
                <button type="button" className="btn-mini" style={{ marginTop: 8 }}
                  disabled={devolviendo} onClick={devolverSobrante}>
                  {devolviendo ? 'Devolviendo…' : 'Devolver al almacén ahora'}
                </button>
              </div>
            )}

            <label>Hora real de cierre</label>
            <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} />

            {/* SÍNTOMA -> CAUSA -> ACCIÓN, en ese orden y separados.
                El síntoma es lo que se VE; la causa lo que se DESCUBRE.
                Mezclarlos es lo que hace que "no hay imagen" figure como causa
                de 40 órdenes sin que nadie sepa por qué. */}
            <ListaCatalogo
              etiqueta="¿Qué viste? (síntoma)"
              valor={sintoma}
              onChange={setSintoma}
              items={catalogos?.SINTOMA}
              vacio="Todavía no hay síntomas configurados. Se crean en Ubicaciones → Catálogos."
            />

            <ListaCatalogo
              etiqueta="Causa encontrada"
              valor={causa}
              onChange={setCausa}
              items={catalogos?.CAUSA}
              vacio="No hay causas configuradas."
            />

            <ListaCatalogo
              etiqueta="¿Qué hiciste? (acción)"
              valor={accionRealizada}
              onChange={setAccionRealizada}
              items={catalogos?.ACCION}
              vacio="Todavía no hay acciones configuradas. Se crean en Ubicaciones → Catálogos."
            />

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

/**
 * Desplegable alimentado por un catálogo editable (3E).
 *
 * Agrupa por familia porque con muchas opciones en una lista plana, dentro de
 * un teléfono y con la parada corriendo, se elige la primera que se ve.
 *
 * Y si el catálogo está VACÍO no pinta un desplegable inútil: dice dónde se
 * llena. Un control vacío sin explicación hace que el técnico crea que el
 * sistema está roto.
 */
function ListaCatalogo({ etiqueta, valor, onChange, items, vacio }: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  items?: any[];
  vacio: string;
}) {
  if (!items || !items.length) {
    return (
      <>
        <label>{etiqueta}</label>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{vacio}</div>
      </>
    );
  }

  const grupos = new Map<string, any[]>();
  for (const i of items) {
    const g = (i.group || '').trim() || 'Otros';
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g)!.push(i);
  }
  const orden = [...grupos.entries()].sort((a, b) => {
    if (a[0] === 'Otros') return 1;
    if (b[0] === 'Otros') return -1;
    return a[0].localeCompare(b[0]);
  });

  return (
    <>
      <label>{etiqueta}</label>
      <select value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">— sin especificar —</option>
        {orden.map(([grupo, opciones]) => (
          <optgroup key={grupo} label={grupo}>
            {opciones.map((o: any) => <option key={o.code} value={o.code}>{o.name}</option>)}
          </optgroup>
        ))}
      </select>
    </>
  );
}
