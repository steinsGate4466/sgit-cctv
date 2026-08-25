import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import { mensajeDeError } from '../avisos';

/**
 * BORRADO DEFINITIVO — el mismo diálogo en Activos y en Limpieza.
 *
 * Existe como componente compartido a propósito: dos diálogos de borrado que
 * evolucionan por separado acaban con uno de los dos sin la confirmación
 * escrita, y ese es justo el que alguien va a usar el día malo.
 *
 * SIEMPRE: primero se pide la vista previa al servidor y se enseña qué se
 * lleva por delante; después hay que escribir el código a mano.
 */
export default function BorrarDefinitivo({
  tipo, id, onCerrar, onBorrado,
}: {
  tipo: 'activo' | 'om' | 'usuario';
  id: string;
  onCerrar: () => void;
  onBorrado: (r: any) => void;
}) {
  const [previa, setPrevia] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [confirmacion, setConfirmacion] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState('');
  // Segunda llave para lo que trae avisos (orden cerrada, material retirado).
  const [forzar, setForzar] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.get(`/purga/${tipo}/${id}`)
      .then((r) => { if (vivo) setPrevia(r.data); })
      .catch((e) => { if (vivo) setError(mensajeDeError(e, 'consultar')); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [tipo, id]);

  const esperado = previa
    ? (tipo === 'activo' ? previa.activo?.code
      : tipo === 'om' ? previa.om?.code
      : previa.usuario?.email) || ''
    : '';
  const puede = !!previa?.sePuedePurgar
    && confirmacion.trim() === esperado.trim()
    && (!previa?.exigeForzar || forzar);

  async function borrar() {
    setBorrando(true); setError('');
    try {
      const r = await api.post(`/purga/${tipo}/${id}`, { confirmacion, forzar });
      onBorrado(r.data);
    } catch (e: any) {
      setError(mensajeDeError(e, 'borrar'));
    } finally { setBorrando(false); }
  }

  return (
    <Modal
      title={
        tipo === 'activo' ? 'Borrar definitivamente el activo'
        : tipo === 'om' ? 'Borrar definitivamente la orden'
        : 'Borrar definitivamente el usuario'
      }
      onClose={onCerrar}
      acciones={
        <>
          <button className="btn-mini" onClick={onCerrar}>Cancelar</button>
          {previa?.sePuedePurgar && (
            <button className="btn-peligro" onClick={borrar} disabled={!puede || borrando}>
              {borrando ? 'Borrando…' : 'Borrar definitivamente'}
            </button>
          )}
        </>
      }
    >
      {cargando && <p className="muted">Comprobando qué se llevaría por delante…</p>}
      {error && <div role="alert" className="aviso-error" style={{ marginBottom: 10 }}>{error}</div>}

      {previa && !previa.sePuedePurgar && (
        <div className="card vacio" style={{ textAlign: 'left', margin: 0 }}>
          <h3 style={{ color: '#b3261e', marginTop: 0 }}>Esto no se borra</h3>
          <p style={{ margin: 0 }}>{previa.motivoSiNo}</p>
          {tipo === 'activo' && (
            <p style={{ marginBottom: 0, fontSize: 13 }}>
              Si el equipo salió de planta, lo correcto es <b>darlo de baja</b>:
              desaparece de los listados y conserva su historial.
            </p>
          )}
          {tipo === 'om' && (
            <p style={{ marginBottom: 0, fontSize: 13 }}>
              Si la orden ya no aplica pero el trabajo existió, <b>cancélala</b>:
              queda constancia de que se pidió y de que no se hizo.
            </p>
          )}
        </div>
      )}

      {previa?.sePuedePurgar && (
        <>
          <div className="card peligro" style={{ margin: '0 0 12px' }}>
            Esto <b>no se puede deshacer</b>. No es dar de baja: el registro
            desaparece de la base de datos.
          </div>

          {tipo === 'om' ? (
            <>
              <p style={{ fontSize: 13.5, margin: '0 0 8px' }}>
                Se borrará <b>{previa.om.code}</b> ({previa.om.tipo}, {previa.om.estado})
                {previa.om.equipo ? <> sobre <b>{previa.om.equipo}</b></> : null}.
              </p>
              {previa.arrastra?.length > 0 ? (
                <>
                  <div className="section-title">Y con ella, esto:</div>
                  <ul style={{ fontSize: 13, lineHeight: 1.8, margin: 0 }}>
                    {previa.arrastra.map((x: any) => <li key={x.que}><b>{x.n}</b> {x.que}</li>)}
                  </ul>
                </>
              ) : <p className="muted" style={{ fontSize: 13 }}>No arrastra nada: la orden está en blanco.</p>}

              {/* LO QUE SOBREVIVE. Si no se dice, alguien va a creer que
                  acaba de borrar 12 cámaras y va a entrar en pánico. */}
              {previa.sobrevive?.length > 0 && (
                <div className="card explica" style={{ marginTop: 12 }}>
                  <b>Esto NO se borra</b>, sólo pierde la referencia a la orden:
                  <ul style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.7 }}>
                    {previa.sobrevive.map((x: any) => <li key={x.que}><b>{x.n}</b> {x.que}</li>)}
                  </ul>
                  <div style={{ marginTop: 6, fontSize: 12.5 }}>
                    Los equipos existen en la planta exista o no el papeleo.
                  </div>
                </div>
              )}
            </>
          ) : tipo === 'activo' ? (
            <>
              <p style={{ fontSize: 13.5, margin: '0 0 8px' }}>
                Se borrará <b>{previa.activo.code}</b> ({previa.activo.tipo})
                {previa.activo.lugar ? <> de <b>{previa.activo.lugar}</b></> : null}.
              </p>
              {previa.arrastra?.length > 0 ? (
                <>
                  <div className="section-title">Y con él, esto:</div>
                  <ul style={{ fontSize: 13, lineHeight: 1.8, margin: 0 }}>
                    {previa.arrastra.map((x: any) => <li key={x.que}><b>{x.n}</b> {x.que}</li>)}
                  </ul>
                </>
              ) : <p className="muted" style={{ fontSize: 13 }}>No arrastra nada: el registro está suelto.</p>}
            </>
          ) : (
            <p style={{ fontSize: 13.5 }}>
              Se borrará <b>{previa.usuario.nombre}</b> ({previa.usuario.email}).
              No firmó ningún documento, así que no queda nada huérfano.
              {previa.ordenesAsignadas > 0 && (
                <> Tenía <b>{previa.ordenesAsignadas}</b> orden(es) asignada(s): quedarán sin técnico.</>
              )}
            </p>
          )}

          {previa.exigeForzar && (
            <div className="card peligro" style={{ margin: '14px 0 0' }}>
              <b>Lee esto antes:</b>
              <ul style={{ margin: '6px 0 10px', fontSize: 13, lineHeight: 1.65 }}>
                {previa.avisos.map((a: string) => <li key={a}>{a}</li>)}
              </ul>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: 0 }}>
                <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)}
                       style={{ width: 18, height: 18, minHeight: 18, marginTop: 2 }} />
                <span style={{ margin: 0, fontSize: 13, color: '#8c1414', fontWeight: 600 }}>
                  Lo he leído y quiero borrarla igual.
                  <small className="muted" style={{ display: 'block', fontWeight: 400 }}>
                    Quedará marcado en la auditoría que se forzó, y por qué avisos.
                  </small>
                </span>
              </label>
            </div>
          )}

          <label className="campo" style={{ marginTop: 14 }}>
            <span>Escribe <code>{esperado}</code> para confirmar</span>
            <input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)}
                   placeholder="Escríbelo exactamente" autoComplete="off" />
            <small className="muted">
              Se pide escribirlo para que no se borre la fila de al lado por un clic.
            </small>
          </label>
        </>
      )}
    </Modal>
  );
}
