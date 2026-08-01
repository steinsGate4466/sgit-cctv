import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';

/**
 * LA RUTINA PREVENTIVA, RESPONDIDA EN CAMPO.
 *
 * CÓMO ESTÁ PENSADA
 * Tres botones grandes por punto —Conforme / No conforme / No aplica— y nada
 * que escribir salvo cuando algo sale mal. El técnico está de pie, con guantes,
 * con la parada corriendo: cada campo de texto es una posibilidad de que ponga
 * un punto para poder seguir.
 *
 * LO ÚNICO QUE SE EXIGE ESCRIBIR es el detalle de un "No conforme". Sin eso, la
 * orden no se puede cerrar. Un no conforme mudo no le dice nada a quien lea la
 * orden dentro de seis meses, que es justo cuando sirve.
 */

type Resultado = 'OK' | 'NO_OK' | 'NO_APLICA';

const BOTONES: { v: Resultado; t: string; fondo: string; color: string }[] = [
  { v: 'OK', t: 'Conforme', fondo: '#e7f7ee', color: '#166534' },
  { v: 'NO_OK', t: 'No conforme', fondo: '#fdecec', color: '#991b1b' },
  { v: 'NO_APLICA', t: 'No aplica', fondo: '#eef2f9', color: '#6b7688' },
];

export default function RutinaEnCampo({ workOrderId, soloLectura, onCambio }: {
  workOrderId: string;
  soloLectura?: boolean;
  onCambio?: (bloqueo: string | null) => void;
}) {
  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const r = await api.get('/checklist/orden/' + workOrderId)
      .then((x) => x.data).catch(() => null);
    setDatos(r);
    onCambio?.(r?.bloqueo ?? null);
  }, [workOrderId, onCambio]);

  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  const respuestaDe = (itemId: string) =>
    (datos?.respuestas || []).find((r: any) => r.itemId === itemId);

  async function responder(itemId: string, result: Resultado, notaPrevia?: string) {
    setError('');
    let note = notaPrevia;

    // Solo se pregunta cuando hace falta. Preguntar siempre sería otro campo
    // que rellenar en cada punto conforme, que son la mayoría.
    if (result === 'NO_OK') {
      const punto = datos.puntos.find((p: any) => p.id === itemId);
      note = window.prompt(
        `"${punto?.text}"\n\n¿Qué encontraste? Es obligatorio.`,
        respuestaDe(itemId)?.note || '',
      ) ?? undefined;
      if (note === undefined) return;          // canceló
      if (!note.trim()) {
        setError('Un "No conforme" sin explicar no sirve. Di qué encontraste.');
        return;
      }
    }

    try {
      await api.post('/checklist/orden/' + workOrderId, { itemId, result, note });
      await cargar();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar la respuesta.');
    }
  }

  if (cargando) return <div className="loading">Cargando la rutina…</div>;

  if (!datos?.aplica) {
    return (
      <div className="sign-note" style={{ marginBottom: 12 }}>
        {datos?.motivo || 'No hay rutina para esta orden.'}
      </div>
    );
  }

  const e = datos.estado;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          {datos.plantilla.name}
          <span className="muted" style={{ fontWeight: 400 }}> · {datos.assetCode}</span>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {e.respondidos} de {e.total} · {e.porcentaje}%
        </div>
      </div>

      <div className="stack-bar" style={{ height: 10, marginTop: 6 }}>
        <span className="seg ok" style={{ width: `${(e.ok / Math.max(1, e.total)) * 100}%` }} />
        <span className="seg crit" style={{ width: `${(e.noOk / Math.max(1, e.total)) * 100}%` }} />
        <span className="seg info" style={{ width: `${(e.noAplica / Math.max(1, e.total)) * 100}%` }} />
      </div>

      {error && (
        <div style={{
          background: '#fdecec', border: '1px solid #f6c9c9', borderRadius: 6,
          padding: '8px 10px', marginTop: 10, fontSize: 12, color: '#991b1b',
        }}>{error}</div>
      )}

      <div style={{ marginTop: 12 }}>
        {datos.puntos.map((p: any, i: number) => {
          const r = respuestaDe(p.id);
          return (
            <div key={p.id} style={{
              borderTop: i ? '1px solid var(--border)' : 'none',
              padding: '10px 0',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {p.text}
                {p.critical && (
                  <span style={{ color: 'var(--crit)', fontSize: 11, marginLeft: 6 }}>· crítico</span>
                )}
              </div>
              {p.help && (
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{p.help}</div>
              )}

              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {BOTONES.map((b) => {
                  const activo = r?.result === b.v;
                  return (
                    <button
                      key={b.v}
                      type="button"
                      disabled={soloLectura}
                      onClick={() => responder(p.id, b.v)}
                      style={{
                        border: '1px solid ' + (activo ? b.color : 'var(--border)'),
                        background: activo ? b.fondo : 'var(--card)',
                        color: activo ? b.color : 'var(--muted)',
                        fontWeight: activo ? 700 : 500,
                        borderRadius: 8,
                        // Botones grandes: se pulsan con guantes.
                        padding: '10px 16px',
                        fontSize: 13,
                        cursor: soloLectura ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {b.t}
                    </button>
                  );
                })}
              </div>

              {r?.result === 'NO_OK' && r.note && (
                <div style={{ fontSize: 12, color: '#991b1b', marginTop: 6 }}>
                  {r.note}
                  {!soloLectura && (
                    <button type="button" className="btn-mini" style={{ marginLeft: 8 }}
                      onClick={() => responder(p.id, 'NO_OK')}>corregir</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {datos.bloqueo && (
        <div style={{
          background: '#fff4e5', border: '1px solid #f5dcb0', borderLeft: '4px solid var(--warn)',
          borderRadius: 8, padding: '10px 12px', marginTop: 12, fontSize: 12,
        }}>
          <b>No se puede cerrar todavía.</b> {datos.bloqueo}
        </div>
      )}

      {!datos.bloqueo && datos.propuestas?.length > 0 && (
        <div style={{
          background: '#eef4ff', border: '1px solid #dbe6fb', borderLeft: '4px solid var(--steel)',
          borderRadius: 8, padding: '10px 12px', marginTop: 12,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            {datos.propuestas.length} hallazgo(s) crítico(s) para convertir en trabajo
          </div>
          <div className="muted" style={{ fontSize: 11, margin: '4px 0 8px' }}>
            Se PROPONE, no se crea solo: una tarde de preventivos no puede llenar
            el tablero de órdenes que nadie decidió.
          </div>
          {datos.propuestas.map((p: any) => (
            <div key={p.itemId} style={{ fontSize: 12, marginTop: 6 }}>
              · {p.texto}
              <a
                className="btn-mini"
                style={{ marginLeft: 8, display: 'inline-block' }}
                href={'/maintenance?' + new URLSearchParams({
                  nueva: '1', tipo: 'CORRECTIVO', actividad: p.actividad,
                }).toString()}
              >
                Abrir OM
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
