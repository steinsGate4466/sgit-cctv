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
    /* «CERO LIBRES» NO SIEMPRE SIGNIFICA «LLENO» — corregido el 21/09/2026.

       Lo cazó el usuario mirando esta pantalla con un switch de 24 puertos:
       decía «No queda ni un puerto libre» y al lado ponía «0 ocupados · 24 sin
       mapear». Las dos cosas no pueden ser verdad a la vez, y la que mentía era
       el titular.

       El motivo: `libres = mapeados − ocupados`. Si NADIE ha registrado qué hay
       enchufado en cada puerto, `mapeados` es cero, y cero menos cero da cero
       libres. La cuenta estaba bien; la FRASE estaba mal, porque «cero libres»
       se leyó como «lleno» cuando en realidad era «no se sabe».

       Y la diferencia cuesta dinero: «lleno» significa comprar un switch;
       «no se sabe» significa ir al gabinete y mirar. Es la regla del proyecto:
       un recorte que no se dice es una mentira.

       Por eso este caso va ANTES: mientras haya puertos sin registrar, no se
       afirma que no quede sitio. */
    if (!r.libres && r.sinMapear) {
      return {
        tono: 'sindatos',
        texto: `${r.sinMapear} puertos declarados y ninguno registrado`,
        apoyo: 'No se puede decir cuántos quedan libres hasta que alguien anote '
          + 'qué hay enchufado en cada puerto. Se hace en Conexiones.',
      };
    }
    if (!r.libres) {
      return {
        tono: 'grave',
        texto: 'No queda ni un puerto libre',
        apoyo: 'Todos los puertos registrados tienen algo enchufado. Una '
          + 'instalación nueva necesita un switch antes.',
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
                    <th>Switch</th><th>Dónde</th><th>Puertos</th>
                    <th>Libres</th><th>Con PoE</th><th>Ocupados</th>
                    <th>Sin registrar</th>
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
                        {/* LA CAPA, JUNTO AL SITIO — bloque 145.
                            Quien lee esta tabla está decidiendo si una
                            instalación cabe, y «hay puertos» no siempre
                            significa «se puede instalar aquí»: un capa 2 plano
                            no segmenta lo nuevo. */}
                        {f.capa && (
                          <span className="chip" title={f.capa === 'CAPA_3'
                            ? 'Enruta entre redes; se puede configurar una VLAN'
                            : 'Conmuta y reparte; normalmente no se configura'}>
                            {f.capa === 'CAPA_3' ? 'capa 3' : 'capa 2'}
                          </span>
                        )}
                        {f.gestionable === false && <span className="chip">plano</span>}
                      </td>
                      {/* De dónde sale cada número, que es lo que el usuario
                          preguntó: PUERTOS es lo que dice la ficha del switch;
                          LIBRES y OCUPADOS salen de lo registrado en Conexiones.
                          Enseñar los tres juntos evita el malentendido de leer
                          «0 libres» como «lleno» cuando no hay nada registrado. */}
                      <td>
                        {f.puertosDeclarados === null
                          ? <span className="muted">sin declarar</span>
                          : f.puertosDeclarados}
                      </td>
                      <td>
                        {f.puertosDeclarados === null
                          ? <span className="muted">—</span>
                          : f.sinMapear && !f.puertosMapeados
                            ? <span className="muted">sin saber</span>
                            : <b>{f.libres}</b>}
                      </td>
                      <td>
                        {f.libresPoe}
                        {!f.poeDeclarado && <div className="muted">presupuesto sin declarar</div>}
                      </td>
                      <td>{f.ocupados}</td>
                      <td>
                        {f.sinMapear
                          ? <span className="chip" title="Puertos que la ficha declara pero que nadie ha registrado en Conexiones">{f.sinMapear}</span>
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
          <b>De dónde sale cada número.</b> <b>Puertos</b> es lo que dice la
          ficha del switch, en Activos de planta. <b>Ocupados</b> y{' '}
          <b>libres</b> salen de lo registrado en <b>Conexiones</b>, puerto por
          puerto.
        </p>
        <p>
          <b>«Sin registrar» no es «lleno».</b> Un switch puede declarar 24
          puertos y no tener ninguno registrado: entonces no se sabe cuántos
          quedan, y la pantalla lo dice así en vez de inventar un cero.
        </p>
        <p>
          <b>El presupuesto PoE no se estima.</b> O está declarado o se dice que
          no se sabe: uno supuesto es cómo se quema una fuente.
        </p>
      </ComoSeCalcula>
    </div>
  );
}
