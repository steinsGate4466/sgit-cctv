import { useState } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import Icono from './Iconos';
import { useAuth } from '../auth/AuthContext';

/**
 * BORRAR ESTE REGISTRO — el mismo botón en los quince módulos.
 *
 * ===========================================================================
 *  POR QUÉ UN SOLO COMPONENTE Y NO UN BOTÓN POR PANTALLA
 * ===========================================================================
 *  Quince diálogos de borrado copiados son quince sitios donde puede faltar
 *  la confirmación escrita, y el que falte va a ser justo el que alguien use
 *  el día malo. Aquí el freno es uno y está probado una vez.
 *
 *  Cada pantalla lo usa en una línea:
 *
 *      <BotonPurgar recurso="incidencia" id={x.id} onBorrado={recargar} />
 *
 *  El botón NO SE PINTA sin el permiso «Borrar definitivamente». Esconderlo
 *  no protege nada —el servidor lo vuelve a comprobar— pero enseñar un botón
 *  que va a fallar es peor que no enseñarlo.
 *
 * ===========================================================================
 *  EL FRENO, IGUAL PARA TODOS
 * ===========================================================================
 *   1. Primero se PREGUNTA al servidor qué se lleva por delante, y se enseña.
 *   2. Si hay avisos —está cerrado, tiene firma, salió material— hay que
 *      marcar una casilla aparte. Forzar queda MARCADO en la auditoría.
 *   3. Hay que ESCRIBIR el código a mano. Un `confirm()` del navegador se acepta por
 *      reflejo; escribir el código obliga a mirar cuál se está borrando.
 *      El error real es la fila de al lado.
 */
export default function BotonPurgar({
  recurso, id, etiquetaBoton, onBorrado, compacto = true,
}: {
  /** Clave del recurso: 'incidencia', 'ubicacion', 'gabinete', 'repuesto'… */
  recurso: string;
  id: string;
  etiquetaBoton?: string;
  onBorrado?: (r: any) => void;
  /** true = sólo el icono, para las filas de tabla. */
  compacto?: boolean;
}) {
  /* Bloque 34. Antes: `user.role === 'Jefe de Mantenimiento'`. Atar un botón
     irreversible al NOMBRE del rol significaba que renombrarlo desde la
     pantalla de Roles lo hacía desaparecer sin ningún aviso. */
  const { can } = useAuth();
  const puedePurgar = can('purga.definitiva');

  const [abierto, setAbierto] = useState(false);
  const [previa, setPrevia] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  const [confirmacion, setConfirmacion] = useState('');
  const [forzar, setForzar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState('');

  if (!puedePurgar) return null;

  async function abrir() {
    setAbierto(true); setCargando(true); setError('');
    setConfirmacion(''); setForzar(false); setPrevia(null);
    try {
      const r = await api.get(`/purga/r/${recurso}/${id}`);
      setPrevia(r.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo consultar.');
    } finally { setCargando(false); }
  }

  async function borrar() {
    setBorrando(true); setError('');
    try {
      const r = await api.post(`/purga/r/${recurso}/${id}`, { confirmacion, forzar });
      setAbierto(false);
      onBorrado?.(r.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo borrar.');
    } finally { setBorrando(false); }
  }

  // Cuando el código es el identificador interno, nadie va a teclear un uuid:
  // se pide la palabra BORRAR. Pedir el uuid haría que se copie y se pegue sin
  // mirar, que es justo lo contrario de lo que este freno busca.
  const porId = previa?.recurso?.campoCodigo === 'id';
  const esperado = porId ? 'BORRAR' : (previa?.codigo ?? '');
  const puede = !!previa
    && confirmacion.trim().toUpperCase() === String(esperado).toUpperCase()
    && (!previa.exigeForzar || forzar);

  return (
    <>
      {/* EL BOTÓN DICE LO QUE HACE.
          Antes era una escoba (🧹) y nada más. Un dibujo suelto obliga a
          adivinar, y aquí adivinar mal significa borrar un registro que no
          se recupera. Ahora pone «Eliminar», que es la palabra que el
          técnico busca, con la papelera al lado para encontrarlo de un
          vistazo en una fila llena de botones. */}
      <button
        className={compacto ? 'btn-mini btn-peligro' : 'btn-peligro'}
        title="Eliminar definitivamente. No se recupera. Exige el permiso de borrado definitivo."
        onClick={(e) => { e.stopPropagation(); abrir(); }}
      >
        <Icono n="papelera" size={compacto ? 14 : 16} />
        {etiquetaBoton ?? (compacto ? 'Eliminar' : 'Eliminar definitivamente')}
      </button>

      {abierto && (
        <Modal
          title={previa ? `Borrar ${previa.recurso.etiqueta.toLowerCase()} ${previa.codigo}` : 'Borrar definitivamente'}
          onClose={() => setAbierto(false)}
          acciones={
            <>
              <button className="btn-mini" onClick={() => setAbierto(false)}>Cancelar</button>
              {previa && (
                <button className="btn-peligro" onClick={borrar} disabled={!puede || borrando}>
                  {borrando ? 'Eliminando…' : 'Eliminar definitivamente'}
                </button>
              )}
            </>
          }
        >
          {cargando && <p className="muted">Comprobando qué se llevaría por delante…</p>}
          {error && <div className="aviso-error" style={{ marginBottom: 10 }}>{error}</div>}

          {previa && (
            <>
              <div className="card peligro" style={{ margin: '0 0 12px' }}>
                Esto <b>no se puede deshacer</b>. El registro desaparece de la base de datos.
              </div>

              {/* De qué registro estamos hablando, sin adivinar. */}
              <div className="form-grid">
                {Object.entries(previa.registro)
                  .filter(([k]) => k !== 'id')
                  .map(([k, v]) => (
                    <div key={k}>
                      <b style={{ fontSize: 12 }}>{k}</b>
                      <div style={{ fontSize: 13.5 }}>
                        {v === null || v === undefined || v === ''
                          ? <span className="muted">—</span>
                          : typeof v === 'boolean' ? (v ? 'Sí' : 'No')
                          : String(v).length > 60 ? String(v).slice(0, 60) + '…'
                          : String(v)}
                      </div>
                    </div>
                  ))}
              </div>

              {previa.arrastra?.length > 0 ? (
                <>
                  <div className="section-title">Y con él, esto:</div>
                  <ul style={{ fontSize: 13, lineHeight: 1.8, margin: 0 }}>
                    {previa.arrastra.map((x: any) => <li key={x.que}><b>{x.n}</b> {x.que}</li>)}
                  </ul>
                </>
              ) : (
                <p className="muted" style={{ fontSize: 13 }}>No arrastra nada: el registro está suelto.</p>
              )}

              {/* Lo que sobrevive. Si no se dice, alguien cree que lo perdió. */}
              {previa.sobrevive?.length > 0 && (
                <div className="card explica" style={{ marginTop: 12 }}>
                  <b>Esto NO se borra</b>, sólo pierde la referencia:
                  <ul style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.7 }}>
                    {previa.sobrevive.map((x: any) => <li key={x.que}><b>{x.n}</b> {x.que}</li>)}
                  </ul>
                </div>
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
                      Lo he leído y quiero borrarlo igual.
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
                  {porId
                    ? 'Este registro no tiene código propio, así que se pide la palabra.'
                    : 'Se pide escribirlo para que no se borre la fila de al lado por un clic.'}
                </small>
              </label>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
