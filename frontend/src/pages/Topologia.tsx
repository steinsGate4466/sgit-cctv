import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import Icono from '../components/Iconos';
import FiltroAmbito, { Ambito, AMBITO_VACIO, conAmbito } from '../components/FiltroAmbito';
import { EsqueletoTabla } from '../components/Esqueleto';
import MapaRed from '../components/MapaRed';
import { plural } from '../formato';

/**
 * PUNTOS CRÍTICOS DE LA RED (bloque 7).
 *
 * LA PREGUNTA QUE CONTESTA
 * Hasta hoy, cuando caía un switch la frase que llegaba a Producción era
 * "el switch del púlpito está caído". Eso no le dice nada a nadie. Lo que
 * necesitan oír es: "el Tren 2 se quedó sin ver la zona de enfriamiento,
 * 8 cámaras".
 *
 * PARA QUÉ SIRVE DE VERDAD
 *   - Decidir DÓNDE poner el repuesto en caliente: no en el equipo más caro,
 *     sino en el que se lleva más cámaras por delante.
 *   - Priorizar la parada: qué revisar primero cuando hay dos horas.
 *   - Explicar un apagón sin tener que reconstruirlo de memoria.
 *
 * La lista está ordenada por daño, no por nombre ni por tren. Lo primero que
 * se ve es lo que más duele.
 */
export default function Topologia() {
  const [datos, setDatos] = useState<any>(null);
  // Se usa el tipo Ambito del propio componente, no uno inventado aquí.
  // La primera versión declaraba `{ tren?: string }` y el typecheck lo
  // rechazó con razón: si cada pantalla define su propia forma del filtro,
  // en tres meses hay seis filtros que significan cosas distintas.
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_VACIO);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');
  const [detalle, setDetalle] = useState<any>(null);
  const [mapa, setMapa] = useState<any>(null);
  // El mapa se pinta plegado: es lo más pesado de la pantalla y no todo el
  // mundo entra aquí a mirarlo. Quien lo quiere, lo abre.
  const [verMapa, setVerMapa] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [criticos, dibujo] = await Promise.all([
        api.get('/network/criticos', { params: conAmbito({}, ambito) }).then((r) => r.data),
        api.get('/network/mapa', { params: conAmbito({}, ambito) }).then((r) => r.data),
      ]);
      setDatos(criticos);
      setMapa(dibujo);
      setFallo('');
    } catch (e: any) {
      // "No hay datos" y "no pude preguntar" son cosas distintas. Confundirlas
      // en una pantalla de riesgo es la peor forma de tranquilizar a alguien.
      setFallo(e?.response?.status === 403
        ? 'Tu usuario no tiene permiso para ver la red.'
        : 'No se pudo calcular el impacto. Vuelve a intentarlo.');
    }
  }, [ambito]);

  useEffect(() => { setCargando(true); cargar().finally(() => setCargando(false)); }, [cargar]);

  async function verImpacto(e: any) {
    setDetalle({ cargando: true, equipo: e });
    try {
      const { data } = await api.get(`/network/impacto/${e.id}`);
      setDetalle({ ...data, cargando: false });
    } catch {
      setDetalle({ cargando: false, error: 'No se pudo calcular el impacto de este equipo.' });
    }
  }

  if (cargando) return <EsqueletoTabla filas={8} />;

  return (
    <div>
      <h1 className="page-title">Puntos críticos de la red</h1>
      <p className="page-sub">
        Qué se deja de ver si cae cada equipo. Ordenado por daño, no por nombre.
      </p>

      <FiltroAmbito valor={ambito} onChange={setAmbito} />

      {/* ------------------------------------------------------ EL MAPA ----
          El ranking dice QUÉ PASA SI CAE algo. El mapa contesta la pregunta
          anterior: CÓMO ESTÁ MONTADO. Con una tabla, entender que ocho
          cámaras cuelgan del mismo switch exige leer ocho filas y
          recordarlas; aquí se ve de un golpe. */}
      {/* EL BLOQUE SE PINTA SIEMPRE, aunque no haya nada que dibujar.
          La primera versión lo escondía cuando no había nodos, y eso fue un
          error: sin red cargada no aparecía NADA, y eso es indistinguible de
          "la función no existe". Una pantalla que no explica por qué está
          vacía manda a la gente a preguntar. */}
      <>
          <div className="section-title">
            Mapa de la red
            {(mapa?.nodos?.length ?? 0) > 0 && (
              <button className="btn-mini" style={{ marginLeft: 'auto' }}
                      onClick={() => setVerMapa((v) => !v)}>
                {verMapa ? 'Ocultar' : `Ver mapa (${mapa.nodos.length} equipos)`}
              </button>
            )}
          </div>

          {(mapa?.nodos?.length ?? 0) === 0 && (
            <div className="card vacio">
              <Icono n="predictivo" size={38} />
              <h3>Todavía no hay red que dibujar</h3>
              <p>
                El mapa se arma con lo que esté registrado. Ahora mismo falta
                todo esto, y por eso no hay nada que enseñar:
              </p>
              <div style={{ textAlign: 'left', maxWidth: 460, margin: '14px auto 0' }}>
                <div className="frow">
                  <span className="k">Puertos de switch ocupados</span>
                  <span className="v">en Activos, ficha del switch</span>
                </div>
                <div className="frow">
                  <span className="k">Enlaces de fibra y radio</span>
                  <span className="v">marcando cuáles son del anillo</span>
                </div>
                <div className="frow">
                  <span className="k">NVR de cada cámara</span>
                  <span className="v">en la ficha de la cámara</span>
                </div>
              </div>
              <p style={{ marginTop: 14 }}>
                En cuanto haya un switch con equipos enchufados, el mapa
                aparece solo. <b>No hace falta configurar nada más.</b>
              </p>
            </div>
          )}
          {verMapa && (
            <div className="card" style={{ padding: 12 }}>
              <MapaRed datos={mapa} onNodo={(n) => verImpacto(n)} />
              <div className="mapa-leyenda">
                <span><i style={{ background: '#16a34a' }} /> Operativo</span>
                <span><i style={{ background: '#ea580c' }} /> Con incidencia</span>
                <span><i style={{ background: '#dc2626' }} /> Fuera de servicio o sin camino al grabador</span>
                <span><i className="anillo" /> Tramo de anillo</span>
                <span className="muted">
                  Las columnas son saltos hasta el grabador. Pulsa un equipo para ver qué se
                  pierde si cae.
                </span>
              </div>
            </div>
          )}
      </>

      {fallo && <div className="error">{fallo}</div>}

      {!fallo && (datos?.equipos?.length ?? 0) === 0 ? (
        <div className="card vacio">
          <h3>Todavía no hay red que analizar</h3>
          <p>
            Se calcula con puertos, enlaces y grabador de cada cámara.
          </p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Equipo</th><th>Tipo</th><th>Dónde</th><th>Tren</th>
                <th>Si cae, se dejan de ver</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(datos?.equipos || []).map((e: any) => (
                <tr key={e.id}>
                  <td>{e.code}</td>
                  <td>{e.tipo}</td>
                  <td className="muted">{e.lugar || '—'}</td>
                  <td>{e.tren || <span className="muted">sin ubicar</span>}</td>
                  <td>
                    {e.salvadoPorAnillo ? (
                      // Merece destacarse: es la prueba de que el anillo
                      // sirve para algo. Un análisis que grita cuando no pasa
                      // nada deja de mirarse a la tercera falsa alarma.
                      <span className="badge OPERATIVO">protegido por el anillo</span>
                    ) : (
                      <b style={{ color: e.camarasAfectadas > 5 ? 'var(--crit)' : 'var(--text)' }}>
                        {plural(e.camarasAfectadas, 'cámara')}
                      </b>
                    )}
                  </td>
                  <td>
                    {e.visible ? (
                      <button className="btn-mini" onClick={() => verImpacto(e)}>
                        <Icono n="mapeo" size={14} /> Ver cuáles
                      </button>
                    ) : (
                      // No se esconde: saber que existe un punto crítico que
                      // no es tuyo es justo lo que hace falta para entender
                      // por qué te quedaste sin ver.
                      <span className="muted" style={{ fontSize: 12 }}>fuera de tu tren</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="hint-link">
        <Icono n="alerta" size={14} />
        <span>
          Esto no adivina nada: se calcula con los puertos de switch ocupados,
          los enlaces declarados y el NVR de cada cámara. <b>Cuanto mejor esté
          el cableado registrado, más fiable es este número.</b>
        </span>
      </div>

      {detalle && (
        <Modal title={`Impacto de ${detalle.equipo?.code || detalle.equipo?.code || 'el equipo'}`}
               onClose={() => setDetalle(null)}>
          {detalle.cargando && <div className="loading">Calculando…</div>}
          {detalle.error && <div className="error">{detalle.error}</div>}
          {!detalle.cargando && !detalle.error && (
            <>
              <div className={detalle.camarasAfectadas > 0 ? 'error' : 'sign-note'}>
                {detalle.resumen}
              </div>

              {detalle.detalle?.length > 0 && (
                <div className="detail-sec">
                  <h4>Se quedan sin llegar al grabador</h4>
                  {detalle.detalle.map((d: any) => (
                    <div className="frow" key={d.id}>
                      <span className="k">{d.code} · {d.tipo}</span>
                      <span className="v">{d.lugar || '—'}</span>
                    </div>
                  ))}
                </div>
              )}

              {detalle.yaAislados?.length > 0 && (
                <div className="detail-sec">
                  <h4>Ya estaban sin llegar antes</h4>
                  <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>
                    No se le imputan a este equipo: llevan tiempo sin camino al
                    grabador. Pero convendría mirarlos.
                  </p>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {plural(detalle.yaAislados.length, 'equipo')}.
                  </div>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
