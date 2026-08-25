import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import Icono from '../components/Iconos';
import { EsqueletoTablero } from '../components/Esqueleto';
import { Cifras, ComoSeCalcula, Detalle, Titular, Tono } from '../components/Patron';
import { useAuth } from '../auth/AuthContext';
import {
  useVolverALaPantalla, useRefrescoDePulpito, useEdadDelDato,
} from '../useVolverALaPantalla';
import { plural } from '../formato';
import DeclararAcceso from '../components/DeclararAcceso';

/**
 * QUÉ HAY EN MI TREN Y CÓMO SE LLEGA — bloque 41.
 *
 * =============================================================================
 *  LA OTRA MITAD DE LA PREGUNTA
 * =============================================================================
 *  «Mis cámaras» responde qué está fallando AHORA. Ésta responde la que hace
 *  Producción cuando le llega una solicitud de manlift:
 *
 *      «¿Qué tengo en mi tren, dónde está y cuánto de eso exige manlift?»
 *
 *  Producción costea el manlift. Hasta hoy cada subida se pedía suelta y se
 *  pagaba suelta, porque nadie tenía delante la lista que enseña que tres de
 *  esos equipos están en el mismo poste.
 *
 * =============================================================================
 *  LO QUE ESTA PANTALLA NO HACE
 * =============================================================================
 *  No dice soles. Cuenta equipos y subidas. Una tarifa metida en el sistema
 *  envejece sola y a los seis meses da una cifra falsa con aspecto de exacta;
 *  el número que Producción puede decidir es cuántas veces sube el equipo, y
 *  ése sí sale de datos que el sistema conoce de verdad.
 *
 * =============================================================================
 *  «SIN DECLARAR» TIENE SU PROPIO COLOR, Y NO ES VERDE
 * =============================================================================
 *  Un equipo del que nadie ha dicho cómo se llega NO sale como «se llega a
 *  pie». Sale en gris, aparte, y con su propia tarea: la lista de los que
 *  faltan. Es la misma regla de la pantalla de Riesgo — sin dato, nunca «bajo
 *  riesgo» — y aquí importa el doble, porque un número bajo se aprueba y el día
 *  del trabajo falta el equipo.
 */
export default function MisActivos() {
  const { can } = useAuth();
  const puedeDeclarar = can('asset.update');

  const [trenes, setTrenes] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [d, setD] = useState<any>(null);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  /* Los filtros viven en la PANTALLA, no en el servidor. El listado de un tren
     son decenas de filas: pedirlo otra vez por cada casilla sería más lento y
     encima haría bailar las cifras de arriba con cada clic. */
  const [filtro, setFiltro] = useState<'' | 'ELEVADOR' | 'SIN_DECLARAR' | 'CAIDOS'>('');
  const [editando, setEditando] = useState<any>(null);
  /* Bloque 42. Cuándo se cargó de verdad, para poder decir la edad del dato.
     En el PC del púlpito esta pantalla lleva ocho horas abierta. */
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
      const r = await api.get(`/dashboard/tren/${encodeURIComponent(code)}/activos`);
      setD(r.data);
      // Sólo al RECIBIR datos. Si se marcara al lanzar la petición, un fallo
      // dejaría la pantalla diciendo «hace 0 min» sobre datos viejos.
      setCargadoEn(Date.now());
    } catch (e: any) {
      setError(e?.response?.status === 403
        ? 'Tu usuario no tiene permiso para ver los activos de este tren.'
        : 'No se pudo consultar. Vuelve a intentarlo.');
      setD(null);
    } finally { setCargando(false); }
  }, [code]);

  useEffect(() => { cargar(); }, [cargar]);
  useVolverALaPantalla(cargar);
  /* El púlpito no cambia de pestaña nunca, así que `visibilitychange` no salta
     y sin esto se quedaría con los datos del inicio del turno. */
  useRefrescoDePulpito(cargar);

  const grupos = useMemo(() => {
    const gs: any[] = d?.grupos ?? [];
    if (!filtro) return gs;
    return gs
      .map((g) => ({ ...g, activos: g.activos.filter((a: any) => pasa(a, filtro)) }))
      .filter((g) => g.activos.length > 0);
  }, [d, filtro]);

  if (cargandoLista) return <div className="page"><EsqueletoTablero /></div>;

  if (!trenes.length) {
    return (
      <div className="page">
        <h1 className="page-title">Activos por tren</h1>
        <div className="card vacio">
          <h3>Todavía no hay trenes en el árbol de planta</h3>
          <p>En cuanto se creen, aquí aparece todo lo que cuelga de cada uno.</p>
        </div>
      </div>
    );
  }

  const r = d?.resumen;
  const tono: Tono = !r || r.total === 0 ? 'sindatos'
    : r.subidasQueSeAhorran > 0 ? 'atender'
      : r.sinDeclarar > 0 ? 'sindatos'
        : 'bien';

  /* EL TREN VA EN EL TÍTULO, y no es decoración. El ámbito es un campo que
     alguien tiene que mantener; si a un jefe de tren le asignan el que no es,
     con el nombre delante se ve en un segundo en vez de descubrirse en una
     reunión tres semanas después. */
  const suTren = trenes.find((t) => t.code === code);

  return (
    <div className="page">
      <h1 className="page-title">
        Mis activos{suTren ? ` · ${suTren.nombre}` : ''}
      </h1>
      {/* La edad del dato. En el púlpito la pantalla lleva horas abierta y
          «todo en verde» puede ser de la madrugada. Se dice desde los 2 min. */}
      {edad !== null && edad >= 2 && (
        <p className="edad-dato">Datos de hace {plural(edad, 'minuto')}.</p>
      )}

      {trenes.length > 1 && (
        <div className="train-tabs">
          {trenes.map((t) => (
            <button key={t.code}
              className={'train-tab' + (code === t.code ? ' active' : '')}
              onClick={() => { setCode(t.code); setFiltro(''); }}>
              {t.nombre}
            </button>
          ))}
        </div>
      )}

      {error && <div className="card peligro">{error}</div>}
      {d?.mensaje && <div className="card vacio"><h3>{d.mensaje}</h3></div>}

      {cargando && !r ? <EsqueletoTablero /> : r && (
        <>
          <Titular tono={tono} texto={r.titular} />

          <Cifras
            datos={[
              { n: r.total, et: 'equipos' },
              { n: r.exigenElevador, et: 'exigen manlift' },
              /* Sin declarar se enseña SIEMPRE, aunque sea 0. Es la cifra que
                 dice cuánto vale el resto de la pantalla: con la mitad sin
                 declarar, el «exigen manlift» de al lado está incompleto. */
              { n: r.sinDeclarar, et: 'sin declarar' },
            ]}
          />

          {/* ---------------- EL PANEL QUE MIRA PRODUCCIÓN ----------------
              Es lo único de esta pantalla que se traduce en una decisión de
              gasto, así que va arriba y va destacado. */}
          {r.pendientesConElevador > 0 && (
            <div className="subidas">
              <div className="subidas-cabeza">
                <Icono n="acceso" size={18} />
                <div>
                  <b>
                    {plural(r.subidas.length, 'subida de manlift', 'subidas de manlift')}
                    {' '}para atender {plural(r.pendientesConElevador, 'equipo')}
                  </b>
                  {r.subidasQueSeAhorran > 0 && (
                    <div className="subidas-ahorro">
                      Agrupando los trabajos se ahorran{' '}
                      {plural(r.subidasQueSeAhorran, 'movilización', 'movilizaciones')}.
                    </div>
                  )}
                </div>
              </div>
              <div className="subidas-lista">
                {r.subidas.map((s: any) => (
                  <div key={s.ubicacionId ?? s.ubicacionNombre} className="subida">
                    <span className="subida-n">{s.equipos}</span>
                    <span className="subida-donde">{s.ubicacionNombre}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lo que falta por declarar, dicho como una tarea concreta y no
              como un reproche genérico al inventario. */}
          {r.sinDeclararEnZonaDeAltura > 0 && (
            <p className="nada-que-hacer">
              <b>La cifra de arriba puede subir.</b>{' '}
              {plural(r.sinDeclararEnZonaDeAltura, 'equipo está', 'equipos están')} en zonas
              marcadas de altura y nadie ha declarado todavía cómo se llega a
              {r.sinDeclararEnZonaDeAltura === 1 ? ' él' : ' ellos'}.
            </p>
          )}

          {r.contradicciones > 0 && (
            <p className="nada-que-hacer aviso-dato">
              <Icono n="alerta" size={14} />{' '}
              {plural(r.contradicciones, 'equipo tiene', 'equipos tienen')} datos de acceso que
              se contradicen. Están marcados en la lista.
            </p>
          )}

          {/* ---------------- FILTROS ---------------- */}
          {/* Cada filtro lleva su número. Es la diferencia entre un tablero que
              se mira y uno que se usa: se ve «12 sin declarar» y se pulsa para
              tener delante esos doce, sin buscarlos por la lista. */}
          <div className="filtros-acceso">
            {([
              ['', `Todo (${r.total})`],
              ['ELEVADOR', `Exigen manlift (${r.exigenElevador})`],
              ['SIN_DECLARAR', `Sin declarar (${r.sinDeclarar})`],
              ['CAIDOS', 'Sin servicio'],
            ] as const).map(([v, et]) => (
              <button key={v || 'todo'} type="button"
                className={'f-chip' + (filtro === v ? ' act' : '')}
                onClick={() => setFiltro(v as any)}>
                {et}
              </button>
            ))}
          </div>

          {/* ---------------- LOS GRUPOS ---------------- */}
          {grupos.length === 0 ? (
            <div className="card vacio">
              <h3>Nada con ese filtro</h3>
              <p>Prueba con «Todo» para ver el tren completo.</p>
            </div>
          ) : grupos.map((g: any) => (
            <Grupo key={g.clave} g={g}
              puedeDeclarar={puedeDeclarar}
              alDeclarar={setEditando} />
          ))}
        </>
      )}

      {editando && (
        <DeclararAcceso
          activo={editando}
          alCerrar={() => setEditando(null)}
          alGuardar={() => { setEditando(null); cargar(); }}
        />
      )}

      <ComoSeCalcula>
        <p>
          Cada equipo se agrupa por dónde está montado: dentro de un{' '}
          <b>gabinete</b>, dentro de un <b>tablero eléctrico</b> o suelto en{' '}
          <b>campo</b>. Son los tres sitios donde cambia la forma de llegar.
        </p>
        <p>
          <b>El medio de acceso se declara equipo por equipo</b>, no por zona.
          En la misma zona hay una cámara en la pared a 2 m y otra en el poste a
          8 m: contarlas igual daría un número que no aguanta la primera
          pregunta.
        </p>
        <p>
          <b>Lo que nadie ha declarado no cuenta como «se llega a pie».</b> Sale
          en gris. La propuesta de altura no suma al total hasta confirmarla.
        </p>
        <p>
          <b>Las subidas se agrupan por punto.</b> Tres equipos con trabajo
          pendiente en el mismo sitio son una movilización, no tres. Los que no
          tienen ubicación cargada no se agrupan: no hay forma de saber si están
          cerca, y prometer un ahorro que no existe es peor que no prometer nada.
        </p>
        <p>
          Desde <b>1,80 m</b> es trabajo en altura y exige PETAR. Un equipo
          declarado «se llega a pie» por encima de esa altura se marca como
          contradicción y no se corrige solo: corregirlo sería decidir cuál de
          los dos datos vale.
        </p>
      </ComoSeCalcula>
    </div>
  );
}

/** ¿Esta fila pasa el filtro? */
function pasa(a: any, f: string) {
  if (f === 'ELEVADOR') return a.acceso.veredicto === 'EXIGE_ELEVADOR';
  if (f === 'SIN_DECLARAR') return a.acceso.veredicto === 'SIN_DECLARAR';
  if (f === 'CAIDOS') return a.estaCaido;
  return true;
}

const ICONO_MONTAJE: Record<string, string> = {
  GABINETE: 'gabinete', TABLERO: 'electricidad', CAMPO: 'ubicacion',
};

/**
 * Un gabinete, un tablero o un punto de campo.
 *
 * Va plegado salvo que tenga algo que mirar. Un tren con doce gabinetes abiertos
 * de golpe es una pantalla por la que hay que hacer scroll tres minutos; con
 * los grupos cerrados, lo que tiene equipos caídos o exige manlift se ve en la
 * primera pantalla.
 */
function Grupo({ g, puedeDeclarar, alDeclarar }: {
  g: any; puedeDeclarar: boolean; alDeclarar: (a: any) => void;
}) {
  const abrir = g.caidos > 0 || g.exigenElevador > 0;

  const titulo = (
    <>
      <Icono n={(ICONO_MONTAJE[g.montaje] || 'ubicacion') as any} size={15} />
      {' '}{g.titulo}
      <span className="grupo-marcas">
        <span className="grupo-n">{plural(g.activos.length, 'equipo', 'equipos')}</span>
        {g.caidos > 0 && <span className="badge crit">{g.caidos} sin servicio</span>}
        {g.exigenElevador > 0 && <span className="badge warn">{g.exigenElevador} manlift</span>}
        {g.sinDeclarar > 0 && <span className="badge sindatos">{g.sinDeclarar} sin declarar</span>}
      </span>
    </>
  );

  return (
    <Detalle titulo={titulo} abiertoAlEntrar={abrir}>
      {g.subtitulo && <p className="grupo-sub">{g.subtitulo}</p>}
      {g.aviso && <div className="card peligro grupo-aviso">{g.aviso}</div>}

      <div className="activos-lista">
        {g.activos.map((a: any) => (
          <Fila key={a.id} a={a} puedeDeclarar={puedeDeclarar} alDeclarar={alDeclarar} />
        ))}
      </div>
    </Detalle>
  );
}

const CLASE_ACCESO: Record<string, string> = {
  EXIGE_ELEVADOR: 'acc-elevador',
  SUBIDA_SIN_ELEVADOR: 'acc-subida',
  A_PIE: 'acc-pie',
  SIN_DECLARAR: 'acc-sindatos',
};

const ETIQUETA_ACCESO: Record<string, string> = {
  EXIGE_ELEVADOR: 'Manlift',
  SUBIDA_SIN_ELEVADOR: 'Hay que subir',
  A_PIE: 'A pie',
  SIN_DECLARAR: 'Sin declarar',
};

/**
 * Una línea por equipo.
 *
 * Es una tarjeta y no una fila de tabla a propósito: en el móvil del técnico
 * una tabla de siete columnas no se lee, y esta pantalla se abre tanto en el PC
 * del púlpito como de pie delante del gabinete.
 */
function Fila({ a, puedeDeclarar, alDeclarar }: {
  a: any; puedeDeclarar: boolean; alDeclarar: (x: any) => void;
}) {
  const acc = a.acceso;
  return (
    <div className={'activo-fila' + (a.estaCaido ? ' caido' : '')}>
      <div className="activo-id">
        <b>{a.codigo}</b>
        {a.zonaVital && <span className="badge crit">Zona vital</span>}
        {a.estaCaido && <span className={'badge ' + a.estado}>{etiquetaEstado(a.estado)}</span>}
      </div>

      <div className="activo-que">
        {a.equipo || a.tipo}
        {a.referencia && <span className="activo-ref"> · {a.referencia}</span>}
      </div>

      <div className="activo-acceso">
        <span className={'acc ' + (CLASE_ACCESO[acc.veredicto] || '')}>
          {ETIQUETA_ACCESO[acc.veredicto] || acc.veredicto}
          {acc.alturaMetros != null && <span className="acc-m"> {acc.alturaMetros} m</span>}
        </span>

        {/* La propuesta sólo se enseña si NO hay declaración. Con declaración
            sería ruido: ya está decidido. */}
        {!acc.declarado && acc.propuesta && (
          <span className="acc-propuesta">la zona dice que hay que subir</span>
        )}

        {acc.declarado && acc.declaradoPor && (
          <span className="acc-quien">lo declaró {acc.declaradoPor}</span>
        )}
      </div>

      {acc.nota && <div className="activo-nota">{acc.nota}</div>}

      {/* La contradicción se enseña entera. Es el único texto largo que se
          permite en la fila, porque es el que evita que alguien suba sin
          permiso de altura confiando en la ficha. */}
      {acc.contradiccion && (
        <div className="activo-choque">
          <Icono n="alerta" size={13} /> {acc.contradiccion}
        </div>
      )}

      <div className="activo-pie">
        {a.pendiente && (
          <span className="activo-om">
            <Icono n="llaveInglesa" size={13} />{' '}
            {a.pendiente.om
              ? `${a.pendiente.om} · ${etiquetaOm(a.pendiente.estado)}`
              : 'Incidencia abierta'}
          </span>
        )}
        {puedeDeclarar && (
          <button type="button" className="btn-mini" onClick={() => alDeclarar(a)}>
            {acc.declarado ? 'Corregir acceso' : 'Declarar cómo se llega'}
          </button>
        )}
      </div>
    </div>
  );
}

function etiquetaEstado(s: string) {
  const m: Record<string, string> = {
    FUERA_SERVICIO: 'Fuera de servicio',
    MANTENIMIENTO: 'En mantenimiento',
    CON_INCIDENCIA: 'Con incidencia',
  };
  return m[s] || s;
}

function etiquetaOm(s: string) {
  const m: Record<string, string> = {
    ABIERTA: 'abierta', EN_PROCESO: 'en proceso', EN_ESPERA: 'en espera',
    INCIDENCIA_ABIERTA: 'incidencia abierta',
  };
  return m[s] || s.toLowerCase();
}
