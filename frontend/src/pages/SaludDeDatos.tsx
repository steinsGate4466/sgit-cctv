import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Icono from '../components/Iconos';
import { EsqueletoTablero } from '../components/Esqueleto';
import { ComoSeCalcula, Titular, Tono } from '../components/Patron';
import { useVolverALaPantalla } from '../useVolverALaPantalla';
import { plural } from '../formato';

/**
 * SALUD DE LOS DATOS — bloque 50.
 *
 * =============================================================================
 *  PARA QUÉ SIRVE ESTA PANTALLA
 * =============================================================================
 *  Los sistemas de mantenimiento no fracasan por el código: fracasan porque el
 *  inventario se carga a medias, nadie lo nota, y meses después el sistema ya
 *  perdió la confianza de quien tenía que usarlo.
 *
 *  Esta pantalla convierte «el sistema está mal» en una lista con nombre y
 *  apellido: qué falta, cuántos activos, un ejemplo, y QUIÉN lo carga. Sin ese
 *  último dato la lista la lee todo el mundo y no la coge nadie.
 *
 * =============================================================================
 *  LA NOTA NO SE MAQUILLA
 * =============================================================================
 *  La exactitud —que la IP registrada sea la real— no se puede medir desde el
 *  sistema, así que sale «sin medir» en vez de con un número. Incluirla como
 *  cien subiría la nota y sería mentira; como cero, castigaría a la planta por
 *  una pieza que todavía no existe. Se prefiere un 62 % honesto a un 90 %
 *  inventado.
 */
export default function SaludDeDatos() {
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const r = await api.get('/dashboard/infra/salud-de-datos');
      setD(r.data);
      setError('');
    } catch (e: any) {
      setError(e?.response?.status === 403
        ? 'Esta pantalla es para quien puede editar activos: es una lista de carga.'
        : 'No se pudo consultar. Vuelve a intentarlo.');
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useVolverALaPantalla(cargar);

  if (cargando) return <div className="page"><EsqueletoTablero kpis={3} paneles={2} /></div>;

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">Salud de los datos</h1>
        <div role="alert" className="aviso-error">{error}</div>
      </div>
    );
  }

  if (!d?.total) {
    return (
      <div className="page">
        <h1 className="page-title">Salud de los datos</h1>
        <div className="card vacio">
          <h3>Todavía no hay activos cargados</h3>
          <p>En cuanto haya equipos en el inventario, aquí saldrá qué les falta.</p>
          <Link className="btn" to="/assets">Ir a Activos</Link>
        </div>
      </div>
    );
  }

  const p: number = d.puntos ?? 0;
  const tono: Tono = p >= 85 ? 'bien' : p >= 60 ? 'atender' : 'grave';
  const huecos: any[] = d.huecos || [];

  return (
    <div className="page">
      <h1 className="page-title">Salud de los datos</h1>

      <Titular tono={tono} texto={d.titular} />

      {/* La nota grande. Un solo número protagonista: si hubiera seis
          igual de grandes, no habría ninguno. */}
      <div className={`nota-datos nota-${tono}`}>
        <b>{p}</b>
        <span>de 100</span>
        <em>sobre {plural(d.total, 'activo cargado', 'activos cargados')}</em>
      </div>

      <h2 className="sub-titulo">Por dimensión</h2>
      <div className="dims">
        {d.dimensiones.map((x: any) => (
          <div key={x.dimension} className={`dim ${x.puntos === null ? 'dim-sinmedir' : ''}`}>
            <div className="dim-cabeza">
              <span className="dim-nombre">{x.nombre}</span>
              {x.puntos === null
                ? <span className="dim-valor gris">sin medir</span>
                : <span className={`dim-valor ${x.puntos >= 85 ? 'ok' : x.puntos >= 60 ? 'medio' : 'mal'}`}>
                    {x.puntos} %
                  </span>}
            </div>
            {/* La barra lleva role="img" con su texto: una barra sin etiqueta
                no dice nada a quien no la ve. */}
            <div
              className="dim-barra"
              role="img"
              aria-label={x.puntos === null ? `${x.nombre}: sin medir` : `${x.nombre}: ${x.puntos} por ciento`}
            >
              <span
                className={x.puntos === null ? 'gris' : x.puntos >= 85 ? 'ok' : x.puntos >= 60 ? 'medio' : 'mal'}
                style={{ width: `${x.puntos ?? 100}%` }}
              />
            </div>
            <p className="dim-que">{x.porQueNo || x.queMide}</p>
          </div>
        ))}
      </div>

      <h2 className="sub-titulo">Lo que falta, por orden de cuánto afecta</h2>
      {huecos.length === 0 ? (
        <div className="card vacio">
          <h3>No falta nada</h3>
          <p>Todas las fichas tienen lo que hace falta para trabajar.</p>
        </div>
      ) : (
        <div className="huecos">
          {huecos.map((h: any, i: number) => (
            <div key={`${h.dimension}-${i}`} className="hueco-fila">
              <span className="hueco-n">{h.cuantos}</span>
              <div className="hueco-txt">
                <b>{h.falta}</b>
                <span className="hueco-ej">
                  Por ejemplo: {h.ejemplos.join(', ')}
                  {h.cuantos > h.ejemplos.length && `, y ${h.cuantos - h.ejemplos.length} más`}
                </span>
              </div>
              {/* Quién lo carga. Sin esto la lista la lee todo el mundo y no
                  la coge nadie. */}
              <span className="hueco-quien">
                <Icono n="usuarios" size={13} /> {h.quien}
              </span>
            </div>
          ))}
        </div>
      )}

      <ComoSeCalcula>
        <p>
          Se miden seis dimensiones estándar de calidad de datos. La{' '}
          <b>exactitud</b> no se puede medir desde aquí: que la dirección
          registrada sea la real lo confirmará el agente de monitoreo. Sale «sin medir».
        </p>
        <p>
          No se penaliza un campo que ese tipo de equipo no lleva: un switch no
          necesita grabador.
        </p>
        <p>
          La <b>vigencia</b> mide cuándo se editó la ficha, no cuándo se
          verificó el equipo en campo. Son cosas distintas y conviene no
          confundirlas.
        </p>
      </ComoSeCalcula>
    </div>
  );
}
