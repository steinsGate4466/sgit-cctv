import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useDialogos } from './Dialogos';
import SelectorDeActivo from './SelectorDeActivo';
import { mensajeDeError } from '../avisos';

/**
 * LOS EQUIPOS DE ESTA ORDEN — bloque 110-B.
 *
 * =============================================================================
 *  PARA QUÉ
 * =============================================================================
 *  El técnico llega a la cámara 45 y descubre que además hay que tocar el
 *  switch. Hasta ahora sus opciones eran abrir otra orden o no registrarlo —y
 *  se registraba lo segundo—. De ahí que los indicadores salieran bajos.
 *
 *  Aquí lo añade a la misma orden, y la orden pasa a contar lo que de verdad
 *  se tocó.
 *
 * =============================================================================
 *  REPORTADO Y TOCADO NO SON LO MISMO
 * =============================================================================
 *  La pantalla los separa porque en planta no se parecen:
 *
 *    · lo REPORTADO que quedó sin tocar es una deuda con Producción — su
 *      cámara puede seguir mal;
 *    · lo TOCADO que nadie reportó es lo que el técnico encontró por su cuenta.
 *
 *  Un solo booleano —el `scopeChanged` de antes— no distinguía las dos, y son
 *  dos conversaciones distintas con Producción.
 */
type Props = { workOrderId: string; cerrada: boolean };

export default function EquiposDeLaOm({ workOrderId, cerrada }: Props) {
  const { can } = useAuth();
  const { confirmar } = useDialogos();
  const puedeTocar = can('wo.update') && !cerrada;

  const [d, setD] = useState<any>(null);
  const [opciones, setOpciones] = useState<any[]>([]);
  const [elegido, setElegido] = useState('');
  const [papel, setPapel] = useState<'INTERVENIDO' | 'REPORTADO'>('INTERVENIDO');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const r = await api.get(`/work-orders/${workOrderId}/equipos`);
      setD(r.data);
    } catch { setD(null); }
  }, [workOrderId]);

  /* Guardia del bloque 115: al cambiar de orden, la respuesta de la anterior
     no puede quedarse pintada sobre ésta. */
  useEffect(() => {
    let vivo = true;
    api.get(`/work-orders/${workOrderId}/equipos`)
      .then((r) => { if (vivo) setD(r.data); })
      .catch(() => { if (vivo) setD(null); });
    return () => { vivo = false; };
  }, [workOrderId]);

  useEffect(() => {
    let vivo = true;
    if (!puedeTocar) return undefined;
    api.get('/assets/options')
      .then((r) => { if (vivo) setOpciones(r.data || []); })
      .catch(() => { if (vivo) setOpciones([]); });
    return () => { vivo = false; };
  }, [puedeTocar]);

  async function apuntar() {
    if (!elegido) return;
    setGuardando(true); setError('');
    try {
      await api.post(`/work-orders/${workOrderId}/equipos`, { assetId: elegido, papel });
      setElegido('');
      await cargar();
    } catch (e: any) {
      setError(mensajeDeError(e, 'apuntar el equipo'));
    } finally { setGuardando(false); }
  }

  async function quitar(fila: any) {
    const ok = await confirmar({
      titulo: 'Quitar el equipo de esta orden',
      mensaje: `${fila.asset?.assetCode || 'Este equipo'} dejará de contar como trabajo `
        + 'de esta orden. Queda registrado quién lo quitó.',
      aceptar: 'Quitar',
    });
    if (!ok) return;
    try {
      await api.delete(`/work-orders/${workOrderId}/equipos/${fila.id}`);
      await cargar();
    } catch (e: any) {
      setError(mensajeDeError(e, 'quitar el equipo'));
    }
  }

  if (!d) return null;

  const reportados = d.items.filter((x: any) => x.papel === 'REPORTADO');
  const tocados = d.items.filter((x: any) => x.papel === 'INTERVENIDO');
  const sinTocar = d.resumen?.reportadosSinTocar ?? [];

  const bloque = (titulo: string, filas: any[], vacio: string) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{titulo}</div>
      {!filas.length ? <div className="muted" style={{ fontSize: 12 }}>{vacio}</div> : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {filas.map((f: any) => (
            <li key={f.id}>
              <b>{f.asset?.assetCode || '—'}</b>
              <span className="muted"> · {f.asset?.type || ''}</span>
              {sinTocar.includes(f.assetId) && f.papel === 'REPORTADO' && (
                <span className="chip"> sin tocar</span>
              )}
              {puedeTocar && (
                <button type="button" className="btn-mini" style={{ marginLeft: 8 }}
                  onClick={() => quitar(f)}>Quitar</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Equipos de esta orden</h3>
        <span className="chip">{d.resumen?.cuantosEquipos ?? 0} en total</span>
      </div>

      {error && <div className="card peligro" style={{ marginTop: 8 }}>{error}</div>}

      {bloque('Reportado', reportados, 'Nadie declaró qué se pidió revisar.')}
      {bloque('Tocado en campo', tocados, 'Todavía no se ha apuntado ningún equipo.')}

      {/* La deuda con Producción, dicha con todas las letras. */}
      {sinTocar.length > 0 && (
        <div className="card aviso" style={{ marginTop: 8 }}>
          <b>Se reportó algo que no se ha tocado.</b>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            Producción pidió revisar {sinTocar.length} equipo(s) que siguen sin intervenir.
          </p>
        </div>
      )}

      {puedeTocar && (
        <div className="filters" style={{ marginTop: 10 }}>
          <SelectorDeActivo
            etiqueta="Equipo que se apunta"
            opciones={opciones}
            valor={elegido}
            onChange={setElegido}
            vacio="Elegir equipo…"
          />
          <select aria-label="Papel del equipo en la orden" value={papel}
            onChange={(e) => setPapel(e.target.value as any)}>
            <option value="INTERVENIDO">Lo toqué</option>
            <option value="REPORTADO">Lo reportaron</option>
          </select>
          <button type="button" className="btn-primary" onClick={apuntar}
            disabled={guardando || !elegido}
            title={!elegido ? 'Elige primero el equipo' : undefined}>
            {guardando ? 'Apuntando…' : 'Apuntar'}
          </button>
        </div>
      )}
    </div>
  );
}
