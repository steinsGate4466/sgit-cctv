import { useEffect, useState, useCallback, FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

/**
 * DEFINICIÓN DE LAS RUTINAS PREVENTIVAS, POR TIPO DE ACTIVO.
 *
 * Antes, QUÉ se hace en una visita preventiva no existía como dato: vivía en la
 * cabeza del técnico. Cada uno hacía lo que recordaba, el que entraba nuevo no
 * sabía por dónde empezar, y no había forma de comprobar si se hizo.
 *
 * NACEN VACÍAS A PROPÓSITO. Yo no sé qué se revisa en una cámara del Tren 2 ni
 * con qué se limpia. Lo escriben ustedes.
 */

const TIPOS = [
  { v: 'CAMERA', t: 'Cámara' }, { v: 'NVR', t: 'Grabador' }, { v: 'SWITCH', t: 'Switch' },
  { v: 'WIRELESS', t: 'Antena / enlace' }, { v: 'DECODER', t: 'Decodificador' },
  { v: 'PANTALLA', t: 'Pantalla' }, { v: 'PC', t: 'PC / iVMS' }, { v: 'UPS', t: 'UPS' },
  { v: 'ROUTER', t: 'Router' }, { v: 'FIREWALL', t: 'Firewall' }, { v: 'SERVER', t: 'Servidor' },
  { v: 'FIBER', t: 'Fibra' }, { v: 'CABINET', t: 'Gabinete' }, { v: 'OTHER', t: 'Otro' },
];
const TIPO_ES = Object.fromEntries(TIPOS.map((t) => [t.v, t.t]));

export default function RutinasEditor() {
  const { can } = useAuth();
  const editable = can('location.manage');

  const [rutinas, setRutinas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState<string>('');
  const [nuevoTipo, setNuevoTipo] = useState('');
  const [punto, setPunto] = useState<any>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await api.get('/checklist/plantillas').then((x) => x.data).catch(() => []);
    setRutinas(r || []);
  }, []);
  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  const error = (err: any) => {
    const m = err?.response?.data?.message;
    window.alert(Array.isArray(m) ? m.join(', ') : m || 'No se pudo completar la acción.');
  };

  async function crearRutina() {
    if (!nuevoTipo) return;
    try {
      await api.post('/checklist/plantillas', { assetType: nuevoTipo });
      setNuevoTipo('');
      await cargar();
    } catch (err) { error(err); }
  }

  async function guardarPunto(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      if (punto.id) {
        await api.patch('/checklist/puntos/' + punto.id, {
          text: punto.text, help: punto.help, sequence: Number(punto.sequence) || 0,
          critical: !!punto.critical,
        });
      } else {
        await api.post('/checklist/plantillas/' + punto.templateId + '/puntos', {
          text: punto.text, help: punto.help, sequence: Number(punto.sequence) || 0,
          critical: !!punto.critical,
        });
      }
      setPunto(null);
      await cargar();
    } catch (err) { error(err); } finally { setGuardando(false); }
  }

  async function quitarPunto(p: any) {
    if (!window.confirm(
      `"${p.text}" dejará de pedirse en las rutinas nuevas.\n\n` +
      'NO se borra: las órdenes que ya lo respondieron lo conservan.\n\n¿Continuar?')) return;
    try { await api.delete('/checklist/puntos/' + p.id); await cargar(); }
    catch (err) { error(err); }
  }

  const usados = new Set(rutinas.map((r) => r.assetType));
  const disponibles = TIPOS.filter((t) => !usados.has(t.v));

  if (cargando) return <div className="loading">Cargando rutinas…</div>;

  return (
    <div>
      <div className="sign-note">
        Esto es lo que el técnico verá punto por punto al hacer un preventivo.
        Escríbelo en imperativo y sin ambigüedad: <b>"Limpiar el lente y
        comprobar imagen en el púlpito"</b>, no "revisar cámara". Un punto vago
        no se puede responder.
      </div>

      {editable && disponibles.length > 0 && (
        <div className="filters" style={{ marginTop: 12 }}>
          <div>
            <label>Crear rutina para</label>
            <select value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value)}>
              <option value="">— tipo de activo —</option>
              {disponibles.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
            </select>
          </div>
          <div>
            <label>&nbsp;</label>
            <button className="btn-primary" disabled={!nuevoTipo} onClick={crearRutina}>Crear</button>
          </div>
        </div>
      )}

      {!rutinas.length ? (
        <div className="card" style={{ padding: 36, textAlign: 'center', marginTop: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)' }}>
            Todavía no hay ninguna rutina definida
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            Mientras no la haya, un preventivo se cierra sin comprobar nada, que
            es como funcionaba hasta ahora.
            <br />Empieza por la <b>cámara</b>: es el equipo del que más hay.
          </div>
        </div>
      ) : (
        rutinas.map((r) => {
          const activos = (r.items || []).filter((i: any) => i.active);
          return (
            <div key={r.id} className="panel" style={{ marginTop: 12 }}>
              <h3
                style={{ cursor: 'pointer' }}
                onClick={() => setAbierta(abierta === r.id ? '' : r.id)}
              >
                {TIPO_ES[r.assetType] || r.assetType}
                <span className="muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                  {activos.length} punto(s)
                  {!activos.length && ' · vacía, no comprobará nada'}
                </span>
              </h3>

              {abierta === r.id && (
                <>
                  {activos.map((i: any) => (
                    <div key={i.id} style={{
                      display: 'flex', justifyContent: 'space-between', gap: 10,
                      padding: '8px 0', borderTop: '1px solid var(--border)',
                    }}>
                      <div>
                        <div style={{ fontSize: 13 }}>
                          <span className="muted" style={{ marginRight: 6 }}>{i.sequence}</span>
                          {i.text}
                          {i.critical && (
                            <span style={{ color: 'var(--crit)', fontSize: 11, marginLeft: 6 }}>· crítico</span>
                          )}
                        </div>
                        {i.help && <div className="muted" style={{ fontSize: 11 }}>{i.help}</div>}
                      </div>
                      {editable && (
                        <div style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn-mini" onClick={() => setPunto({ ...i })}>Editar</button>
                          <button className="btn-mini" style={{ marginLeft: 4 }}
                            onClick={() => quitarPunto(i)}>Quitar</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {editable && (
                    <button className="btn-mini" style={{ marginTop: 10 }}
                      onClick={() => setPunto({
                        templateId: r.id, text: '', help: '',
                        sequence: (activos.length + 1) * 10, critical: false,
                      })}>
                      + Añadir punto
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })
      )}

      {punto && (
        <form className="panel" style={{ marginTop: 12 }} onSubmit={guardarPunto}>
          <h3>{punto.id ? 'Editar punto' : 'Nuevo punto de la rutina'}</h3>

          <label>¿Qué hay que comprobar?</label>
          <input value={punto.text} onChange={(e) => setPunto({ ...punto, text: e.target.value })}
            placeholder="ej. Limpiar el lente y comprobar imagen en el púlpito" required />

          <label>Cómo se hace o con qué (opcional)</label>
          <input value={punto.help || ''} onChange={(e) => setPunto({ ...punto, help: e.target.value })}
            placeholder="ej. Paño de microfibra, sin alcohol" />

          <label>Orden</label>
          <input type="number" value={punto.sequence}
            onChange={(e) => setPunto({ ...punto, sequence: e.target.value })} />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontWeight: 400 }}>
            <input type="checkbox" checked={!!punto.critical} style={{ width: 'auto' }}
              onChange={(e) => setPunto({ ...punto, critical: e.target.checked })} />
            Si sale <b>No conforme</b>, proponer una orden correctiva
          </label>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            Márcalo solo en lo que de verdad deja el equipo comprometido. Si todo
            hallazgo generara una orden, una tarde de preventivos llenaría el
            tablero de trabajo que nadie pidió y dejaría de creérselo nadie.
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn-mini" onClick={() => setPunto(null)}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
