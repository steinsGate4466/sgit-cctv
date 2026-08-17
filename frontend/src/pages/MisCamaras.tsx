import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { EsqueletoTablero } from '../components/Esqueleto';
import CamaraCaida from '../components/CamaraCaida';
import { Cifras, ComoSeCalcula, Titular, Tono } from '../components/Patron';
import {
  useVolverALaPantalla, useRefrescoDePulpito, useEdadDelDato,
} from '../useVolverALaPantalla';
import { plural } from '../formato';

/**
 * MIS CÁMARAS — el panel del jefe de tren. Bloque 39.
 *
 * =============================================================================
 *  LA PANTALLA QUE PIDIÓ PRODUCCIÓN
 * =============================================================================
 *  «Cuando falle una cámara quiero ver cuál es, que la estamos atacando, a qué
 *   hora se fue, cómo va la orden y qué falta.»
 *
 *  Eso es lo que hay aquí y nada más. No es un tablero de indicadores: es una
 *  tarjeta por cámara caída, con todo lo que hace falta para no tener que
 *  llamar a nadie por radio.
 *
 *  Y cuando no hay ninguna caída, la pantalla lo dice en verde y se acaba. Una
 *  pantalla vacía parece rota; «las 47 cámaras del Tren 2 están dando imagen»
 *  cierra la consulta en dos segundos.
 *
 * =============================================================================
 *  MIRAN. NO TOCAN.
 * =============================================================================
 *  Ni un botón que cambie nada. Producción observa, Mantenimiento ejecuta, y
 *  esa frontera es la que permite que las dos áreas compartan pantalla sin
 *  pisarse. El backend lo respalda: el endpoint sólo acepta GET y exige
 *  `om.mirar`, que es una llave de sólo lectura.
 */
export default function MisCamaras() {
  const [trenes, setTrenes] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [d, setD] = useState<any>(null);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  // Bloque 42: la edad del dato. Esta pantalla vive abierta en el púlpito.
  const [cargadoEn, setCargadoEn] = useState<number | null>(null);
  const edad = useEdadDelDato(cargadoEn);

  useEffect(() => {
    api.get('/dashboard/infra/trenes')
      .then((r) => {
        const t = r.data?.trenes || [];
        setTrenes(t);
        if (t.length) setCode(t[0].code);
      })
      .catch(() => setTrenes([]))
      .finally(() => setCargandoLista(false));
  }, []);

  const cargar = useCallback(async () => {
    if (!code) return;
    setCargando(true); setError('');
    try {
      const r = await api.get(`/dashboard/tren/${encodeURIComponent(code)}/camaras`);
      setD(r.data);
      setCargadoEn(Date.now());
    } catch (e: any) {
      setError(e?.response?.status === 403
        ? 'Tu usuario no tiene permiso para ver el trabajo sobre las cámaras.'
        : 'No se pudo consultar. Vuelve a intentarlo.');
      setD(null);
    } finally { setCargando(false); }
  }, [code]);

  useEffect(() => { cargar(); }, [cargar]);

  /* Bloque 37: al volver del bolsillo se recarga. Con un técnico registrando
     avance en campo, esta pantalla se queda vieja en minutos. */
  useVolverALaPantalla(cargar);
  /* Bloque 42. El PC del púlpito no cambia de pestaña en ocho horas, así que
     `visibilitychange` no salta nunca y el jefe de tren estaría mirando la
     madrugada. Sólo se activa en pantalla ancha: el móvil del técnico no. */
  useRefrescoDePulpito(cargar);

  if (cargandoLista) return <div className="page"><EsqueletoTablero /></div>;

  if (!trenes.length) {
    return (
      <div className="page">
        <h1 className="page-title">Mis cámaras</h1>
        <div className="card vacio">
          <h3>Todavía no hay trenes en el árbol de planta</h3>
          <p>En cuanto se creen, aquí aparece el estado de sus cámaras.</p>
        </div>
      </div>
    );
  }

  const hay = (d?.camaras?.length ?? 0) > 0;
  const vitales = d?.camaras?.filter((c: any) => c.zonaVital).length ?? 0;
  const sinAtender = d?.camaras?.filter((c: any) => !c.orden).length ?? 0;
  const tono: Tono = !hay ? 'bien' : vitales || sinAtender ? 'grave' : 'atender';

  /* El tren, escrito en el título. Un ámbito mal asignado se ve en un segundo
     en vez de descubrirse en una reunión. */
  const suTren = trenes.find((t) => t.code === code);

  return (
    <div className="page">
      <h1 className="page-title">
        Mis cámaras{suTren ? ` · ${suTren.nombre}` : ''}
      </h1>
      {edad !== null && edad >= 2 && (
        <p className="edad-dato">Datos de hace {plural(edad, 'minuto')}.</p>
      )}

      {/* El tren, si hay más de uno en el ámbito. Con uno solo no se pregunta:
          sería un desplegable de una opción. */}
      {trenes.length > 1 && (
        <div className="train-tabs">
          {trenes.map((t) => (
            <button key={t.code}
              className={'train-tab' + (code === t.code ? ' active' : '')}
              onClick={() => setCode(t.code)}>
              {t.nombre}
            </button>
          ))}
        </div>
      )}

      {error && <div className="card peligro">{error}</div>}

      {cargando ? <EsqueletoTablero /> : d && (
        <>
          <Titular tono={tono} texto={d.titular} />

          {hay && (
            <Cifras
              datos={[
                { n: d.camaras.length, et: 'sin imagen' },
                { n: vitales, et: 'en zona vital' },
                { n: d.camaras.length - sinAtender, de: d.camaras.length, et: 'con técnico' },
              ]}
            />
          )}

          {/* EL AVISO DEL AGENTE. No es una queja: es una petición concreta a
              TI, con el motivo delante. Sólo sale cuando de verdad falta. */}
          {d.avisoSinAgente && hay && (
            <p className="nada-que-hacer">
              <b>La hora de caída no se conoce.</b> {d.avisoSinAgente}
            </p>
          )}

          {d.camaras.map((c: any) => <CamaraCaida key={c.id} c={c} />)}
        </>
      )}

      <ComoSeCalcula>
        <p>
          Sale una tarjeta por cada cámara de tu tren que no esté dando imagen:
          fuera de servicio, en mantenimiento o con una incidencia abierta.
        </p>
        <p>
          <b>«Se fue» y «lo reportaron» son datos distintos.</b> La hora de
          caída sólo se sabe con el agente de monitoreo instalado, y hace falta
          que la cámara falle tres veces seguidas antes de darla por caída — una
          pérdida suelta en una wifi industrial es lo normal, no una avería.
          Sin agente, lo único que hay es cuándo alguien avisó.
        </p>
        <p>
          <b>El material que falta</b> se calcula contra el stock del almacén.
          Si el técnico escribió el material a mano, sin código, no se dice que
          falte: se dice que no se puede saber.
        </p>
        <p>
          <b>Aquí no se toca nada.</b> Es una pantalla de sólo lectura: el
          trabajo de campo lo ejecuta Mantenimiento.
        </p>
      </ComoSeCalcula>
    </div>
  );
}
