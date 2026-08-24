import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useDialogos } from '../components/Dialogos';
import { EsqueletoTablero } from '../components/Esqueleto';
import Icono from '../components/Iconos';
import { Titular } from '../components/Patron';
import { useVolverALaPantalla } from '../useVolverALaPantalla';
import { plural } from '../formato';

/**
 * MEJORAS A LOS PROCEDIMIENTOS — bloque 58.
 *
 * =============================================================================
 *  EL CIRCUITO QUE ESTABA ROTO POR EL ÚLTIMO TRAMO
 * =============================================================================
 *  Un técnico, en campo, ve que el paso 4 del procedimiento está mal: dice que
 *  se desconecte primero el PoE y en la práctica hay que hacerlo al revés.
 *  Pulsa «proponer mejora» y lo escribe.
 *
 *  Eso funcionaba desde el bloque 29. Y desde el bloque 29, esa propuesta se
 *  guardaba y AHÍ MORÍA: no había pantalla donde nadie la viera.
 *
 *  A la tercera vez que se propone al vacío, se deja de proponer. Y con eso se
 *  pierde lo único que no está en ningún manual: lo que sabe quien tiene el
 *  equipo delante, de noche y solo.
 *
 * =============================================================================
 *  DECISIONES DE PANTALLA, Y POR QUÉ
 * =============================================================================
 *  1. NO ES UNA TABLA. Cada propuesta es un párrafo escrito por una persona,
 *     no un registro. En una tabla el texto se corta a tres palabras y hay que
 *     abrir cada fila para leerlo — con quince propuestas, nadie lo hace.
 *     Una tarjeta por propuesta, con el texto ENTERO visible.
 *
 *  2. EL CONTEXTO VA ANTES QUE LA DECISIÓN. Arriba de cada tarjeta: de qué
 *     procedimiento, de qué orden salió, quién y cuándo. Sin eso, aceptar es
 *     firmar a ciegas: lo que se apruebe aquí lo va a seguir el próximo
 *     técnico.
 *
 *  3. RECHAZAR CUESTA MÁS QUE ACEPTAR, A PROPÓSITO. Aceptar es un botón.
 *     Rechazar abre un campo y EXIGE el motivo — lo exige también el servidor.
 *     Un «no» sin explicación desanima más que el silencio.
 *
 *  4. «SE AÑADE COMO PASO» VIENE MARCADO. Es lo que se quiere el 90% de las
 *     veces. Se puede desmarcar cuando la mejora es un matiz y no un paso
 *     nuevo, pero el camino corto es el habitual.
 *
 *  5. LO MÁS VIEJO ARRIBA. Una propuesta de hace tres semanas es la que está
 *     a punto de hacer que alguien deje de proponer. Lo urgente aquí no es lo
 *     nuevo: es lo que lleva esperando.
 */
export default function Mejoras() {
  const { can } = useAuth();
  const { confirmar, avisar } = useDialogos();
  const puedeDecidir = can('procedimiento.manage');

  const [pendientes, setPendientes] = useState<any[] | null>(null);
  const [mias, setMias] = useState<any[] | null>(null);
  const [vista, setVista] = useState<'pendientes' | 'mias'>(
    puedeDecidir ? 'pendientes' : 'mias',
  );
  const [error, setError] = useState('');
  // Qué tarjeta tiene abierto el campo de rechazo, y con qué texto.
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [comoPaso, setComoPaso] = useState(true);
  const [enviando, setEnviando] = useState('');

  const cargar = useCallback(async () => {
    setError('');
    try {
      const [p, m] = await Promise.all([
        puedeDecidir
          ? api.get('/procedimientos-mejoras/pendientes').then((r) => r.data)
          : Promise.resolve([]),
        api.get('/procedimientos-mejoras/mias').then((r) => r.data),
      ]);
      setPendientes(p);
      setMias(m);
    } catch {
      setError('No se pudo cargar. Vuelve a intentarlo.');
      setPendientes([]); setMias([]);
    }
  }, [puedeDecidir]);

  useEffect(() => { cargar(); }, [cargar]);
  // Bloque 37: al volver de otra pestaña, los datos pueden haber cambiado.
  useVolverALaPantalla(cargar);

  async function decidir(id: string, aceptada: boolean) {
    if (!aceptada && !motivo.trim()) {
      await avisar({
        titulo: 'Falta el motivo',
        mensaje: 'Quien la propuso estuvo en campo y merece la respuesta. Si no, deja de proponer.',
      });
      return;
    }
    if (aceptada) {
      const ok = await confirmar({
        titulo: '¿Aceptar esta mejora?',
        mensaje: comoPaso
          ? 'Se añadirá como un paso más del procedimiento. A partir de ahora lo sigue todo el mundo.'
          : 'Queda aceptada, pero NO se añade como paso al procedimiento.',
        aceptar: 'Sí, aceptar',
      });
      if (!ok) return;
    }

    setEnviando(id);
    try {
      await api.patch(`/procedimientos-mejoras/${id}`, {
        estado: aceptada ? 'ACEPTADA' : 'RECHAZADA',
        motivo: motivo.trim() || undefined,
        comoPaso,
      });
      setRechazando(null); setMotivo(''); setComoPaso(true);
      await cargar();
    } catch (e: any) {
      await avisar({
        titulo: 'No se pudo guardar',
        mensaje: e?.response?.data?.message
          || 'Vuelve a intentarlo. Si sigue igual, actualiza la pantalla.',
      });
    } finally { setEnviando(''); }
  }

  if (pendientes === null || mias === null) return <EsqueletoTablero />;

  const nPend = pendientes.length;
  const nMiasPend = mias.filter((m) => m.estado === 'PROPUESTA').length;
  const lista = vista === 'pendientes' ? pendientes : mias;

  return (
    <>
      {/* El título dice PARA QUÉ entra cada uno. Al jefe le llega trabajo por
          decidir; al técnico le llega una respuesta. Es la misma pantalla y
          son dos cosas distintas. */}
      <h2>{puedeDecidir ? 'Mejoras a los procedimientos' : 'Mis propuestas de mejora'}</h2>
      <p className="sub">
        {puedeDecidir
          ? 'Lo que propone quien está delante del equipo. Si nadie contesta, dejan de proponer.'
          : 'Lo que propusiste desde campo y en qué quedó cada cosa.'}
      </p>

      {error && (
        <div role="alert" className="aviso-error aviso-cerrable"
          onClick={() => setError('')} title="Toca para cerrar este aviso">{error}</div>
      )}

      {/* El titular dice QUÉ HAY QUE HACER, no cuántos registros hay. */}
      {puedeDecidir && (
        <Titular
          tono={nPend === 0 ? 'bien' : nPend > 4 ? 'grave' : 'atender'}
          texto={nPend === 0
            ? 'No hay nada esperando tu decisión.'
            : `${plural(nPend, 'propuesta espera', 'propuestas esperan')} tu decisión.`}
          apoyo={nPend > 0 && pendientes[0]?.createdAt
            ? `La más antigua lleva esperando desde el ${new Date(pendientes[0].createdAt)
              .toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}.`
            : undefined}
        />
      )}

      {/* Dos pestañas sólo si de verdad hay dos cosas que mirar. A quien no
          decide no se le enseña una pestaña vacía de decisiones. */}
      {puedeDecidir && (
        <div className="tabs" style={{ marginTop: 14 }}>
          <button type="button"
            className={vista === 'pendientes' ? 'tab active' : 'tab'}
            onClick={() => setVista('pendientes')}>
            Esperan decisión{nPend > 0 && <span className="tab-cuenta">{nPend}</span>}
          </button>
          <button type="button"
            className={vista === 'mias' ? 'tab active' : 'tab'}
            onClick={() => setVista('mias')}>
            Las que propuse yo{nMiasPend > 0 && <span className="tab-cuenta">{nMiasPend}</span>}
          </button>
        </div>
      )}

      {lista.length === 0 && (
        /* Vacío que EXPLICA. «Esconder algo vacío es peor que enseñarlo
           vacío»: sin datos, «vacío» y «no existe» son indistinguibles. */
        <div className="card explica" style={{ marginTop: 16 }}>
          {vista === 'pendientes'
            ? <>Ninguna propuesta pendiente. Aparecen aquí solas cuando un técnico
                propone una mejora desde el procedimiento de un equipo.</>
            : <>Todavía no has propuesto ninguna mejora. Se hace desde el
                procedimiento de un equipo, al cerrar una orden o escaneando su QR.</>}
        </div>
      )}

      <div className="mejoras">
        {lista.map((m) => {
          const decidida = m.estado && m.estado !== 'PROPUESTA';
          return (
            <article key={m.id} className={'mejora' + (decidida ? ` mejora-${m.estado}` : '')}>

              {/* --- CONTEXTO: de dónde sale. Va ARRIBA porque sin esto,
                      decidir es firmar a ciegas. --- */}
              <header className="mejora-de">
                <Icono n="nota" size={14} />
                <span className="mejora-proc">{m.procedimiento?.titulo || 'Procedimiento'}</span>
                {m.workOrder?.code && <span className="mejora-om">desde {m.workOrder.code}</span>}
              </header>

              {/* --- LO QUE ESCRIBIÓ, ENTERO. Es lo único que importa aquí,
                      así que es lo más grande de la tarjeta. --- */}
              <p className="mejora-texto">{m.texto}</p>

              <div className="mejora-firma">
                {m.propuestaPor?.fullName && <>{m.propuestaPor.fullName} · </>}
                {new Date(m.createdAt).toLocaleDateString('es-PE',
                  { day: 'numeric', month: 'long', year: 'numeric' })}
                {/* El tiempo real que llevó frente al estimado: es el dato que
                    convierte una opinión en una medición. */}
                {m.minutosReales != null && (
                  <> · tardó <b>{m.minutosReales} min</b>
                    {m.procedimiento?.minutosEstimados != null
                      && <> (estimado {m.procedimiento.minutosEstimados})</>}
                  </>
                )}
              </div>

              {/* --- YA DECIDIDA: se enseña el resultado y el motivo --- */}
              {decidida && (
                <div className={'mejora-veredicto v-' + m.estado}>
                  <Icono n={m.estado === 'ACEPTADA' ? 'ok' : 'alerta'} size={14} />
                  <div>
                    <b>{m.estado === 'ACEPTADA' ? 'Aceptada' : 'No entró esta vez'}</b>
                    {m.decididaPor?.fullName && <> · {m.decididaPor.fullName}</>}
                    {m.motivoDecision && <div className="mejora-motivo">{m.motivoDecision}</div>}
                  </div>
                </div>
              )}

              {/* --- DECIDIR --- */}
              {!decidida && puedeDecidir && vista === 'pendientes' && (
                rechazando === m.id ? (
                  <div className="mejora-rechazo">
                    <label htmlFor={`motivo-${m.id}`}>
                      ¿Por qué no entra? — obligatorio
                    </label>
                    <textarea id={`motivo-${m.id}`} value={motivo} maxLength={400}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ya se cambió el conector en enero; con el nuevo el orden sí importa." />
                    <div className="mejora-acciones">
                      <button type="button" className="btn-mini btn-danger"
                        disabled={enviando === m.id || !motivo.trim()}
                        onClick={() => decidir(m.id, false)}>
                        {enviando === m.id ? 'Enviando…' : 'Rechazar y avisarle'}
                      </button>
                      <button type="button" className="btn-mini"
                        disabled={enviando === m.id}
                        onClick={() => { setRechazando(null); setMotivo(''); }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mejora-acciones">
                    <label className="mejora-paso">
                      <input type="checkbox" checked={comoPaso}
                        onChange={(e) => setComoPaso(e.target.checked)} />
                      Añadir como paso del procedimiento
                    </label>
                    <div className="mejora-botones">
                      <button type="button" className="btn-primary"
                        disabled={enviando === m.id}
                        onClick={() => decidir(m.id, true)}>
                        {enviando === m.id ? 'Guardando…' : 'Aceptar'}
                      </button>
                      <button type="button" className="btn-mini"
                        disabled={enviando === m.id}
                        onClick={() => { setRechazando(m.id); setMotivo(''); }}>
                        No entra
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* Lo mío, todavía sin respuesta. */}
              {!decidida && vista === 'mias' && (
                <div className="mejora-espera">
                  <Icono n="reloj" size={13} /> Esperando decisión
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
