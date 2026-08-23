import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useVolverALaPantalla } from '../useVolverALaPantalla';
import { Accion, Cifras, LoQueHayQueHacer, Titular, Tono } from '../components/Patron';
import { fecha, plural } from '../formato';

/**
 * ESTADO POR TREN — tablero de INFRAESTRUCTURA.
 *
 * QUÉ CAMBIÓ RESPECTO A LA VERSIÓN ANTERIOR
 *
 * 1) LOS TRENES YA NO ESTÁN ESCRITOS EN EL CÓDIGO.
 *    Antes había una lista fija con TREN_1, TREN_2, TREN_3, PATIO,
 *    PLANTA_GENERAL y SIN_ASIGNAR. Ahora se piden al servidor, que los saca del
 *    árbol de ubicaciones. Si mañana existe un Tren 4, aparece solo.
 *
 * 2) "SIN_ASIGNAR" DEJA DE SER UN TREN.
 *    Era un cuarto tren fantasma que en Laminación no existe. Los activos que
 *    no cuelgan del árbol son TRABAJO PENDIENTE, y salen como un aviso arriba
 *    con su lista y el motivo de cada fila.
 *
 * 3) ES DE INFRAESTRUCTURA, NO SOLO DE MANTENIMIENTO.
 *    Antes mostraba cámaras, incidencias y OM. Ahora también gabinetes,
 *    cableado con sus metros y tramos fuera de norma, canales de grabador
 *    libres, avance del mapeo y accesos pendientes.
 *
 * 4) LOS NÚMEROS SE PUEDEN ABRIR.
 *    Un indicador que no lleva a ningún sitio no sirve para trabajar: ves
 *    "3 tramos fuera de norma" y no puedes saber cuáles. Cada tarjeta abre su
 *    lista.
 */

const TYPE_ES: Record<string, string> = {
  CAMERA: 'Cámara', NVR: 'Grabador', SWITCH: 'Switch', WIRELESS: 'Enlace', ROUTER: 'Router',
  FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', FIBER: 'Fibra', CABINET: 'Gabinete',
  DECODER: 'Decodificador', SCREEN: 'Pantalla', PC: 'PC / iVMS', OTHER: 'Otro',
};
const STATUS_ES: Record<string, string> = {
  OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento',
  CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock',
};

/* =============================================================================
   BLOQUE 38 — EL TITULAR DEL TREN
   -----------------------------------------------------------------------------
   Antes esta pantalla abría con un semáforo grande («Operación normal») y
   OCHO tarjetas de indicador. Ocho números a la vez no se leen: se miran por
   encima y no se actúa sobre ninguno. Ése era el mareo.

   Ahora arriba va UNA frase que responde «¿tengo que moverme?», debajo la
   lista corta de lo que hay que hacer, y los ocho indicadores se quedan —son
   útiles, cada uno abre su lista— pero por debajo, como explorador.

   POR QUÉ EL TITULAR SE ARMA AQUÍ Y NO EN EL BACKEND
   En Cobertura lo redacta el servidor, y es lo correcto: esa frase también
   sale en el PDF y en el aviso de Telegram, así que tiene que decir lo mismo
   en los tres sitios. Ésta no sale en ningún otro sitio; es un resumen de
   pantalla. Meterla en el backend obligaría a un endpoint nuevo para algo que
   sólo se lee aquí.
   ============================================================================= */
function titularDelTren(r: any): { tono: Tono; texto: string; apoyo: string } {
  if (!r || r.total === 0) {
    return {
      tono: 'sindatos',
      texto: 'Este tren todavía no tiene equipos en el árbol',
      apoyo: 'No es que esté mal: es que falta cargarlo. Hasta entonces no hay nada que medir.',
    };
  }

  /* El orden importa: se informa de lo más grave que haya, no de todo a la
     vez. Un titular que enumera cinco cosas vuelve a ser una lista. */
  const graves: string[] = [];
  if (r.camarasCaidas) graves.push(`${r.camarasCaidas} ${r.camarasCaidas === 1 ? 'cámara' : 'cámaras'} sin imagen`);
  if (r.incidenciasCriticas) graves.push(`${r.incidenciasCriticas} ${r.incidenciasCriticas === 1 ? 'incidencia crítica' : 'incidencias críticas'}`);
  if (r.omVencidas) graves.push(`${r.omVencidas} ${r.omVencidas === 1 ? 'orden vencida' : 'órdenes vencidas'}`);

  if (graves.length) {
    return {
      tono: r.camarasCaidas || r.incidenciasCriticas ? 'grave' : 'atender',
      texto: graves.join(' · '),
      apoyo: `${r.operativos} de ${r.enOperacion} equipos funcionando con normalidad (${r.disponibilidad} %).`,
    };
  }

  if (r.omAbiertas || r.accesosPendientes) {
    return {
      tono: 'atender',
      texto: 'Sin fallas, con trabajo en curso',
      apoyo: `${r.omAbiertas} ${r.omAbiertas === 1 ? 'orden abierta' : 'órdenes abiertas'} dentro de plazo`
        + (r.accesosPendientes ? ` · ${r.accesosPendientes} acceso(s) por aprobar` : '') + '.',
    };
  }

  return {
    tono: 'bien',
    texto: 'El tren está entero',
    apoyo: `${r.operativos} de ${r.enOperacion} equipos operativos. Ninguna falla, ninguna orden vencida.`,
  };
}

type Vista =
  | 'atencion' | 'etapas' | 'cableado' | 'grabadores'
  | 'gabinetes' | 'trabajos' | 'incidencias' | 'accesos';

export default function TrainBoard() {
  const [trenes, setTrenes] = useState<any[]>([]);
  const [sinUbicar, setSinUbicar] = useState<any>(null);
  const [code, setCode] = useState<string>('');
  const [d, setD] = useState<any>(null);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [vista, setVista] = useState<Vista>('atencion');
  const [verSinUbicar, setVerSinUbicar] = useState(false);
  const [listaSinUbicar, setListaSinUbicar] = useState<any>(null);

  // Los trenes se piden UNA vez: el árbol no cambia mientras miras el tablero.
  useEffect(() => {
    api.get('/dashboard/infra/trenes')
      .then((r) => {
        setTrenes(r.data?.trenes || []);
        setSinUbicar(r.data?.sinUbicar || null);
        if (r.data?.trenes?.length) setCode(r.data.trenes[0].code);
      })
      .catch(() => setTrenes([]))
      .finally(() => setCargandoLista(false));
  }, []);

  const cargarDetalle = useCallback(async () => {
    if (!code) return;
    setCargandoDetalle(true);
    try {
      const r = await api.get('/dashboard/infra/tren/' + encodeURIComponent(code));
      setD(r.data);
    } catch {
      setD(null);
    } finally {
      setCargandoDetalle(false);
    }
  }, [code]);

  useEffect(() => { cargarDetalle(); }, [cargarDetalle]);

  /* Bloque 37: con dos o tres órdenes vivas, este tablero se queda viejo. Al
     volver a la pantalla se recarga el tren que se está mirando. */
  useVolverALaPantalla(cargarDetalle);

  async function abrirSinUbicar() {
    setVerSinUbicar(true);
    if (!listaSinUbicar) {
      const r = await api.get('/dashboard/infra/sin-ubicar').then((x) => x.data).catch(() => null);
      setListaSinUbicar(r);
    }
  }

  if (cargandoLista) return <div className="loading">Cargando los trenes…</div>;

  if (!trenes.length) {
    return (
      <div>
        <h1 className="page-title">Estado por Tren</h1>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)' }}>
            No hay trenes en el árbol de ubicaciones
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            Los trenes ya no están escritos en el código: son las ubicaciones de
            tipo <b>TREN</b>. Créalos en <b>Ubicaciones</b> y aparecerán aquí solos.
            <br />Se hizo así a propósito: tú decides cómo se llaman.
          </div>
        </div>
      </div>
    );
  }

  const r = d?.resumen;
  const cab = r?.cableado;
  const can = r?.canales;
  const tit = titularDelTren(r);

  /* LO QUE HAY QUE HACER, ordenado por lo que duele.
     -------------------------------------------------------------------------
     Cada fila lleva a la vista que ya existe, así que pulsar en «2 cámaras sin
     imagen» deja delante esas dos. Antes había que leer los ocho indicadores,
     encontrar el que estaba en rojo y pulsarlo.

     Se construye a mano y no con un bucle sobre los indicadores a propósito:
     no todo indicador es una tarea. «Gabinetes: 12» no hay que hacer nada con
     ello; «3 gabinetes sin foto», sí. */
  const pendientes: Accion[] = [];
  const suma = (cond: any, marca: string, tono: Tono, texto: string, vista: Vista) => {
    if (cond) pendientes.push({ id: vista + texto, marca, tono, texto, alPulsar: () => setVista(vista) });
  };
  if (r) {
    suma(r.camarasCaidas, String(r.camarasCaidas), 'grave',
      r.camarasCaidas === 1 ? 'cámara sin imagen' : 'cámaras sin imagen', 'atencion');
    suma(r.incidenciasCriticas, String(r.incidenciasCriticas), 'grave',
      r.incidenciasCriticas === 1 ? 'incidencia crítica' : 'incidencias críticas', 'incidencias');
    suma(r.omVencidas, String(r.omVencidas), 'grave',
      r.omVencidas === 1 ? 'orden fuera de plazo' : 'órdenes fuera de plazo', 'trabajos');
    suma(cab?.fueraNorma, String(cab?.fueraNorma), 'atender',
      `tramos sobre ${d.limiteTramoM} m`, 'cableado');
    suma(can?.sobreasignados, String(can?.sobreasignados), 'atender',
      'grabadores sobreasignados', 'grabadores');
    suma(r.accesosPendientes, String(r.accesosPendientes), 'atender',
      r.accesosPendientes === 1 ? 'acceso por aprobar' : 'accesos por aprobar', 'accesos');
    suma(r.gabinetes?.sinFoto, String(r.gabinetes?.sinFoto), 'sindatos',
      r.gabinetes?.sinFoto === 1 ? 'gabinete sin foto' : 'gabinetes sin foto', 'gabinetes');
  }

  return (
    <div>
      <h1 className="page-title">Estado por Tren</h1>
      <p className="page-sub">
        Infraestructura de videovigilancia y red de cada tren de Laminación
      </p>

      {/* ------------------------------------------------ aviso fuera del árbol */}
      {!!sinUbicar?.activos && (
        <div
          onClick={abrirSinUbicar}
          style={{
            background: '#fff4e5', border: '1px solid #f5dcb0', borderLeft: '4px solid var(--warn)',
            borderRadius: 8, padding: '10px 14px', marginTop: 14, cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          }}
        >
          <div style={{ fontSize: 13 }}>
            <b>{plural(sinUbicar.activos, 'activo')} fuera del árbol.</b>{' '}
            <span className="muted">
              No cuelgan de ningún tren, así que no cuentan en ninguna pestaña.
              No es un cuarto tren: es mapeo pendiente.
            </span>
          </div>
          <button className="btn-mini">Ver cuáles</button>
        </div>
      )}

      {/* --------------------------------------------------- selector de trenes */}
      <div className="train-tabs">
        {trenes.map((t) => (
          <button
            key={t.code}
            className={'train-tab' + (code === t.code && !verSinUbicar ? ' active' : '')}
            onClick={() => { setCode(t.code); setVerSinUbicar(false); }}
          >
            {t.nombre}
            <span style={{ opacity: 0.6, marginLeft: 6, fontSize: 11 }}>
              {t.activos.total}
            </span>
          </button>
        ))}
      </div>

      {/* ------------------------------------------------ lista de sin ubicar */}
      {verSinUbicar ? (
        <div className="panel">
          <h3>Activos que no cuelgan de ningún tren</h3>
          <div className="sign-note" style={{ marginBottom: 12 }}>
            Son dos problemas distintos y se arreglan distinto: los que no tienen
            ubicación hay que ubicarlos; los que sí la tienen, lo que falta es
            colgar esa ubicación del tren que le toca en el árbol.
          </div>
          {!listaSinUbicar ? (
            <div className="loading">Cargando…</div>
          ) : (
            <table>
              <thead><tr><th>Código</th><th>Tipo</th><th>Ubicación</th><th>Qué falta</th></tr></thead>
              <tbody>
                {listaSinUbicar.filas?.map((f: any) => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 600 }}>{f.assetCode}</td>
                    <td className="muted">{TYPE_ES[f.type] || f.type}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{f.ubicacion || '—'}</td>
                    <td style={{ fontSize: 12 }}>{f.motivo}</td>
                  </tr>
                ))}
                {!listaSinUbicar.filas?.length && (
                  <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                    Ninguno. Todo está colgado del árbol.
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
          <button className="btn" style={{ marginTop: 12 }} onClick={() => setVerSinUbicar(false)}>
            Volver al tren
          </button>
        </div>
      ) : cargandoDetalle ? (
        <div className="loading">Cargando el tren…</div>
      ) : !d ? (
        <div className="card" style={{ padding: 30, textAlign: 'center' }}>
          <div className="muted">No se pudo cargar este tren.</div>
        </div>
      ) : (
        <>
          {/* -------- 1. LA RESPUESTA (bloque 38) -------- */}
          <Titular tono={tit.tono} texto={tit.texto} apoyo={tit.apoyo} />

          {/* -------- 2. LO QUE HAY QUE HACER -------- */}
          <LoQueHayQueHacer
            acciones={pendientes}
            vacio={r.total > 0 ? 'Nada pendiente en este tren.' : undefined}
          />

          {/* -------- 3. LOS NÚMEROS, EN UNA LÍNEA --------
              La disponibilidad estaba en un bloque enorme al lado del
              semáforo. Es un dato de contexto, no la respuesta: aquí va donde
              le toca, en la línea de cifras. */}
          {r.total > 0 && (
            <Cifras
              datos={[
                { n: r.disponibilidad, et: '% disponibilidad' },
                { n: r.operativos, de: r.enOperacion, et: 'operativos' },
                { n: r.avanceMapeoPct, et: '% mapeado' },
              ]}
            />
          )}

          {/* -------- 4. EL EXPLORADOR --------
              Los ocho indicadores se quedan: cada uno abre su lista y eso es
              lo que hace que la pantalla sirva para trabajar. Lo que cambia es
              que ya no son lo PRIMERO que se ve. */}
          <div className="bloque-titulo">Explorar el tren</div>
          <div className="kpi-grid">
            <Kpi label="Cámaras funcionando" value={`${r.camaras - r.camarasCaidas}/${r.camaras}`}
                 cls={r.camarasCaidas ? 'warn' : 'ok'}
                 hint={r.camarasCaidas ? `${r.camarasCaidas} sin imagen o con falla` : 'Todas operativas'}
                 onClick={() => setVista('atencion')} />

            <Kpi label="Avance del mapeo" value={`${r.avanceMapeoPct}%`}
                 cls={r.avanceMapeoPct >= 90 ? 'ok' : r.avanceMapeoPct >= 40 ? 'warn' : 'crit'}
                 hint={`${r.fichasCompletas} de ${r.total} fichas completas`}
                 onClick={() => setVista('etapas')} />

            <Kpi label={`Tramos sobre ${d.limiteTramoM} m`} value={cab?.fueraNorma ?? 0}
                 cls={cab?.fueraNorma ? 'crit' : 'ok'}
                 hint={cab?.fueraNorma
                   ? `${cab.fueraNormaMedidos} medidos de verdad`
                   : `${cab?.tramos ?? 0} tramos, ${cab?.metros ?? 0} m`}
                 onClick={() => setVista('cableado')} />

            <Kpi label="Canales libres" value={can?.canalesLibres ?? 0}
                 cls={can?.sobreasignados ? 'crit' : 'ok'}
                 hint={can?.sinCapacidadDeclarada
                   ? `${can.sinCapacidadDeclarada} grabador(es) sin capacidad declarada`
                   : `${can?.canalesOcupados ?? 0} ocupados de ${can?.canalesTotales ?? 0}`}
                 onClick={() => setVista('grabadores')} />

            <Kpi label="Gabinetes" value={r.gabinetes?.total ?? 0}
                 cls={r.gabinetes?.sinFoto ? 'warn' : 'ok'}
                 hint={r.gabinetes?.sinFoto ? `${r.gabinetes.sinFoto} sin foto` : 'Todos con foto'}
                 onClick={() => setVista('gabinetes')} />

            <Kpi label="Trabajos pendientes" value={r.omAbiertas}
                 cls={r.omVencidas ? 'crit' : r.omAbiertas ? 'warn' : 'ok'}
                 hint={r.omVencidas ? `${r.omVencidas} fuera de plazo` : 'Dentro de plazo'}
                 onClick={() => setVista('trabajos')} />

            <Kpi label="Incidencias abiertas" value={r.incidenciasAbiertas}
                 cls={r.incidenciasCriticas ? 'crit' : r.incidenciasAbiertas ? 'warn' : 'ok'}
                 hint={r.incidenciasCriticas ? `${r.incidenciasCriticas} de prioridad alta` : 'Sin urgencias'}
                 onClick={() => setVista('incidencias')} />

            <Kpi label="Accesos por aprobar" value={r.accesosPendientes}
                 cls={r.accesosPendientes ? 'warn' : 'ok'}
                 hint={r.accesosPendientes ? 'Sin esto no se sube al tren' : 'Nada pendiente'}
                 onClick={() => setVista('accesos')} />
          </div>

          {/* --------------------------------------------------- barra de estado */}
          {r.enOperacion > 0 && (
            <div className="panel" style={{ marginTop: 16 }}>
              <h3>Cómo están los {r.enOperacion} equipos de este tren</h3>
              <div className="stack-bar">
                <Seg n={r.operativos} tot={r.enOperacion} cls="ok" />
                <Seg n={r.enMantenimiento} tot={r.enOperacion} cls="info" />
                <Seg n={r.conIncidencia} tot={r.enOperacion} cls="warn" />
                <Seg n={r.fueraServicio} tot={r.enOperacion} cls="crit" />
              </div>
              <div className="stack-legend">
                <Leg cls="ok" n={r.operativos} t="Operativos" />
                <Leg cls="info" n={r.enMantenimiento} t="En mantenimiento" />
                <Leg cls="warn" n={r.conIncidencia} t="Con incidencia" />
                <Leg cls="crit" n={r.fueraServicio} t="Fuera de servicio" />
              </div>
              {(r.sinFoto > 0 || r.sinEtapa > 0) && (
                <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                  {r.sinFoto > 0 && <>· {r.sinFoto} sin ninguna foto cargada </>}
                  {r.sinEtapa > 0 && <>· {r.sinEtapa} sin etapa del proceso asignada</>}
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------- pestañas */}
          <div className="tabs" style={{ margin: '18px 0 14px' }}>
            <Tab v="atencion" a={vista} s={setVista} n={d.requierenAtencion?.length} t="Requieren atención" />
            <Tab v="etapas" a={vista} s={setVista} n={d.etapas?.length} t="Etapas" />
            <Tab v="cableado" a={vista} s={setVista} n={d.tramosFueraNorma?.length} t="Cableado" />
            <Tab v="grabadores" a={vista} s={setVista} n={d.grabadores?.length} t="Grabadores" />
            <Tab v="gabinetes" a={vista} s={setVista} n={d.gabinetes?.length} t="Gabinetes" />
            <Tab v="trabajos" a={vista} s={setVista} n={d.ordenes?.length} t="Trabajos" />
            <Tab v="incidencias" a={vista} s={setVista} n={d.incidencias?.length} t="Incidencias" />
            <Tab v="accesos" a={vista} s={setVista} n={d.accesos?.length} t="Accesos" />
          </div>

          {vista === 'atencion' && (
            <Tabla vacia="Nada requiere atención en este tren." filas={d.requierenAtencion}
                   cabecera={['Equipo', 'Tipo', 'Etapa', 'Ubicación', 'Criticidad', 'Estado']}
                   fila={(a: any) => [
                     <b>{a.assetCode}</b>,
                     TYPE_ES[a.type] || a.type,
                     a.etapa || '—',
                     a.ubicación || '—',
                     <span className={'badge ' + a.criticidad}>{a.criticidad}</span>,
                     <span className={'badge ' + a.estado}>{STATUS_ES[a.estado] || a.estado}</span>,
                   ]} />
          )}

          {vista === 'etapas' && (
            <div className="panel">
              <h3>Avance del mapeo por etapa del proceso</h3>
              <div className="sign-note" style={{ marginBottom: 12 }}>
                En orden del proceso, de la entrada del horno a la salida del
                producto. Una etapa al 0 % no es un error: es mapeo sin empezar.
              </div>
              {d.etapas?.map((e: any) => (
                <div key={e.code} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>
                      {e.nombre}
                      {e.code === 'SIN_ETAPA' && (
                        <span className="muted" style={{ fontWeight: 400 }}> · hay que asignarles etapa</span>
                      )}
                    </span>
                    <span className="muted">{e.completos}/{e.total} fichas · {e.avancePct}%</span>
                  </div>
                  <div className="stack-bar" style={{ height: 12 }}>
                    <Seg n={e.completos} tot={e.total} cls="ok" />
                    <Seg n={e.total - e.completos} tot={e.total} cls="warn" />
                  </div>
                </div>
              ))}
              {!d.etapas?.length && <div className="empty">Este tren no tiene activos todavía.</div>}
            </div>
          )}

          {vista === 'cableado' && (
            <>
              <div className="panel" style={{ marginBottom: 12 }}>
                <h3>Cableado de este tren</h3>
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 13 }}>
                  <Dato t="Tramos" v={cab?.tramos ?? 0} />
                  <Dato t="Metros totales" v={(cab?.metros ?? 0) + ' m'} />
                  <Dato t="Medidos" v={(cab?.metrosMedidos ?? 0) + ' m'} />
                  <Dato t="Estimados a ojo" v={(cab?.metrosEstimados ?? 0) + ' m'} />
                  <Dato t="Sin medir" v={cab?.sinMedir ?? 0} />
                  <Dato t="Sin blindaje" v={cab?.sinBlindaje ?? 0} />
                  <Dato t="Dañados" v={cab?.danados ?? 0} />
                </div>
              </div>
              <Tabla vacia={`Ningún tramo pasa de ${d.limiteTramoM} m.`} filas={d.tramosFueraNorma}
                     cabecera={['Tramo', 'Metros', 'Dato', 'Desde', 'Hasta', 'Categoría', 'Blindado']}
                     fila={(c: any) => [
                       <b>{c.code || '—'}</b>,
                       <b style={{ color: 'var(--crit)' }}>{c.metros} m</b>,
                       c.estimado
                         ? <span className="muted">estimado</span>
                         : <b>MEDIDO</b>,
                       c.desde || '—',
                       c.hasta || '—',
                       c.categoria || '—',
                       c.blindado ? 'sí' : 'no',
                     ]}
                     nota="Solo sobre un tramo MEDIDO se puede justificar un recableado: sobre un metraje estimado a ojo, lo primero es ir a medirlo." />
            </>
          )}

          {vista === 'grabadores' && (
            <Tabla vacia="Este tren no tiene grabadores registrados." filas={d.grabadores}
                   cabecera={['Grabador', 'Ubicación', 'Gabinete', 'Canales', 'Ocupados', 'Libres', 'Estado']}
                   fila={(g: any) => [
                     <b>{g.assetCode}</b>,
                     g.ubicación || g.referencia || '—',
                     g.gabinete || '—',
                     g.canales ?? <span className="muted">sin declarar</span>,
                     g.ocupados,
                     g.sobreasignado
                       ? <b style={{ color: 'var(--crit)' }}>dato mal puesto</b>
                       : g.libres == null ? <span className="muted">—</span> : <b>{g.libres}</b>,
                     <span className={'badge ' + g.estado}>{STATUS_ES[g.estado] || g.estado}</span>,
                   ]}
                   nota="Un grabador sin capacidad declarada no dice cuántos canales quedan: no se inventa. Si sale 'dato mal puesto', tiene más cámaras asignadas que canales." />
          )}

          {vista === 'gabinetes' && (
            <Tabla vacia="Ningún gabinete alberga equipos de este tren." filas={d.gabinetes}
                   cabecera={['Gabinete', 'Nombre', 'Ubicación', 'Equipos dentro', 'Foto']}
                   fila={(g: any) => [
                     <b>{g.code}</b>,
                     g.name || '—',
                     g.location?.name || '—',
                     g._count?.assets ?? 0,
                     g.photoFileId ? 'sí' : <span style={{ color: 'var(--warn)' }}>falta</span>,
                   ]} />
          )}

          {vista === 'trabajos' && (
            <Tabla vacia="Sin trabajos pendientes en este tren." filas={d.ordenes}
                   cabecera={['Orden', 'Tipo', 'Equipo', 'Actividad', 'Avance', 'Programada', 'Estado']}
                   fila={(o: any) => [
                     <b>{o.code}</b>,
                     o.type,
                     o.asset?.assetCode || '—',
                     <span style={{ fontSize: 12 }}>{o.activity || '—'}</span>,
                     (o.progressPct ?? 0) + '%',
                     fecha(o.scheduledDate),
                     o.vencida
                       ? <b style={{ color: 'var(--crit)' }}>vencida</b>
                       : <span className="muted">{o.status}</span>,
                   ]} />
          )}

          {vista === 'incidencias' && (
            <Tabla vacia="Sin incidencias abiertas en este tren." filas={d.incidencias}
                   cabecera={['Código', 'Equipo', 'Problema', 'Prioridad', 'Reportada']}
                   fila={(i: any) => [
                     <b>{i.code}</b>,
                     i.asset?.assetCode || '—',
                     <span style={{ fontSize: 12 }}>{i.title}</span>,
                     <span className={'badge ' + i.priority}>{i.priority}</span>,
                     fecha(i.reportedAt),
                   ]} />
          )}

          {vista === 'accesos' && (
            <Tabla vacia="Ningún permiso de acceso pendiente." filas={d.accesos}
                   cabecera={['Equipo', 'Estado de la solicitud']}
                   fila={(a: any) => [a.asset?.assetCode || '—', a.status]}
                   nota="Si un trabajo de este tren necesita altura o manlift y el permiso no está aprobado, el técnico se entera arriba del tren." />
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ piezas */

function Kpi({ label, value, cls, hint, onClick }: {
  label: string; value: any; cls?: string; hint?: string; onClick?: () => void;
}) {
  return (
    <div
      className={'kpi ' + (cls || '') + (onClick ? ' clicable' : '')}
      onClick={onClick}
      title={onClick ? 'Ver el detalle' : undefined}
    >
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function Tab({ v, a, s, n, t }: { v: Vista; a: Vista; s: (x: Vista) => void; n?: number; t: string }) {
  return (
    <button className={a === v ? 'tab active' : 'tab'} onClick={() => s(v)}>
      {t}{typeof n === 'number' ? ` (${n})` : ''}
    </button>
  );
}

function Dato({ t, v }: { t: string; v: any }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11 }}>{t}</div>
      <div style={{ fontWeight: 700, fontSize: 16 }}>{v}</div>
    </div>
  );
}

/** Tabla genérica: evita repetir ocho veces la misma estructura. */
function Tabla({ cabecera, filas, fila, vacia, nota }: {
  cabecera: string[];
  filas?: any[];
  fila: (x: any) => any[];
  vacia: string;
  nota?: string;
}) {
  return (
    <>
      {nota && <div className="sign-note" style={{ marginBottom: 10 }}>{nota}</div>}
      <div className="card">
        <table>
          <thead><tr>{cabecera.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {filas?.map((x: any, i: number) => (
              <tr key={x.id || i}>
                {fila(x).map((celda, j) => <td key={j}>{celda}</td>)}
              </tr>
            ))}
            {!filas?.length && (
              <tr><td colSpan={cabecera.length} className="muted" style={{ textAlign: 'center', padding: 26 }}>
                {vacia}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Seg({ n, tot, cls }: { n: number; tot: number; cls: string }) {
  if (!n || !tot) return null;
  return <span className={'seg ' + cls} style={{ width: `${(n / tot) * 100}%` }} title={`${n}`} />;
}
function Leg({ cls, n, t }: { cls: string; n: number; t: string }) {
  return (
    <span className="leg">
      <span className={'leg-dot ' + cls} />
      <b>{n}</b> {t}
    </span>
  );
}
