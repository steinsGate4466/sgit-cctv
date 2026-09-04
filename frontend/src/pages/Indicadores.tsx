import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import { api } from '../api/client';
import { EsqueletoTablero } from '../components/Esqueleto';
import Icono from '../components/Iconos';
import { useDialogos } from '../components/Dialogos';
import { mensajeDeError } from '../avisos';
import { useAuth } from '../auth/AuthContext';
import { fechaTabla } from '../fechas';

/**
 * INDICADORES DE GESTIÓN
 *
 * Lo que cambia con esta pantalla: hasta aquí el sistema servía para
 * TRABAJAR. Esto lo hace servir además para DECIDIR.
 *
 * Son los cuatro números con los que un jefe de mantenimiento defiende su
 * presupuesto en un comité. No hay que cargar nada nuevo: salen de las
 * órdenes que ya se registran.
 *
 * LA REGLA DE TODA LA PANTALLA: donde no hay datos suficientes se escribe
 * «sin datos», nunca un cero. Un cero se lee como «tardamos cero horas en
 * reparar», y eso acaba en una diapositiva siendo mentira.
 */

/* =============================================================================
   LA FLECHA CONTRA EL PERIODO ANTERIOR — bloque 84
   -----------------------------------------------------------------------------
   Petición del usuario: «lo necesito más bonito, más llamativo y entendible,
   sin muchas letras. Guíate de dashboards de internet, Power BI y toda esa
   mierda».

   Lo que hace que un tablero se entienda de un vistazo no es el color: es que
   cada número traiga al lado si va MEJOR o PEOR que antes. «MTTR 4,2 h» no
   dice nada a quien lo mira por primera vez. «4,2 h ▼ 1,1 mejor» sí.

   EL VEREDICTO VIENE DEL SERVIDOR, no se decide aquí. El MTTR baja y es buena
   noticia; la disponibilidad baja y es mala. Si lo decidiera cada pantalla,
   dos que enseñaran el mismo número podrían pintarlo de colores distintos.
============================================================================= */
function Delta({ c }: { c?: any }) {
  if (!c || c.veredicto === 'SIN_COMPARACION') {
    /* NO se pinta nada. Un «—» o un «0 %» donde no hay comparación se lee como
       «no ha cambiado», que es otra cosa muy distinta de «no lo sé». */
    return <div className="kpi-delta kpi-sin">sin comparación</div>;
  }
  if (c.veredicto === 'IGUAL') {
    return <div className="kpi-delta kpi-igual">= sin cambios</div>;
  }
  const subio = c.delta > 0;
  return (
    <div className={'kpi-delta ' + (c.veredicto === 'MEJOR' ? 'kpi-mejor' : 'kpi-peor')}>
      <span aria-hidden="true">{subio ? '▲' : '▼'}</span>
      {' '}{Math.abs(c.delta)}
      {c.deltaPct !== null && <span className="kpi-pct"> ({Math.abs(c.deltaPct)} %)</span>}
      <span className="kpi-vs">{c.veredicto === 'MEJOR' ? ' mejor' : ' peor'}</span>
    </div>
  );
}

/**
 * Un número grande, su variación y poco más.
 *
 * LA EXPLICACIÓN SE VA AL TOOLTIP. Antes iba debajo en gris, y con ocho
 * tarjetas eso son ocho párrafos: la pantalla se leía como un manual y el
 * número —que es lo único que se mira en un comité— quedaba pequeño entre
 * texto. Se conserva entera en `title`, así que sigue estando para quien la
 * necesite; sólo deja de competir con el dato.
 *
 * `title` en el CONTENEDOR y no en un iconito: el objetivo es que se lea
 * pasando el ratón por encima de la tarjeta, no acertándole a un símbolo de
 * doce píxeles con guantes.
 */
function Indicador({ valor, unidad, titulo, explica, aviso, color, comp }: {
  valor: number | null; unidad?: string; titulo: string;
  explica: string; aviso?: string | null; color?: string; comp?: any;
}) {
  return (
    <div className="card kpi" style={{ margin: 0 }} title={explica}>
      <div className="kpi-tit">{titulo}</div>
      {valor === null ? (
        <>
          <div className="kpi-nada">Sin datos</div>
          {aviso && <div className="kpi-aviso">{aviso}</div>}
        </>
      ) : (
        <>
          <div className="kpi-num" style={{ color: color || 'var(--navy)' }}>
            {valor}<span className="kpi-u">{unidad}</span>
          </div>
          <Delta c={comp} />
        </>
      )}
    </div>
  );
}

/* LA META DEL REPARTO — la segunda rueda de la hoja del ingeniero.
   -----------------------------------------------------------------------------
   YA NO ESTÁ ESCRITA AQUÍ (bloque 94). Se lee de la base y se edita desde esta
   misma pantalla, porque es un dato de PLANTA: quien la fija es el Jefe de
   Mantenimiento, no quien despliega.

   > Una meta que exige un despliegue para cambiarse no se cambia: se ignora.

   Mientras nadie la haya fijado, el servidor devuelve la PROPUESTA y la marca
   como tal — y la pantalla lo dice con esas palabras. Presentar una propuesta
   como si estuviera firmada hace que en la reunión se discuta el número en vez
   del trabajo (misma regla que los cortes de la criticidad, bloque 76).

   SIN PREDICTIVO (bloque 80): en CCTV no hay nada que predecir. Una cámara da
   imagen o no la da; no avisa como avisa un rodamiento. El 30 % que la hoja
   original le daba pasa al lado planificado, que es donde ese trabajo iba. */

/**
 * LA META, Y QUIÉN LA FIJÓ — bloque 94.
 *
 * =============================================================================
 *  TRES DECISIONES QUE NO SON DE ADORNO
 * =============================================================================
 *  1. SE DICE SI ESTÁ CONFIRMADA O ES UNA PROPUESTA. Mientras nadie la haya
 *     fijado, el gráfico enseña la propuesta del sistema y aquí se lee tal
 *     cual. Presentar una propuesta como decisión hace que en la reunión se
 *     discuta el número en lugar del trabajo.
 *
 *  2. SÓLO VE EL BOTÓN QUIEN PUEDE FIJARLA (`wo.approve`). Enseñar un botón
 *     que va a devolver 403 es peor que no enseñarlo: el usuario lo pulsa,
 *     falla, y deja de fiarse del resto de la pantalla (bloque 68).
 *
 *  3. EL AVISO DE ERROR NO VIVE DENTRO DE LO QUE SE CIERRA. El formulario sólo
 *     se cierra cuando el servidor confirma. Si falla, se queda abierto CON el
 *     mensaje — que es el bug 3 del bloque 64: cerrar en silencio y que el
 *     usuario concluya, con razón, que el software no guarda.
 */
function MetaDelReparto({ meta, editando, onEditar, onCerrar, onGuardada }: any) {
  const { can } = useAuth();
  const puedeFijar = can('wo.approve');
  const [corr, setCorr] = useState('');
  const [prev, setPrev] = useState('');
  const [porMes, setPorMes] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!editando || !meta) return;
    setCorr(String(meta.valores.correctivoPct));
    setPrev(String(meta.valores.preventivoPct));
    setPorMes(meta.valores.omPorMes == null ? '' : String(meta.valores.omPorMes));
    setError('');
  }, [editando, meta]);

  async function guardar() {
    if (guardando) return;          // dos pulsaciones = dos peticiones (b87)
    setGuardando(true); setError('');
    try {
      /* Se manda EXACTAMENTE lo que el DTO declara. Un campo de más no se
         ignora: el `ValidationPipe` rechaza la petición entera, y ése fue el
         fallo que dejó sin guardar la pantalla de Roles en el bloque 90. */
      const { data } = await api.put('/indicadores/meta', {
        correctivoPct: Number(corr),
        preventivoPct: Number(prev),
        omPorMes: porMes.trim() === '' ? null : Number(porMes),
      });
      if (!data) { setError('El servidor respondió pero no confirmó. Comprueba antes de repetir.'); return; }
      onGuardada(data);
    } catch (e: any) {
      setError(mensajeDeError(e, 'guardar la meta'));
    } finally { setGuardando(false); }
  }

  if (!meta) return null;
  const v = meta.valores;
  const suma = Number(corr || 0) + Number(prev || 0);

  if (!editando) {
    return (
      <p className="muted" style={{ fontSize: 12.5 }}>
        Meta: <b>{v.correctivoPct} / {v.preventivoPct}</b>
        {v.omPorMes != null && <> · <b>{v.omPorMes} OM/mes</b></>}
        {meta.confirmada
          ? <> · {meta.fijadaPor || '—'}, {fechaTabla(meta.fijadaEn)}</>
          : <> · <b>propuesta</b>, sin fijar</>}
        {puedeFijar && (
          <button className="btn-mini" style={{ marginLeft: 8 }} onClick={onEditar}
            title="Fijar la meta del reparto y, si se quiere, la de volumen mensual">
            Fijar meta
          </button>
        )}
      </p>
    );
  }

  return (
    <div className="card" style={{ padding: 14, marginTop: 8 }}>
      <div className="form-grid">
        <label>Correctivo %
          <input type="number" min={0} max={100} value={corr}
            onChange={(e) => setCorr(e.target.value)} />
        </label>
        <label>Preventivo %
          <input type="number" min={0} max={100} value={prev}
            onChange={(e) => setPrev(e.target.value)} />
        </label>
        <label>OM/mes
          <input type="number" min={0} value={porMes} placeholder="opcional"
            onChange={(e) => setPorMes(e.target.value)} />
        </label>
      </div>
      {/* ÁMBAR, NO ROJO, y sólo cuando se desvía. El formulario abre con una
          meta válida, así que este aviso no salta nunca al abrirlo: no regaña
          a nadie por no haber empezado (bloque 67). Un reparto que no suma 100
          deja un trozo sin dueño, y verlo aquí cuesta un segundo; verlo tras
          pulsar y recibir un 400 del servidor cuesta la confianza. */}
      <p className="muted" style={{
        fontSize: 11.5,
        color: suma === 100 ? undefined : 'var(--warn)',
        fontWeight: suma === 100 ? undefined : 600,
      }}>{suma} de 100</p>
      {error && <div className="error">{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn-primary" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button className="btn-mini" onClick={onCerrar} disabled={guardando}>Cancelar</button>
      </div>
    </div>
  );
}

export default function Indicadores() {
  const nav = useNavigate();
  const { avisar } = useDialogos();
  const [dias, setDias] = useState(90);
  const [tren, setTren] = useState('');
  const [t, setT] = useState<any>(null);
  /* La meta y su procedencia. `confirmada: false` significa que nadie la ha
     fijado todavía y que lo que se pinta es la propuesta del sistema. */
  const [meta, setMeta] = useState<any>(null);
  const [editaMeta, setEditaMeta] = useState(false);
  const [tend, setTend] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async (d: number, tr: string) => {
    const [a, b, m] = await Promise.all([
      api.get('/indicadores', { params: { dias: d, tren: tr || undefined } }).then((r) => r.data).catch(() => null),
      api.get('/indicadores/tendencia', { params: { meses: 6 } }).then((r) => r.data).catch(() => []),
      api.get('/indicadores/meta').then((r) => r.data).catch(() => null),
    ]);
    setT(a); setTend(b || []); setMeta(m);
  }, []);

  useEffect(() => { setCargando(true); cargar(dias, tren).finally(() => setCargando(false)); }, [dias, tren, cargar]);

  /* DESCARGA EN EXCEL — bloque 84.
     ---------------------------------------------------------------------------
     SE AVISA SI FALLA, y no es una formalidad: el archivo tarda unos segundos
     en armarse, así que si algo va mal el usuario está mirando una pantalla
     que no cambia. Sin aviso, la conclusión es que el botón no hace nada — el
     bug número 3 del bloque 64, otra vez.

     Y el botón se APAGA mientras baja, que es el único caso en que apagar un
     botón está bien (bloque 67): la razón es evidente y dura un segundo. */
  const [bajando, setBajando] = useState(false);
  async function descargar() {
    setBajando(true);
    try {
      const r = await api.get('/indicadores/excel', {
        params: { dias, tren: tren || undefined },
        responseType: 'blob',
      });
      const nombre =
        /filename="?([^";]+)"?/.exec(r.headers['content-disposition'] || '')?.[1]
        || 'sgit_indicadores.xlsx';
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      await avisar(mensajeDeError(e, 'preparar el Excel de indicadores'));
    } finally {
      setBajando(false);
    }
  }

  /* Verde a partir del 90, ámbar del 75, rojo por debajo. Los mismos cortes
     que el cumplimiento del preventivo: dos indicadores hermanos con escalas
     distintas se comparan mal. */
  const ns = t?.nivelDeServicio?.pct;
  const nsColor = ns === null || ns === undefined ? '#64748b'
    : ns >= 90 ? '#15803d' : ns >= 75 ? '#b45309' : '#c0392b';

  if (cargando) return <EsqueletoTablero kpis={4} paneles={2} />;
  if (!t) return <div className="card aviso-error">No se pudieron calcular los indicadores.</div>;

  const dispColor = t.disponibilidad.pct === null ? undefined
    : t.disponibilidad.pct >= 95 ? 'var(--ok)'
    : t.disponibilidad.pct >= 85 ? 'var(--warn)' : 'var(--crit)';
  const cumpColor = t.preventivo.pct === null ? undefined
    : t.preventivo.pct >= 90 ? 'var(--ok)'
    : t.preventivo.pct >= 70 ? 'var(--warn)' : 'var(--crit)';

  return (
    <div className="page">
      {/* Recortado en el bloque 78 para hacer sitio a los tramos de la avería
          y a los dos indicadores nuevos. La regla del «sin datos» no se pierde:
          se sigue APLICANDO en cada indicador, y cada uno dice el suyo en su
          propio aviso, que es donde de verdad hace falta leerla. */}
      {/* RECORTADO EN EL BLOQUE 84, y el verificador de densidad tenía razón:
          la sección nueva de comparación subió la pantalla a 175 palabras con
          tope 174. Se recorta donde sobra SABOR, no donde hay información —
          subir la línea base es la salida fácil y falsa.

          Lo que se va: la frase de «los números que se llevan a un comité»,
          que es una declaración de intenciones, no un dato. Lo que se queda:
          la regla del «sin datos», porque explica algo que se ve en pantalla
          y sin ella un hueco parece un fallo. */}
      <div className="card explica">
        Donde no hay muestra suficiente dice <b>«sin datos»</b>, nunca cero.
      </div>

      <div className="filters">
        <div><label>Periodo
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
            <option value={180}>Últimos 6 meses</option>
            <option value={365}>Último año</option>
          </select>
          </label></div>
        <div><label>Tren
            <select value={tren} onChange={(e) => setTren(e.target.value)}>
            <option value="">Toda la planta</option>
            {['T1', 'T2', 'T3'].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          </label></div>
        {/* DESCARGA EN EXCEL — bloque 84.
            Petición del usuario. Se eligió Excel y no Power BI porque la planta
            ya trabaja en Excel —el ingeniero entregó sus hojas de ruta en un
            .xlsx de SAP— y porque Power BI abre un .xlsx sin problema: el Excel
            sirve para los dos caminos, el .pbix sólo para uno.

            Se lleva EL MISMO periodo y el mismo tren que hay en pantalla. Un
            botón que descargue otra cosa distinta de lo que se está mirando es
            la forma más rápida de llevar al comité el número que no toca. */}
        <div className="filtro-accion">
          <button className="btn-primary" onClick={descargar} disabled={bajando}>
            <Icono n="exportar" size={14} />
            {bajando ? ' Preparando…' : ' Descargar en Excel'}
          </button>
        </div>
      </div>

      {/* ==========================================================
           ④ EJECUCIÓN — LOS CUATRO KPI DE LA HOJA DEL INGENIERO
           ----------------------------------------------------------
           Él los dibujó JUNTOS y en este orden, bajo el título
           «Ejecución»:

               KPIs (Backlog)
               % cumplimiento MP
               Nivel de servicio
               Cumplimiento de Normativa

           Estaban repartidos por la pantalla —el backlog abajo del
           todo, el cumplimiento en otra tarjeta—, así que había que
           recorrerla entera para responder una sola pregunta.

           Se agrupan porque en su cabeza son UN paso del ciclo, no
           cuatro números sueltos. Los de fiabilidad (MTTR, MTBF)
           siguen debajo: son el detalle de por qué salen así.
           ========================================================== */}
      <div className="section-title">Ejecución · los cuatro indicadores</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Indicador
          titulo="Backlog"
          valor={t.backlog?.total ?? null} unidad=""
          explica="Órdenes abiertas esperando. Si crece, el equipo no da abasto."
          aviso="No hay ninguna orden abierta."
        />
        <Indicador
          titulo="Cumplimiento del MP"
          valor={t.preventivo.pct} unidad="%"
          color={cumpColor}
          comp={t.comparativa?.preventivo}
          explica="Rutinas preventivas cerradas ANTES de su fecha."
          aviso="Todavía no se ha cerrado ninguna rutina con fecha programada."
        />
        <Indicador
          titulo="Nivel de servicio"
          valor={t.nivelDeServicio?.pct ?? null} unidad="%"
          color={nsColor}
          comp={t.comparativa?.nivelDeServicio}
          explica="De las órdenes con plazo, cuántas se atendieron dentro de él."
          aviso="Todavía no hay órdenes con fecha programada que juzgar."
        />
        <Indicador
          titulo="Cumplimiento normativo"
          valor={t.cumplimiento?.pct ?? null} unidad="%"
          explica="De las reglas que el sistema exige, cuántas se cumplen."
          aviso="Todavía no hay nada cargado a lo que aplicarle las reglas."
        />
      </div>

      <div className="section-title">Fiabilidad</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        <Indicador
          titulo="MTTR · tiempo de reparación"
          valor={t.mttr.horas} unidad="h"
          comp={t.comparativa?.mttr}
          explica={t.mttr.significa}
          aviso="Todavía no hay ninguna orden correctiva cerrada en el periodo."
        />
        <Indicador
          titulo="MTBF · entre averías"
          valor={t.mtbf.horas} unidad="h"
          comp={t.comparativa?.mtbf}
          explica={t.mtbf.significa}
          aviso={t.mtbf.sinDatos}
        />
        <Indicador
          titulo="Disponibilidad"
          valor={t.disponibilidad.pct} unidad="%"
          color={dispColor}
          comp={t.comparativa?.disponibilidad}
          explica={t.disponibilidad.significa}
          aviso="Hace falta el MTTR y el MTBF para poder calcularla."
        />
      </div>

      {/* EL TAMAÑO DE LA MUESTRA ANTERIOR, DICHO.
          Con quince órdenes detrás una flecha verde no significa nada, y estos
          números van a un comité. Callarlo convertiría el ruido de dos meses
          flojos en una conclusión. */}
      {t.comparativa && (
        <p className="kpi-pie">
          Las flechas comparan con los {dias} días anteriores
          ({t.comparativa.muestraAnterior} órdenes).
        </p>
      )}

      {/* ==========================================================
           NIVEL DE SERVICIO — indicador ④ del ingeniero (bloque 79)
           ----------------------------------------------------------
           Lo que preguntó él, textual: «las órdenes de mantenimiento
           ATENDIDAS». Yo lo había hecho como disponibilidad de
           cámaras, que es otra cosa.

           EL QUESITO Y EL NÚMERO VAN JUNTOS, y no es adorno: el
           porcentaje solo dice cómo vamos, y el quesito dice POR QUÉ
           —si lo que falta está tarde o está sin tocar—, que es lo que
           decide qué hacer mañana.
           ========================================================== */}
      {t.nivelDeServicio && (
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>
            Nivel de servicio · órdenes atendidas
          </div>

          {t.nivelDeServicio.pct === null ? (
            /* `null`, no 0 %. Un cero se leería como «no atendemos nada»
               cuando lo que pasa es que no hay órdenes con fecha. */
            <p className="nada-que-hacer">
              Todavía no hay órdenes con fecha programada que juzgar.
            </p>
          ) : (
            <div className="ns-fila">
              <div className="ns-numero">
                <div className="ns-pct" style={{ color: nsColor }}>
                  {t.nivelDeServicio.pct}<span className="ns-u">%</span>
                </div>
                <div className="ns-sub">
                  {t.nivelDeServicio.aTiempo} de {t.nivelDeServicio.conPlazo} órdenes
                  atendidas dentro de plazo
                </div>
                {/* Las que no se pueden juzgar se DICEN, no se esconden: si
                    fueran la mitad, el porcentaje de al lado valdría poco. */}
                {t.nivelDeServicio.sinPlazo > 0 && (
                  <div className="ns-nota">
                    {t.nivelDeServicio.sinPlazo} orden(es) sin fecha programada
                    quedan fuera: sin plazo no hay forma de decir si llegó a tiempo.
                  </div>
                )}
              </div>

              <div className="ns-quesito">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'A tiempo', value: t.nivelDeServicio.aTiempo, c: '#15803d' },
                        { name: 'Tarde', value: t.nivelDeServicio.tarde, c: '#b45309' },
                        { name: 'Pendientes', value: t.nivelDeServicio.pendientes, c: '#c0392b' },
                      ].filter((x) => x.value > 0)}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={72}
                      label
                    >
                      {[
                        { c: '#15803d', v: t.nivelDeServicio.aTiempo },
                        { c: '#b45309', v: t.nivelDeServicio.tarde },
                        { c: '#c0392b', v: t.nivelDeServicio.pendientes },
                      ].filter((x) => x.v > 0).map((x, i) => <Cell key={i} fill={x.c} />)}
                    </Pie>
                    {/* El `formatter` NO es opcional: sin él la etiqueta dice
                        «value : 3», que es el nombre interno de la columna.
                        Lo caza `verificar:graficos` desde el bloque 64. */}
                    <Tooltip formatter={(v: any, n: any) => [`${v} orden(es)`, String(n)]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            Atendida = cerrada antes de su fecha.
          </p>
        </div>
      )}

      {/* ==========================================================
           LOS TRES TRAMOS, CADA UNO CON SU DUEÑO — bloque 78
           ----------------------------------------------------------
           El MTTR de arriba mide de «orden abierta» a «orden cerrada»,
           y eso mezcla tres cosas con tres responsables distintos.

           Una cámara que se apaga a las 3 y se repara a las 11 daría
           8 horas ahí arriba, con 7 que no son de mantenimiento: 5 de
           enterarse y 2 de organizarse.

           Se enseñan los cuatro números juntos porque separados no
           dicen nada: lo que informa es la COMPARACIÓN entre ellos.
           ========================================================== */}
      {t.fiabilidad && (
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>
            Dónde se va el tiempo cuando algo falla
          </div>

          {/* La muestra va PRIMERO. Con cuatro averías registradas ningún
              número significa nada, y hay que poder decirlo antes de pintar
              una cifra grande que se va a copiar a una diapositiva. */}
          {t.fiabilidad.muestra.aviso && (
            <div className="fi-aviso">{t.fiabilidad.muestra.aviso}</div>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            {t.fiabilidad.muestra.total} avería(s) medidas
            {t.fiabilidad.muestra.sinHoraRealDeCaida > 0
              && ` · ${t.fiabilidad.muestra.sinHoraRealDeCaida} sin hora real de caída`}
            {t.fiabilidad.muestra.falsasAlarmas > 0
              && ` · ${t.fiabilidad.muestra.falsasAlarmas} falsa(s) alarma(s), descartadas`}
          </p>

          <div className="fi-tramos">
            {[
              { k: 'deteccion', et: 'Enterarnos', c: '#b45309' },
              { k: 'respuesta', et: 'Llegar', c: '#7c3aed' },
              { k: 'reparacion', et: 'Reparar', c: '#15803d' },
              { k: 'sinServicio', et: 'Sin ver (total)', c: '#c0392b' },
            ].map((x) => {
              const d = (t.fiabilidad as any)[x.k];
              return (
                <div key={x.k} className="fi-tramo" style={{ borderColor: x.c }}>
                  <div className="fi-et">{x.et}</div>
                  <div className="fi-valor" style={{ color: x.c }}>
                    {d.horas === null ? '—' : `${d.horas} h`}
                  </div>
                  <div className="fi-dueno">{d.dueno}</div>
                  <div className="fi-muestra">
                    {d.muestra === 0 ? 'sin datos' : `${d.muestra} avería(s)`}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
El MTTR de mantenimiento es <b>Reparar</b>.
          </p>
        </div>
      )}

      {/* ==========================================================
           NIVEL DE SERVICIO Y CUMPLIMIENTO — indicadores ④ y ⑤
           ========================================================== */}
      {t.fiabilidad && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 14 }}>
          <Indicador
            titulo="Vigilancia disponible"
            valor={t.fiabilidad.vigilanciaDisponible.pct} unidad="%"
            explica={t.fiabilidad.vigilanciaDisponible.significa}
            aviso="Hace falta al menos una cámara en servicio para poder calcularlo."
          />
        </div>
      )}

      {/* Lo que NO podríamos enseñar. Va en lista y no en un porcentaje
          porque un «85 %» no dice qué hacer; la lista sí. */}
      {t.cumplimiento?.hallazgos?.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>
            Lo que no podríamos enseñar en una auditoría
          </div>
          <table className="tabla">
            <thead>
              <tr><th>Falta</th><th>Cuántos</th><th>Dónde se arregla</th></tr>
            </thead>
            <tbody>
              {t.cumplimiento.hallazgos.map((h: any) => (
                <tr key={h.regla}>
                  <td>
                    <b>{h.exige}</b>
                    <div className="muted" style={{ fontSize: 11 }}>{h.porque}</div>
                  </td>
                  <td className="num">{h.cuantos} de {h.deTotal}</td>
                  <td>
                    {h.donde}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {h.ejemplos.slice(0, 3).join(', ')}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ==========================================================
           EL REPARTO DEL TRABAJO — bloque 65
           ----------------------------------------------------------
           El indicador que el ingeniero dibujó en el centro de su
           hoja, y el único que no existía. El MTTR dice cómo de
           rápido se repara; éste dice si hace falta reparar tanto.

           Va ANTES del backlog a propósito: es la foto de la
           estrategia, y el backlog es una consecuencia suya.
           ========================================================== */}
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>Reparto del trabajo</div>

        {t.reparto?.pct ? (
          <>
            <div className="reparto-barra">
              {[
                { k: 'correctivo' as const, et: 'Correctivo', c: '#c0392b' },
                { k: 'preventivo' as const, et: 'Preventivo', c: '#15803d' },
              ].filter((x) => t.reparto.pct[x.k] > 0).map((x) => (
                <div key={x.k} className="reparto-tramo"
                  style={{ width: `${t.reparto.pct[x.k]}%`, background: x.c }}
                  title={`${x.et}: ${t.reparto[x.k]} órdenes`}>
                  {t.reparto.pct[x.k] >= 12 ? `${t.reparto.pct[x.k]} %` : ''}
                </div>
              ))}
            </div>

            <div className="reparto-leyenda">
              <span><i style={{ background: '#c0392b' }} /> Correctivo · {t.reparto.correctivo}</span>
              <span><i style={{ background: '#15803d' }} /> Preventivo · {t.reparto.preventivo}</span>
            </div>

            {/* EL QUESITO Y LA META, COMO LOS DIBUJÓ EL INGENIERO.
                -----------------------------------------------------
                En su hoja hay DOS ruedas con una flecha en medio: la de
                ahora y a dónde quiere llegar. Ésa es toda la idea del
                indicador — no el número de hoy, sino la distancia que
                falta.

                La barra de arriba se queda: en el móvil un quesito de
                tres porciones no se lee, y la barra sí. */}
            <div className="rep-ruedas">
              <div className="rep-rueda">
                <div className="rep-tit">Ahora</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Correctivo', value: t.reparto.pct.correctivo },
                        { name: 'Preventivo', value: t.reparto.pct.preventivo },
                      ].filter((x) => x.value > 0)}
                      dataKey="value" nameKey="name" outerRadius={62} label
                    >
                      {['#c0392b', '#15803d']
                        .filter((_, i) => [t.reparto.pct.correctivo,
                          t.reparto.pct.preventivo][i] > 0)
                        .map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [`${v} %`, String(n)]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="rep-flecha">→</div>

              <div className="rep-rueda">
                <div className="rep-tit">A dónde ir</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Correctivo', value: meta?.valores?.correctivoPct ?? 30 },
                        { name: 'Preventivo', value: meta?.valores?.preventivoPct ?? 70 },
                      ]}
                      dataKey="value" nameKey="name" outerRadius={62} label
                    >
                      {['#c0392b', '#15803d'].map((c, i) => (
                        <Cell key={i} fill={c} fillOpacity={0.45} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [`${v} %`, String(n)]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <MetaDelReparto
              meta={meta}
              editando={editaMeta}
              onEditar={() => setEditaMeta(true)}
              onCerrar={() => setEditaMeta(false)}
              onGuardada={(m: any) => { setMeta(m); setEditaMeta(false); }}
            />

            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              {t.reparto.lectura}
            </p>

            {(t.reparto.otros.mejora > 0 || t.reparto.otros.mapeo > 0
              || t.reparto.otros.predictivo > 0) && (
              <p className="muted" style={{ fontSize: 11.5 }}>
                Fuera del reparto: {t.reparto.otros.mejora} de mejora,{' '}
                {t.reparto.otros.mapeo} de mapeo
                {t.reparto.otros.predictivo > 0
                  && ` y ${t.reparto.otros.predictivo} predictivas (tipo retirado)`}.
              </p>
            )}
          </>
        ) : (
          <p className="muted" style={{ fontSize: 12.5 }}>
            {t.reparto?.lectura || 'Sin órdenes en el periodo.'}
          </p>
        )}
      </div>

      {/* ---------- BACKLOG ---------- */}
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>Trabajo pendiente acumulado</div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <div><b style={{ fontSize: 30 }}>{t.backlog.total}</b>
            <div className="muted" style={{ fontSize: 12 }}>órdenes abiertas</div></div>
          <div><b style={{ fontSize: 30 }}>{t.backlog.antiguedadMediaDias}</b>
            <div className="muted" style={{ fontSize: 12 }}>días de antigüedad media</div></div>
          <div><b style={{ fontSize: 30, color: t.backlog.masDe90 ? 'var(--crit)' : undefined }}>{t.backlog.masAntiguaDias}</b>
            <div className="muted" style={{ fontSize: 12 }}>días la más antigua</div></div>
        </div>

        <div style={{ display: 'flex', height: 26, borderRadius: 7, overflow: 'hidden', marginTop: 14, border: '1px solid var(--border)' }}>
          {[
            { n: t.backlog.hasta7, c: '#bfe9cf', t: 'menos de 1 semana' },
            { n: t.backlog.de8a30, c: '#cfe0f7', t: '1 a 4 semanas' },
            { n: t.backlog.de31a90, c: '#f6d3ba', t: '1 a 3 meses' },
            { n: t.backlog.masDe90, c: '#f6c9c9', t: 'más de 3 meses' },
          ].filter((x) => x.n > 0).map((x) => (
            <div key={x.t} title={`${x.n} — ${x.t}`}
              style={{ flex: x.n, background: x.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700 }}>
              {x.n}
            </div>
          ))}
          {t.backlog.total === 0 && (
            <div style={{ flex: 1, background: '#e7f7ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
              nada pendiente
            </div>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>
          {/* Recortado en el bloque 79 para hacer sitio a los cuatro KPI de la
              hoja del ingeniero. La idea se mantiene entera: lo que importa es
              la antigüedad, no el total. */}
          <b>Un backlog estable es normal</b>; uno que envejece dice que el
          equipo no da abasto.
          {t.backlog.masDe90 > 0 && (
            <> Hay <b>{t.backlog.masDe90}</b> de más de tres meses.
          </>
          )}
        </div>
        {t.preventivo.pendientesVencidas > 0 && (
          <div className="card peligro" style={{ marginTop: 12 }}>
            <b>{t.preventivo.pendientesVencidas} rutina(s) preventiva(s) vencida(s) y sin cerrar.</b>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              Se convierte en correctivo en dos meses.
            </div>
          </div>
        )}
      </div>

      {/* ---------- PEORES EQUIPOS ---------- */}
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>Los que más problemas dan</div>
        {t.peores.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            Ningún equipo con averías registradas en el periodo.
          </p>
        ) : (
          <>
            <table className="tabla">
              <thead><tr><th>Equipo</th><th>Tipo</th><th>Dónde</th>
                <th className="num">Averías</th><th className="num">Tiempo medio</th><th></th></tr></thead>
              <tbody>
                {t.peores.map((p: any) => (
                  <tr key={p.assetId}>
                    <td><strong>{p.assetCode}</strong></td>
                    <td>{p.tipo || '—'}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{p.lugar || '—'}</td>
                    <td className="num"><b style={{ color: p.fallos >= 4 ? 'var(--crit)' : undefined }}>{p.fallos}</b></td>
                    <td className="num">{p.mttrHoras !== null ? `${p.mttrHoras} h` : <span className="muted">abierta</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-mini" onClick={() => nav(`/assets?q=${encodeURIComponent(p.assetCode)}`)}>Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
              Tres periodos seguidos arriba justifica el reemplazo.
            </div>
          </>
        )}
      </div>

      {/* ---------- TENDENCIA ---------- */}
      {tend.length > 1 && (
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>Cómo viene evolucionando</div>
          <table className="tabla">
            <thead><tr><th>Mes</th><th className="num">Correctivas</th><th className="num">Preventivas</th>
              <th className="num">MTTR</th><th className="num">Cumplimiento</th><th className="num">Disponibilidad</th></tr></thead>
            <tbody>
              {tend.map((m: any) => (
                <tr key={m.mes}>
                  <td><strong>{m.mes}</strong></td>
                  <td className="num">{m.correctivas}</td>
                  <td className="num">{m.preventivas}</td>
                  <td className="num">{m.mttrHoras !== null ? `${m.mttrHoras} h` : <span className="muted">—</span>}</td>
                  <td className="num">{m.cumplimientoPct !== null ? `${m.cumplimientoPct}%` : <span className="muted">—</span>}</td>
                  <td className="num">{m.disponibilidadPct !== null ? `${m.disponibilidadPct}%` : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            La columna completa dice si el mantenimiento mejora; un número suelto no.
          </div>
        </div>
      )}
    </div>
  );
}
