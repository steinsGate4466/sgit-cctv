import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Icono from '../components/Iconos';
import { EsqueletoTablero } from '../components/Esqueleto';
import { ComoSeCalcula, Detalle, Titular, Tono } from '../components/Patron';
import {
  useVolverALaPantalla, useRefrescoDePulpito, useEdadDelDato,
} from '../useVolverALaPantalla';
import { plural } from '../formato';

/**
 * MAPA DE RED — bloque 48.
 *
 * =============================================================================
 *  QUÉ HACE ESTA PANTALLA QUE NO HAGA «ACTIVOS»
 * =============================================================================
 *  «Activos» es donde se REGISTRA, equipo por equipo, con su formulario largo.
 *  Ésta es donde se LEE la foto completa: qué hay dentro de cada caja, en qué
 *  red está y qué cámaras cuelgan de ahí.
 *
 *  Son dos intenciones distintas y por eso son dos pantallas. La de registro
 *  necesita ser exhaustiva; ésta necesita contestar de un vistazo. Juntarlas
 *  produce una pantalla que no sirve para ninguna de las dos cosas.
 *
 * =============================================================================
 *  LA PLANTA TIENE DOS REDES
 * =============================================================================
 *      CÁMARA ──red de cámaras──► switch de campo ──► GRABADOR ──red CCTV──► púlpito
 *              192.168.1.x        (en un tablero)        ▲        10.1.x.x
 *                                                        │
 *                                             aquí cambia de red
 *
 *  El grabador es la FRONTERA. Por eso su tarjeta enseña las dos direcciones y
 *  avisa cuando le falta una: sin las dos, no se puede saber si el púlpito
 *  llega a verlo.
 *
 * =============================================================================
 *  EL TABLERO SE MARCA EN ROJO, Y NO ES DECORACIÓN
 * =============================================================================
 *  Un gabinete se abre y se trabaja. Un tablero ELÉCTRICO lleva dentro el
 *  supresor de pico colgado directo de los 220 V, y abrirlo exige bloqueo.
 *  Quien va a subir tiene que saberlo ANTES de subir, no al llegar con la
 *  escalera puesta.
 */
export default function MapaDeRed() {
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [cargadoEn, setCargadoEn] = useState<number | null>(null);
  const edad = useEdadDelDato(cargadoEn);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/network/mapa-de-red');
      setD(r.data);
      setError('');
    } catch (e: any) {
      setError(e?.response?.status === 403
        ? 'Tu usuario no tiene permiso para ver esta pantalla.'
        : 'No se pudo consultar. Vuelve a intentarlo.');
    } finally {
      setCargando(false);
      setCargadoEn(Date.now());
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useVolverALaPantalla(cargar);
  useRefrescoDePulpito(cargar);

  if (cargando) return <div className="page"><EsqueletoTablero kpis={0} paneles={3} /></div>;

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">Mapa de red</h1>
        <div role="alert" className="aviso-error">{error}</div>
      </div>
    );
  }

  const grupos: any[] = d?.grupos || [];
  const hallazgos: any[] = d?.hallazgos || [];
  const redes: any[] = d?.redes || [];

  if (!grupos.length) {
    return (
      <div className="page">
        <h1 className="page-title">Mapa de red</h1>
        <div className="card vacio">
          <h3>Todavía no hay equipos de red registrados</h3>
          <p>
            {d?.motivoAmbito
              || 'Esta pantalla agrupa lo que ya está cargado en Activos. En cuanto '
              + 'haya switches y grabadores con su gabinete o tablero, aparecerán aquí.'}
          </p>
          <Link className="btn" to="/assets">Ir a Activos</Link>
        </div>
      </div>
    );
  }

  const errores = hallazgos.filter((h) => h.gravedad === 'ERROR').length;
  const tono: Tono = errores ? 'grave' : hallazgos.length ? 'atender' : 'bien';

  return (
    <div className="page">
      <h1 className="page-title">Mapa de red</h1>
      {edad !== null && edad >= 2 && (
        <p className="edad-dato">Datos de hace {plural(edad, 'minuto')}.</p>
      )}

      <Titular tono={tono} texto={d.titular} />

      {redes.length > 0 && (
        <div className="redes-tira">
          {redes.map((r) => (
            <span key={r.cidr} className={`red-chip red-${r.segmento}`}>
              <b>{r.cidr}</b> {r.nombre}
              {r.vlan != null && <span className="red-vlan">VLAN {r.vlan}</span>}
            </span>
          ))}
        </div>
      )}

      {hallazgos.length > 0 && (
        <Detalle
          titulo={
            <>
              <Icono n="alerta" size={15} /> Cosas que no cuadran
              <span className="grupo-marcas">
                <span className={`badge ${errores ? 'crit' : 'warn'}`}>
                  {plural(hallazgos.length, 'hallazgo')}
                </span>
              </span>
            </>
          }
          abiertoAlEntrar={errores > 0}
        >
          {hallazgos.map((h, i) => (
            <div key={`${h.clave}-${h.equipoId ?? i}`} className="hallazgo">
              <span className={`badge ${h.gravedad === 'ERROR' ? 'crit' : 'warn'}`}>
                {h.gravedad === 'ERROR' ? 'error' : 'revisar'}
              </span>
              <div className="hallazgo-texto">
                <b className="dato-fijo">{h.equipo}</b> {h.que}
                <span className="hallazgo-que-hacer">{h.queHacer}</span>
              </div>
            </div>
          ))}
        </Detalle>
      )}

      {grupos.map((g) => <Caja key={g.id} g={g} />)}

      <ComoSeCalcula>
        <p>
          Cada pestaña es una caja física: un <b>gabinete</b> de comunicaciones o
          un <b>tablero eléctrico</b>. Los tableros van marcados porque abrirlos
          exige bloqueo eléctrico: dentro llevan el supresor de pico conectado
          directo a los 220 V.
        </p>
        <p>
          La red de cada equipo no se escribe a mano: se deduce comparando su
          dirección contra las subredes registradas en Direccionamiento IP. Si un
          equipo aparece «fuera del plan», o su dirección está mal o falta
          registrar esa subred.
        </p>
        <p>
          El grabador es la frontera entre la red de cámaras y la red CCTV. Si le
          falta una de sus dos direcciones, el sistema lo dice en vez de suponer
          que el púlpito llega a verlo.
        </p>
      </ComoSeCalcula>
    </div>
  );
}

const ICONO_TIPO: Record<string, string> = {
  SWITCH: 'puertos', NVR: 'grabador', CAMERA: 'camara', WIRELESS: 'mapeo',
  ROUTER: 'puertos', FIREWALL: 'candado', SERVER: 'pc', PSU: 'electricidad',
};

function Caja({ g }: { g: any }) {
  const esTablero = g.clase === 'TABLERO';

  const titulo = (
    <>
      <Icono n={esTablero ? 'electricidad' : g.clase === 'CAMPO' ? 'ubicacion' : 'gabinete'} size={15} />
      {' '}<span className="dato-fijo">{g.codigo}</span>
      <span className="caja-nombre">{g.nombre}</span>
      <span className="grupo-marcas">
        {/* El bloqueo se avisa en la cabecera, no dentro: la decisión de subir
            se toma leyendo la lista, no abriendo cada pestaña. */}
        {esTablero && <span className="badge crit">tablero · exige bloqueo</span>}
        {g.conProblema && <span className="badge crit">algo está fallando</span>}
        <span className="badge OPERATIVO">{plural(g.totalEquipos, 'equipo')}</span>
        {g.totalCamaras > 0 && (
          <span className="badge sindatos">{plural(g.totalCamaras, 'cámara')}</span>
        )}
      </span>
    </>
  );

  return (
    <Detalle titulo={titulo} abiertoAlEntrar={g.conProblema}>
      {esTablero && (
        <p role="status" className="caja-aviso">
          Es un tablero eléctrico. Lleva un supresor de pico conectado directo a
          220 V: no se abre sin bloqueo y etiquetado.
        </p>
      )}

      {g.equipos.map((e: any) => (
        <div key={e.id} className={`nodo ${e.estado !== 'OPERATIVO' ? 'nodo-mal' : ''}`}>
          <div className="nodo-cabeza">
            <Icono n={(ICONO_TIPO[e.tipo] || 'activos') as any} size={14} />
            <Link className="nodo-codigo dato-fijo" to={`/a/${e.id}`}>{e.codigo}</Link>
            {e.marca && <span className="nodo-marca">{e.marca}</span>}
            <span className={`badge ${e.estado}`}>{e.estado.replace('_', ' ').toLowerCase()}</span>
          </div>

          <div className="nodo-red">
            {e.ip
              ? <span className="dato-fijo nodo-ip">{e.ip}</span>
              : <span className="nodo-sinip">sin dirección declarada</span>}
            <span className={`red-chip red-${e.segmento}`}>{e.segmentoNombre}</span>
            {e.puertosPoe != null && (
              <span className={`nodo-poe ${e.poeAlLimite ? 'poe-lleno' : ''}`}>
                PoE {e.ocupadosPoe}/{e.puertosPoe}
                {e.poeAlLimite && ' · casi lleno'}
              </span>
            )}
          </div>

          {/* La frontera: las dos patas del grabador, o lo que le falta. */}
          {e.frontera && (
            e.frontera.completo ? (
              <p className="nodo-frontera">
                Hace de puente: <b className="dato-fijo">{e.frontera.ladoCamaras}</b> hacia
                las cámaras y <b className="dato-fijo">{e.frontera.ladoCCTV}</b> hacia el
                púlpito.
              </p>
            ) : (
              <p role="alert" className="nodo-frontera nodo-frontera-mal">
                {e.frontera.motivo}
              </p>
            )
          )}

          {e.camaras?.length > 0 && (
            <div className="nodo-hijos">
              {e.camaras.map((c: any) => (
                <Link key={c.id} className="nodo-hijo" to={`/a/${c.id}`}>
                  <span className={`punto ${c.estado === 'OPERATIVO' ? 'ok' : 'mal'}`} />
                  <b className="dato-fijo">{c.codigo}</b>
                  <span className="nodo-hijo-puerto">puerto {c.puerto}{c.poe ? ' · PoE' : ''}</span>
                  {c.lugar && <span className="nodo-hijo-lugar">{c.lugar}</span>}
                </Link>
              ))}
            </div>
          )}

          {e.otros?.length > 0 && (
            <p className="nodo-otros">
              También cuelgan: {e.otros.map((o: any) => o.codigo).join(', ')}.
            </p>
          )}
        </div>
      ))}
    </Detalle>
  );
}
