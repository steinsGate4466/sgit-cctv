import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { EsqueletoTablero } from '../components/Esqueleto';
import { Cifras, ComoSeCalcula, Titular, Tono } from '../components/Patron';
import { useVolverALaPantalla, useRefrescoDePulpito } from '../useVolverALaPantalla';
import { NOMBRE_DE_TIPO } from '../tipos-de-equipo';
import { fecha } from '../fechas';

/**
 * CAPACIDAD DE RED — bloque 122.
 *
 * =============================================================================
 *  LA PREGUNTA QUE CONTESTA
 * =============================================================================
 *  «Quieren cuatro cámaras nuevas en el lecho de enfriamiento. ¿Hay puertos?
 *   ¿Hay PoE? ¿O hay que comprar un switch antes?»
 *
 *  Hasta hoy eso se contestaba yendo al gabinete con una linterna. El dato
 *  estaba en la base —cada puerto sabe si está ocupado y si da PoE— y **nadie
 *  lo preguntaba**.
 *
 * =============================================================================
 *  Y LA DE LOS PROYECTOS
 * =============================================================================
 *  «¿Cómo proponemos cámaras con inteligencia artificial si no sabemos qué
 *   modelo tenemos en planta?»
 *
 *  La segunda pestaña cuenta el parque por marca y modelo. Sin esa tabla no se
 *  puede proponer una renovación ni justificar una reinversión.
 *
 * =============================================================================
 *  SIN DECLARAR NO ES LO MISMO QUE LLENO
 * =============================================================================
 *  Un switch sin puertos declarados NO sale como «0 libres». Sale aparte, y la
 *  pantalla lo dice: **cero libres significa «compra un switch»; sin declarar
 *  significa «ve y mídelo»**. Confundirlos hace comprar lo que no hace falta.
 */
export default function Capacidad() {
  const [d, setD] = useState<any>(null);
  const [parque, setParque] = useState<any>(null);
  const [ver, setVer] = useState<'puertos' | 'parque'>('puertos');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [a, b] = await Promise.all([
        api.get('/conexiones/capacidad'),
        api.get('/conexiones/parque'),
      ]);
      setD(a.data); setParque(b.data);
    } catch (e: any) {
      if (!e?.response) setError('Sin conexión con el servidor. Vuelve a intentarlo.');
      else if (e.response.status === 403) setError('Tu usuario no tiene permiso para ver la capacidad de red.');
      else setError('No se pudo consultar. Vuelve a intentarlo.');
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useVolverALaPantalla(cargar);
  useRefrescoDePulpito(cargar);

  const r = d?.resumen;

  /* EL TITULAR. El orden de las comprobaciones es la decisión: primero lo que
     IMPIDE contestar la pregunta —el inventario incompleto—, y sólo después el
     número de puertos. Un «hay 40 libres» calculado sobre la mitad de los
     switches es peor que no dar número. */
  function titular(): { tono: Tono; texto: string; apoyo?: string } {
    if (!r) return { tono: 'sindatos', texto: 'Consultando la capacidad…' };
    if (!d.switches) {
      return { tono: 'sindatos', texto: 'No hay switches registrados todavía.' };
    }
    if (r.sinDeclarar) {
      return {
        tono: 'atender',
        texto: `${r.sinDeclarar} de ${d.switches} switches sin puertos declarados`,
        apoyo: 'Mientras falte ese dato, la cuenta de puertos libres se queda corta '
          + 'y no sirve para decidir una instalación.',
      };
    }
    if (!r.libres) {
      return {
        tono: 'grave',
        texto: 'No queda ni un puerto libre',
        apoyo: 'Cualquier instalación nueva necesita un switch antes.',
      };
    }
    return {
      tono: r.libresPoe ? 'bien' : 'atender',
      texto: `${r.libres} puertos libres, ${r.libresPoe} con PoE`,
      apoyo: r.libresPoe
        ? 'Hay sitio para instalar sin comprar equipo.'
        : 'Quedan puertos, pero ninguno da PoE: una cámara necesitaría inyector.',
    };
  }
  const tit = titular();

  if (cargando && !d) return <div className="page"><EsqueletoTablero /></div>;

  return (
    <div className="page">
      <h1 className="page-title">Capacidad de red</h1>

      {error && <div className="card peligro">{error}</div>}

      {d && (
        <>
          <Titular tono={tit.tono} texto={tit.texto} apoyo={tit.apoyo} />

          <Cifras
            datos={[
              { n: r?.libres ?? 0, et: 'puertos libres' },
              { n: r?.libresPoe ?? 0, et: 'de ellos con PoE' },
              { n: r?.ocupados ?? 0, de: r?.puertosMapeados ?? 0, et: 'ocupados' },
              { n: parque?.modelosDistintos ?? 0, et: 'modelos en planta' },
            ]}
          />

          <div className="train-tabs" role="tablist">
            <button type="button" role="tab"
              className={'train-tab' + (ver === 'puertos' ? ' active' : '')}
              onClick={() => setVer('puertos')}>Puertos por switch</button>
            <button type="button" role="tab"
              className={'train-tab' + (ver === 'parque' ? ' active' : '')}
              onClick={() => setVer('parque')}>Parque instalado</button>
          </div>

          {ver === 'puertos' && (
            !d.filas.length ? (
              <div className="card vacio">
                <h3>No hay switches registrados</h3>
                <p>En cuanto se den de alta, aquí aparece su capacidad.</p>
              </div>
            ) : (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Switch</th><th>Dónde</th><th>Libres</th>
                    <th>Con PoE</th><th>Ocupados</th><th>Sin mapear</th>
                  </tr>
                </thead>
                <tbody>
                  {d.filas.map((f: any) => (
                    <tr key={f.id}>
                      <td>
                        <b>{f.assetCode}</b>
                        <div className="muted">
                          {[f.marca, f.modelo].filter(Boolean).join(' ') || 'sin modelo declarado'}
                        </div>
                      </td>
                      <td>
                        {f.gabinete || f.ubicacion || '—'}
                        <div className="muted">{f.rol || ''}</div>
                      </td>
                      <td>
                        {f.puertosDeclarados === null
                          ? <span className="muted">sin declarar</span>
                          : <b>{f.libres}</b>}
                      </td>
                      <td>
                        {f.libresPoe}
                        {!f.poeDeclarado && <div className="muted">presupuesto sin declarar</div>}
                      </td>
                      <td>{f.ocupados}</td>
                      <td>
                        {f.sinMapear
                          ? <span className="chip">{f.sinMapear}</span>
                          : <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {ver === 'parque' && (
            !parque?.items?.length ? (
              <div className="card vacio">
                <h3>No hay equipos registrados</h3>
                <p>El parque se llena solo a medida que se dan de alta los activos.</p>
              </div>
            ) : (
              <>
                {(parque.sinModelo ?? 0) > 0 && (
                  <div className="card aviso">
                    <b>{parque.sinModelo} equipos sin marca ni modelo declarado.</b>
                    <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                      No se pueden incluir en una propuesta de renovación.
                    </p>
                  </div>
                )}
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Tipo</th><th>Marca y modelo</th><th>Cuántos</th><th>El más antiguo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parque.items.map((x: any, i: number) => (
                      <tr key={`${x.tipo}-${x.marca}-${x.modelo}-${i}`}>
                        <td>{NOMBRE_DE_TIPO[x.tipo] || x.tipo}</td>
                        <td>
                          {x.declarado
                            ? [x.marca, x.modelo].filter(Boolean).join(' ')
                            : <span className="muted">sin declarar</span>}
                        </td>
                        <td><b>{x.cuantos}</b></td>
                        <td>{x.masAntiguo ? fecha(x.masAntiguo) : <span className="muted">sin fecha</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )
          )}
        </>
      )}

      <ComoSeCalcula>
        <p>
          Un puerto libre es un puerto mapeado sin equipo conectado. Si el
          switch no declara sus puertos, no se cuenta.
        </p>
        <p>
          <b>«Sin declarar» no es «lleno».</b> Cero libres significa comprar un
          switch; sin declarar significa ir a medirlo.
        </p>
        <p>
          <b>El presupuesto PoE no se estima.</b> O está declarado o se dice que
          no se sabe: uno supuesto es cómo se quema una fuente.
        </p>
      </ComoSeCalcula>
    </div>
  );
}
