import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';

/**
 * DÓNDE ESTAMOS EXPUESTOS A NO PODER ARREGLAR — bloque 36.
 *
 * =============================================================================
 *  LA PREGUNTA QUE NO TENÍA PANTALLA
 * =============================================================================
 *  El sistema sabía responder «qué está roto» y «qué toca mantener». No sabía
 *  responder la que se hace en el comité de mantenimiento:
 *
 *      «¿QUÉ SE VA A ROMPER Y NO VAMOS A PODER ARREGLAR?»
 *
 *  El backend del bloque 32 la calculaba desde hacía semanas y no había forma
 *  de verla. Un cálculo sin pantalla, para la planta, no existe.
 *
 *  Son dos exposiciones distintas y por eso hay dos pestañas:
 *
 *   · ALMACÉN — el repuesto que sostiene una zona vital y no está en stock.
 *     Aquí el equipo funciona, pero el día que falle no hay con qué.
 *
 *   · EQUIPOS — el modelo sin recambio en el mercado o sin soporte del
 *     fabricante. Aquí el problema no se resuelve comprando otra pieza: hay
 *     que cambiar de modelo, y eso se planifica con meses.
 *
 * =============================================================================
 *  LA REGLA QUE ATRAVIESA TODA LA PANTALLA: SIN DATO, NUNCA «BAJO RIESGO»
 * =============================================================================
 *  Un equipo sin fecha de instalación NO sale en verde: sale como SIN DATOS.
 *  Un inventario donde la mitad está tranquila por estar vacío es peor que uno
 *  que admite lo que no sabe, porque el primero se enseña en una reunión y
 *  nadie vuelve a mirarlo.
 *
 *  Por eso «Sin datos» tiene su propia tarjeta, su propio color y —lo que de
 *  verdad importa— su propia tarea: la lista de modelos a los que les falta
 *  ficha. No es «revisa el inventario», es «averigua estos seis modelos».
 */

const NIVELES = ['CRITICO', 'ALTO', 'MEDIO', 'BAJO', 'SIN_DATOS'] as const;
type Nivel = typeof NIVELES[number];

const ETIQUETA: Record<Nivel, string> = {
  CRITICO: 'Crítico', ALTO: 'Alto', MEDIO: 'Medio', BAJO: 'Bajo', SIN_DATOS: 'Sin datos',
};

/* Se reutilizan las clases de criticidad que ya existen en styles.css en vez
   de inventar una paleta nueva: en el resto del sistema rojo ya significa
   «para todo» y ámbar «atiende hoy». Cambiar el significado del color entre
   pantallas es la forma más rápida de que la gente deje de fiarse de él. */
const CLASE: Record<Nivel, string> = {
  CRITICO: 'crit', ALTO: 'warn', MEDIO: '', BAJO: '', SIN_DATOS: 'sindatos',
};

export default function Riesgo() {
  const { can } = useAuth();
  const [pestana, setPestana] = useState<'almacen' | 'equipos'>('almacen');

  const [repuestos, setRepuestos] = useState<any>(null);
  const [obsol, setObsol] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  /* El umbral de años lo pone la planta, no el código: una cámara en el horno
     envejece distinto que una en el púlpito. El backend acepta el parámetro,
     así que la pantalla lo ofrece en vez de dejarlo fijo en 8 para siempre. */
  const [anos, setAnos] = useState(8);
  const [soloVitales, setSoloVitales] = useState(false);
  const [filtroNivel, setFiltroNivel] = useState<'' | Nivel>('');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      /* Las dos peticiones van en paralelo y CADA UNA se protege por separado.
         Si el usuario tiene `asset.read` pero no `inventory.read` —que es el
         caso del jefe de línea— la de almacén devuelve 403. Con un solo
         `catch` alrededor de las dos, ese 403 dejaría también la pestaña de
         equipos vacía, y la pantalla parecería rota cuando en realidad sólo
         falta un permiso. */
      const [a, b] = await Promise.all([
        can('inventory.read')
          ? api.get('/riesgo/repuestos').then((r) => r.data).catch(() => null)
          : Promise.resolve(null),
        api.get('/riesgo/obsolescencia', { params: { anos } }).then((r) => r.data).catch(() => null),
      ]);
      setRepuestos(a); setObsol(b);
      if (!a && !b) setError('No se pudo consultar el riesgo. Vuelve a intentarlo.');
    } finally { setCargando(false); }
  }, [anos, can]);

  useEffect(() => { cargar(); }, [cargar]);

  const datos = pestana === 'almacen' ? repuestos : obsol;

  const filas = useMemo(() => {
    const l: any[] = (pestana === 'almacen' ? repuestos?.repuestos : obsol?.equipos) ?? [];
    return l.filter((x) => {
      if (filtroNivel && x.nivel !== filtroNivel) return false;
      if (soloVitales) {
        return pestana === 'almacen' ? x.equiposEnZonaVital > 0 : !!x.zonaVital;
      }
      return true;
    });
  }, [pestana, repuestos, obsol, filtroNivel, soloVitales]);

  return (
    <div className="page">
      <h1 className="page-title">Dónde no vamos a poder arreglar</h1>

      <div className="card explica">
        <b>Esta pantalla no dice qué está roto: dice qué no se va a poder arreglar.</b>
        <div style={{ marginTop: 8 }}>
          Son dos cosas distintas. <b>Almacén</b> es el repuesto que sostiene una
          zona vital y no está en stock: el equipo anda, pero el día que falle no
          hay con qué. <b>Equipos</b> es el modelo sin recambio en el mercado o
          sin soporte del fabricante: eso no se arregla comprando una pieza, se
          planifica un cambio de modelo con meses de antelación.
        </div>
        <div style={{ marginTop: 8 }}>
          Lo que no tiene dato <b>no sale en verde</b>. Sale como «Sin datos»,
          que es distinto de «sin riesgo» y es una tarea concreta para alguien.
        </div>
      </div>

      <div className="pestanas">
        <button className={pestana === 'almacen' ? 'act' : ''} onClick={() => setPestana('almacen')}>
          Almacén
          {repuestos?.resumen && <> ({(repuestos.resumen.CRITICO ?? 0) + (repuestos.resumen.ALTO ?? 0)})</>}
        </button>
        <button className={pestana === 'equipos' ? 'act' : ''} onClick={() => setPestana('equipos')}>
          Equipos
          {obsol?.resumen && <> ({(obsol.resumen.CRITICO ?? 0) + (obsol.resumen.ALTO ?? 0)})</>}
        </button>
      </div>

      {error && <div className="card peligro">{error}</div>}

      {/* Sin `inventory.read` la pestaña de almacén no puede cargar. Se dice
          qué falta, en vez de enseñar una tabla vacía que parece un fallo. */}
      {pestana === 'almacen' && !can('inventory.read') && (
        <div className="card vacio">
          <h3>Sin acceso al almacén</h3>
          <p>El riesgo de repuestos necesita el permiso de <b>ver inventario</b>.</p>
        </div>
      )}

      {cargando ? <EsqueletoTabla filas={5} /> : datos && (
        <>
          {/* EL TITULAR. Lo redacta el BACKEND, no esta pantalla, para que
              diga exactamente lo mismo en la web, en el PDF y en el aviso de
              Telegram el día que se enganche. */}
          {datos.titular && (
            <div className={'card ' + ((datos.resumen?.CRITICO ?? 0) > 0 ? 'peligro' : 'explica')}>
              <b>{datos.titular}</b>
            </div>
          )}

          <div className="kpi-grid">
            {NIVELES.map((n) => (
              /* Cada tarjeta es un FILTRO. Es la diferencia entre un tablero
                 que se mira y uno que se usa: se ve «3 críticos» y se pulsa
                 para tener delante esos tres, sin buscarlos en la tabla. */
              <button
                key={n}
                type="button"
                className={'kpi kpi-boton ' + CLASE[n] + (filtroNivel === n ? ' kpi-activo' : '')}
                onClick={() => setFiltroNivel(filtroNivel === n ? '' : n)}
                aria-pressed={filtroNivel === n}
              >
                <div className="label">{ETIQUETA[n]}</div>
                <div className="value">{datos.resumen?.[n] ?? 0}</div>
                <div className="hint">
                  {n === 'SIN_DATOS'
                    ? 'Falta el dato para poder valorar'
                    : filtroNivel === n ? 'Filtrando — pulsa otra vez para quitar' : 'Pulsa para ver sólo estos'}
                </div>
              </button>
            ))}
          </div>

          <div className="filters">
            {pestana === 'equipos' && (
              <div>
                <label htmlFor="r-anos">Se considera viejo a partir de</label>
                <select id="r-anos" value={anos} onChange={(e) => setAnos(Number(e.target.value))}>
                  {[5, 6, 8, 10, 12].map((a) => <option key={a} value={a}>{a} años</option>)}
                </select>
              </div>
            )}
            <div>
              <label>&nbsp;</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <input
                  type="checkbox"
                  checked={soloVitales}
                  onChange={(e) => setSoloVitales(e.target.checked)}
                  style={{ width: 18, height: 18, minHeight: 18 }}
                />
                <span style={{ fontSize: 13 }}>Sólo lo que toca una zona vital</span>
              </label>
            </div>
          </div>

          {/* La tarea concreta, no el consejo genérico. */}
          {pestana === 'equipos' && obsol?.modelosSinFicha?.length > 0 && (
            <div className="card explica">
              <b>{obsol.modelosSinFicha.length} modelo(s) sin ficha de obsolescencia.</b>{' '}
              Mientras no se sepa si tienen recambio, sus equipos no se pueden
              valorar. No es «revisar el inventario»: es averiguar estos.
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {obsol.modelosSinFicha.map((m: string) => (
                  <span key={m} className="chip">{m}</span>
                ))}
              </div>
            </div>
          )}

          {filas.length === 0 ? (
            <div className="card vacio">
              <h3>Nada que mostrar con este filtro</h3>
              <p>
                {filtroNivel || soloVitales
                  ? 'Quita el filtro para ver el resto.'
                  : pestana === 'almacen'
                    ? 'No hay repuestos cargados todavía. Sin almacén no hay riesgo que calcular — que no es lo mismo que no tener riesgo.'
                    : 'No hay equipos cargados todavía.'}
              </p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="tabla">
                <thead>
                  {pestana === 'almacen' ? (
                    <tr>
                      <th>Riesgo</th><th>Repuesto</th><th>Stock</th>
                      <th>Equipos que lo usan</th><th>En zona vital</th><th>Por qué</th>
                    </tr>
                  ) : (
                    <tr>
                      <th>Riesgo</th><th>Equipo</th><th>Marca / Modelo</th>
                      <th>Instalado</th><th>Zona</th><th>Por qué</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {filas.map((x: any) => (
                    <tr key={x.id}>
                      <td><span className={'chip ' + CLASE[x.nivel as Nivel]}>{ETIQUETA[x.nivel as Nivel]}</span></td>

                      {pestana === 'almacen' ? (
                        <>
                          <td><b>{x.codigo}</b><div className="muted" style={{ fontSize: 12 }}>{x.nombre}</div></td>
                          <td>
                            {x.stock}
                            {/* El mínimo sólo se enseña si existe. Pintar
                                «mín. 0» donde nadie lo declaró haría creer
                                que el cero es una decisión. */}
                            {x.minimo != null && <span className="muted" style={{ fontSize: 12 }}> / mín. {x.minimo}</span>}
                          </td>
                          <td>{x.equiposQueLoUsan}</td>
                          <td>
                            {x.equiposEnZonaVital > 0
                              ? <b>{x.equiposEnZonaVital}</b>
                              : <span className="muted">—</span>}
                            {x.zonasVitales?.length > 0 && (
                              <div className="muted" style={{ fontSize: 12 }}>{x.zonasVitales.join(', ')}</div>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td><b>{x.assetCode}</b></td>
                          <td>
                            {[x.marca, x.modelo].filter(Boolean).join(' ') || <span className="muted">Sin declarar</span>}
                            {x.reemplazadoPor && (
                              <div className="muted" style={{ fontSize: 12 }}>
                                se reemplaza por {x.reemplazadoPor}
                              </div>
                            )}
                          </td>
                          <td>
                            {x.anosInstalado != null
                              ? `${x.anosInstalado} año(s)`
                              : <span className="muted">Sin fecha</span>}
                          </td>
                          <td>
                            {x.zonaVital
                              ? <span className="chip crit">{x.zonaNombre || 'Zona vital'}</span>
                              : <span className="muted">—</span>}
                          </td>
                        </>
                      )}

                      {/* El «por qué» lo redacta el backend en la misma regla
                          que decide el nivel. Si lo escribiera la pantalla,
                          el texto y el color podrían acabar contando cosas
                          distintas, y el que manda es el texto. */}
                      <td style={{ fontSize: 12.5, maxWidth: 380 }}>{x.porQue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
