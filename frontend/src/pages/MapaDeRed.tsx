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
        <h1 className="page-title">Mapa de red por gabinete y tablero</h1>
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
        <h1 className="page-title">Mapa de red por gabinete y tablero</h1>
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
      <h1 className="page-title">Mapa de red por gabinete y tablero</h1>
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
          {/* AUDITORÍA 20/10: 25 líneas iguales («no tiene IP») tapaban los
              3 errores de verdad, y los códigos no llevaban a ninguna parte.
              Lo repetido se junta en UNA línea con sus equipos; cada código
              abre la ficha del equipo, que es donde se corrige. */}
          {agrupar(hallazgos).map((g) => (
            <div key={g.clave} className="hallazgo">
              <span className={`badge ${g.gravedad === 'ERROR' ? 'crit' : 'warn'}`}>
                {g.gravedad === 'ERROR' ? 'error' : 'revisar'}
              </span>
              <div className="hallazgo-texto">
                {new Set(g.items.map((h: any) => h.que)).size > 1
                  /* Cada uno dice algo distinto (su IP): una línea por equipo. */
                  ? g.items.map((h: any, i: number) => (
                      <div key={`${h.equipoId ?? i}`}><Equipo h={h} /> {h.que}</div>
                    ))
                  : g.items.length === 1
                    ? <><Equipo h={g.items[0]} /> {g.items[0].que}</>
                    : <>
                        <b>{plural(g.items.length, 'equipo')}.</b> {g.items[0].que}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0' }}>
                          {g.items.map((h: any, i: number) => <Equipo key={`${h.equipoId ?? i}`} h={h} />)}
                        </div>
                      </>}
                <span className="hallazgo-que-hacer">{g.items[0].queHacer}</span>
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
          «Fuera del plan»: dirección errónea o subred sin registrar.
        </p>
        <p>
          El grabador une la red de cámaras con la red CCTV. Sin sus dos direcciones, se avisa.
        </p>
      </ComoSeCalcula>
    </div>
  );
}

/** Los hallazgos del mismo tipo, juntos; los errores primero. */
function agrupar(hs: any[]): { clave: string; gravedad: string; items: any[] }[] {
  const m = new Map<string, { clave: string; gravedad: string; items: any[] }>();
  for (const h of hs) {
    const k = `${h.gravedad}|${h.clave}`;
    if (!m.has(k)) m.set(k, { clave: k, gravedad: h.gravedad, items: [] });
    m.get(k)!.items.push(h);
  }
  return [...m.values()].sort((a, b) => Number(b.gravedad === 'ERROR') - Number(a.gravedad === 'ERROR'));
}

/** El código del equipo, que lleva a su ficha. */
function Equipo({ h }: { h: any }) {
  return h.equipoId
    ? <Link className="dato-fijo" to={`/assets?activo=${encodeURIComponent(h.equipoId)}`}><b>{h.equipo}</b></Link>
    : <b className="dato-fijo">{h.equipo}</b>;
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
          Tablero eléctrico (220 V): no se abre sin bloqueo y etiquetado.
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
              /* Es un hallazgo fijo del dato, no un error que acaba de pasar:
                 `role="alert"` lo hacía leer en voz alta al entrar. */
              <p className="nodo-frontera nodo-frontera-mal">
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
