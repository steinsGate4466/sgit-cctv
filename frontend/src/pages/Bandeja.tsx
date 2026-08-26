import { useEffect, useState, useCallback } from 'react';
import { EsqueletoTabla } from '../components/Esqueleto';
import { NadaPendiente } from '../components/Ilustraciones';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useVolverALaPantalla } from '../useVolverALaPantalla';
import { Accion, Cifras, LoQueHayQueHacer, Titular, Tono } from '../components/Patron';
import { fecha } from '../formato';
import { fechaTabla, haceCuanto } from '../fechas';

/**
 * MI BANDEJA — lo que espera una decisión, hoy.
 *
 * POR QUÉ NO ES UN TABLERO MÁS
 * Un indicador se mira; una bandeja se VACÍA. Cada línea de aquí es algo que
 * alguien está esperando: un técnico que no puede empezar, un permiso sin el
 * que nadie sube, un repuesto que no va a estar cuando haga falta.
 *
 * Antes había que abrir cuatro pantallas y acordarse de mirarlas. Lo que no se
 * ve, no se hace.
 *
 * ORDEN DE LOS BLOQUES: primero lo que BLOQUEA a otra persona, después lo que
 * corre prisa, y al final lo que conviene mirar. No por volumen.
 */

const diasDesde = (d: any) =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0;

export default function Bandeja() {
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const navegar = useNavigate();

  const cargar = useCallback(async () => {
    const r = await api.get('/dashboard/bandeja').then((x) => x.data).catch(() => null);
    setD(r);
  }, []);
  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  // Bloque 37: al volver del bolsillo, lo que se ve es lo que hay.
  useVolverALaPantalla(cargar);

  if (cargando) return <EsqueletoTabla filas={5} />;
  if (!d) return <div className="card" style={{ padding: 30, textAlign: 'center' }}>
    <div className="muted">No se pudo cargar la bandeja.</div>
  </div>;

  const r = d.resumen;

  /* ==========================================================================
     BLOQUE 38 — EL TITULAR Y EL ORDEN DE ATAQUE
     --------------------------------------------------------------------------
     EL ORDEN NO ES POR CANTIDAD, ES POR QUIÉN ESTÁ PARADO ESPERANDO.

       1. Permiso de altura   — hay alguien al pie de la escalera sin poder subir.
       2. Sin detallar        — el técnico no puede ni empezar.
       3. Firma de almacén    — la orden está lista y le falta el material.
       4. Vencidas            — molesta, pero nadie está de pie esperando.

     Ordenarlo por cantidad pondría arriba lo que más hay, que casi siempre son
     las vencidas — y las vencidas ya llevan días: un día más no cambia nada.
     El permiso de altura sí: son minutos de una persona parada.
     ========================================================================== */
  const porDondeEmpezar: Accion[] = [];
  const pon = (n: number, tono: Tono, texto: string, a: string) => {
    if (n > 0) porDondeEmpezar.push({ id: a + texto, marca: String(n), tono, texto, a });
  };
  pon(r.accesos, 'grave', r.accesos === 1 ? 'permiso de altura sin resolver' : 'permisos de altura sin resolver', '/access');
  pon(r.sinDetallar, 'atender', r.sinDetallar === 1 ? 'orden asignada sin detallar' : 'órdenes asignadas sin detallar', '/maintenance');
  pon(r.firmasPendientes, 'atender', r.firmasPendientes === 1 ? 'orden esperando material' : 'órdenes esperando material', '/maintenance');
  pon(r.vencidas, 'atender', r.vencidas === 1 ? 'orden fuera de plazo' : 'órdenes fuera de plazo', '/maintenance');

  /* El titular nombra LO PRIMERO, no el total. «7 cosas pendientes» no dice por
     dónde empezar; «1 permiso de altura sin resolver» sí. */
  const primero = porDondeEmpezar[0];
  const tono: Tono = r.accesos ? 'grave' : 'atender';
  const titular = primero
    ? `${primero.marca} ${primero.texto}`
    : `${r.total} ${r.total === 1 ? 'cosa esperándote' : 'cosas esperándote'}`;
  const apoyo = r.total > (Number(primero?.marca) || 0)
    ? `Y ${r.total - Number(primero?.marca ?? 0)} más por debajo. Van ordenadas por quién está parado esperando, no por cuántas hay.`
    : undefined;

  return (
    <div>
      <h1 className="page-title">Mi bandeja</h1>

      {r.total === 0 ? (
        <div className="card vacio">
          <NadaPendiente />
          <h3>No hay nada esperándote</h3>
          <p>
            Sin órdenes por detallar, firmas ni permisos pendientes.
          </p>
        </div>
      ) : (
        <>
          {/* -------- 1. LA RESPUESTA (bloque 38) --------
              Antes esto abría con cuatro contadores. Cuatro números no dicen
              por dónde empezar; una frase sí. */}
          <Titular tono={tono} texto={titular} apoyo={apoyo} />

          {/* -------- 2. POR DÓNDE EMPEZAR --------
              Las mismas cifras, pero ordenadas por lo que bloquea a otra
              persona y con un solo toque para llegar. Un permiso de altura sin
              firmar deja a alguien parado al pie de la escalera; una orden
              vencida molesta pero nadie está esperando de pie. */}
          <LoQueHayQueHacer titulo="Por dónde empezar" acciones={porDondeEmpezar} />

          {/* -------- 3. EL TOTAL, EN UNA LÍNEA -------- */}
          <Cifras datos={[{ n: r.total, et: 'cosas esperándote' }]} />

          {/* -------------------------------------------------- BLOQUEA A OTROS */}
          <Bloque
            titulo="Órdenes asignadas sin detallar"
            porque="Hasta que alguien las detalle, el técnico no puede empezar."
            n={r.sinDetallar}
            filas={d.sinDetallar}
            columnas={['Orden', 'Qué hay que hacer', 'Equipo', 'Asignada a', 'Para']}
            fila={(w: any) => [
              <b>{w.code}</b>,
              <span style={{ fontSize: 12 }}>{w.activity || '—'}</span>,
              w.asset?.assetCode || <span className="muted">sin definir</span>,
              w.technician?.fullName || <span className="muted">sin asignar</span>,
              fecha(w.scheduledDate),
            ]}
            accion={() => navegar('/maintenance')}
            textoAccion="Ir a órdenes"
          />

          {/* Va justo después de "sin detallar" y ANTES de las vencidas: una
              orden parada bloquea a alguien igual que una sin detallar, sólo
              que en silencio. Las vencidas al menos se ven venir. */}
          <Bloque
            titulo="Órdenes paradas esperando algo"
            porque="Una orden en espera no vence ni avisa: no se pierde, se olvida. Aquí salen primero las que llevan más de lo razonable para lo que esperan."
            n={r.enEspera}
            filas={d.enEspera}
            columnas={['Orden', 'Equipo', 'Qué espera', 'Técnico']}
            fila={(w: any) => [
              <b>{w.code}</b>,
              w.equipo || <span className="muted">sin definir</span>,
              <span style={{ fontSize: 12, color: w.excedida ? 'var(--crit)' : undefined }}>
                {w.excedida && <b>⚠ </b>}{w.texto}
              </span>,
              w.técnico || <span className="muted">sin asignar</span>,
            ]}
            accion={() => navegar('/maintenance?status=EN_ESPERA')}
            textoAccion="Ir a órdenes"
          />

          <Bloque
            titulo="Material esperando tu firma"
            porque="El técnico ya lo pidió. Sin la firma no sale del almacén."
            n={r.firmasPendientes}
            filas={d.firmasPendientes}
            columnas={['Orden', 'Materiales', 'Aviso']}
            fila={(g: any) => [
              <b>{g.code}</b>,
              <span style={{ fontSize: 12 }}>
                {g.lineas.map((l: any) => `${l.description} (${l.plannedQty ?? '?'} ${l.unit || ''})`).join(' · ')}
              </span>,
              g.sinStock
                ? <span style={{ color: '#b45309', fontSize: 12 }}>{g.sinStock} sin stock suficiente</span>
                : <span className="muted">—</span>,
            ]}
            accion={() => navegar('/maintenance')}
            textoAccion="Firmar retiros"
          />

          <Bloque
            titulo="Permisos de altura por resolver"
            porque="Mientras no estén aprobados, ese trabajo no se puede hacer."
            n={r.accesos}
            filas={d.accesos}
            columnas={['Solicitud', 'Equipo', 'Altura', 'Medio', 'Estado']}
            fila={(a: any) => [
              <b>{a.code}</b>,
              a.asset?.assetCode || '—',
              a.heightMeters != null ? `${a.heightMeters} m` : '—',
              a.means,
              <span className="badge MEDIA">{a.status}</span>,
            ]}
            accion={() => navegar('/access')}
            textoAccion="Ir a accesibilidad"
          />

          {/* -------------------------------------------------------- CORRE PRISA */}
          <Bloque
            titulo="Órdenes vencidas"
            porque="Pasaron de la fecha prevista y siguen abiertas."
            n={r.vencidas}
            filas={d.vencidas}
            columnas={['Orden', 'Qué', 'Equipo', 'Vencía', 'Días', 'Avance']}
            fila={(w: any) => [
              <b>{w.code}</b>,
              <span style={{ fontSize: 12 }}>{w.activity || '—'}</span>,
              w.asset?.assetCode || '—',
              fecha(w.scheduledDate),
              <b style={{ color: 'var(--crit)' }}>{diasDesde(w.scheduledDate)}</b>,
              (w.progressPct ?? 0) + '%',
            ]}
            accion={() => navegar('/maintenance')}
            textoAccion="Ir a órdenes"
          />

          {/* DOS CUADROS DE INCIDENCIAS, NO UNO — bloque 72.
              ==============================================================
              Petición del usuario, y la razón es de lectura: si las cuatro
              críticas del mes se pintan entre cuarenta de prioridad media,
              dejan de verse. Separarlas es lo que impide que la lista larga
              tape a la corta.

              Y LAS DOS ENSEÑAN SÓLO LO QUE NO TIENE ORDEN. Una incidencia con
              orden abierta ya está en marcha y sale más arriba, en «sin
              detallar»: repetirla aquí haría que la bandeja pareciese el
              doble de llena de lo que está.

              Va el NOMBRE de quien la reportó, no un código. La bandeja tiene
              que decir a quién preguntar, o el ingeniero acaba llamando por
              radio para averiguar quién puso el parte. */}
          <Bloque
            titulo="Graves y sin orden todavía"
            porque="Alta o crítica, nadie ha abierto la orden. Es lo primero del día."
            n={r.incidenciasCriticas}
            filas={d.incidenciasCriticas}
            columnas={['Código', 'Problema', 'Equipo', 'Quién avisó', 'Cuándo', 'Prioridad', '']}
            fila={(i: any) => filaIncidencia(i, navegar)}
            accion={() => navegar('/incidents')}
            textoAccion="Ver todas las incidencias"
          />

          <Bloque
            titulo="Reportadas y sin orden todavía"
            porque="Prioridad media o baja. Una media que nadie mira acaba siendo crítica."
            n={r.incidenciasNormales}
            filas={d.incidenciasNormales}
            columnas={['Código', 'Problema', 'Equipo', 'Quién avisó', 'Cuándo', 'Prioridad', '']}
            fila={(i: any) => filaIncidencia(i, navegar)}
            accion={() => navegar('/incidents')}
            textoAccion="Ver todas las incidencias"
          />

          {/* MEJORAS PROPUESTAS POR LOS TÉCNICOS — bloque 72.
              --------------------------------------------------------------
              Sigue la MISMA secuencia que una incidencia: alguien de campo ve
              algo, lo dice, y alguien decide. La diferencia es que una
              incidencia es algo roto y esto es algo mejorable — pero las dos
              se mueren igual si nadie las mira.

              Con NOMBRE, y eso no es un adorno: una propuesta sin nombre no
              se puede agradecer ni preguntar, y a la tercera que se queda sin
              respuesta el técnico deja de proponer. */}
          <Bloque
            titulo="Mejoras propuestas por los técnicos"
            porque="Las escribió quien hizo el trabajo. Sin respuesta, dejan de proponer."
            n={r.mejorasPropuestas}
            filas={d.mejorasPropuestas}
            columnas={['Quién', 'Qué propone', 'Procedimiento', 'Orden', 'Cuándo', '']}
            fila={(m: any) => [
              <b>{m.propuestaPor?.fullName || 'sin nombre'}</b>,
              <span style={{ fontSize: 12 }}>{m.texto}</span>,
              <span style={{ fontSize: 12 }}>{m.procedimiento?.titulo || '—'}</span>,
              m.workOrder?.code || <span className="muted">—</span>,
              <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {haceCuanto(m.createdAt, '—')}
                <div style={{ fontSize: 11 }}>{fechaTabla(m.createdAt, '')}</div>
              </span>,
              <button className="btn-mini" onClick={() => navegar('/mejoras-procedimiento')}>
                Decidir
              </button>,
            ]}
            accion={() => navegar('/mejoras-procedimiento')}
            textoAccion="Ver todas las propuestas"
          />

          {/* ---------------------------------------------------- CONVIENE MIRAR */}
          <Bloque
            titulo="Material retirado y no devuelto"
            porque="La orden se cerró y el sobrante no volvió: el stock del sistema está por debajo del real."
            n={r.sobrantes}
            filas={d.sobrantes}
            columnas={['Orden', 'Material', 'Retirado', 'Usado', 'Sin devolver']}
            fila={(m: any) => [
              <b>{m.workOrder.code}</b>,
              m.description,
              m.withdrawnQty,
              m.usedQty ?? 0,
              <b style={{ color: '#b45309' }}>{m.porDevolver} {m.unit || ''}</b>,
            ]}
          />

          <Bloque
            titulo="Repuestos bajo mínimo"
            porque="No van a estar el día que hagan falta."
            n={r.bajoMinimo}
            filas={d.bajoMinimo}
            columnas={['Repuesto', 'SAP', 'Hay', 'Mínimo']}
            fila={(s: any) => [
              <b>{s.name}</b>,
              <span className="muted" style={{ fontSize: 12 }}>{s.sapCode || '—'}</span>,
              <b style={{ color: s.currentStock <= 0 ? 'var(--crit)' : '#b45309' }}>{s.currentStock}</b>,
              <span className="muted">{s.minStock}</span>,
            ]}
            accion={() => navegar('/inventory')}
            textoAccion="Ir a inventario"
          />
        </>
      )}
    </div>
  );
}

function Contador({ t, v, cls, hint }: { t: string; v: number; cls?: string; hint?: string }) {
  return (
    <div className={'kpi ' + (cls || '')}>
      <div className="label">{t}</div>
      <div className="value">{v}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

/**
 * Un bloque de la bandeja.
 *
 * Si está vacío NO se pinta. Una lista vacía ocupa el mismo sitio que una
 * llena y obliga a leerla para descubrir que no hay nada: justo lo contrario
 * de lo que esta pantalla viene a hacer.
 *
 * Y cada bloque dice POR QUÉ importa. Un contador sin motivo no mueve a nadie.
 */
/* =============================================================================
   UNA FILA DE INCIDENCIA EN LA BANDEJA — bloque 72
   -----------------------------------------------------------------------------
   La misma para los dos cuadros —graves y no graves— a propósito: si se
   escribieran dos veces, un día una enseñaría el nombre de quien avisó y la
   otra no, y nadie sabría cuál de las dos está bien.

   QUÉ LLEVA Y POR QUÉ CADA COSA:

   · QUIÉN AVISÓ, con nombre. La bandeja tiene que decir a quién preguntar. Sin
     esto, el ingeniero llama por radio para averiguar quién puso el parte.

   · CUÁNDO, en dos líneas: «hace 8 h» para priorizar de un vistazo, y la fecha
     exacta debajo para el informe. Y si se sabe cuándo se cayó de verdad,
     también — porque la diferencia entre las dos ES la demora en avisar.

   · ABRIR LA ORDEN, que es la única acción que mueve esto de sitio. Palabras
     del usuario: «una incidencia que sólo se queda en incidencia no se podrá
     intervenir». El botón lo ve quien puede (`wo.create`); a quien no puede,
     se le dice que ya está avisado y quién lo va a decidir — que es
     exactamente para lo que sirve reportar.
============================================================================= */
function filaIncidencia(i: any, navegar: (r: string) => void) {
  return [
    <b>{i.code}</b>,
    <span style={{ fontSize: 12 }}>
      {i.title}
      {i.asset?.referencePlace && (
        <div className="muted" style={{ fontSize: 11 }}>{i.asset.referencePlace}</div>
      )}
    </span>,
    i.asset?.assetCode || <span className="muted">—</span>,
    <span style={{ fontSize: 12 }}>
      {i.reportedBy?.fullName || <span className="muted">no consta</span>}
    </span>,
    <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>
        {haceCuanto(i.reportedAt, '—')}
      </span>
      <div style={{ fontSize: 11 }}>{fechaTabla(i.reportedAt, '')}</div>
      {i.occurredAt && (
        <div style={{ fontSize: 11 }} title="Cuándo se cayó de verdad, no cuándo se avisó">
          se cayó {fechaTabla(i.occurredAt)}
        </div>
      )}
    </span>,
    <span className={'badge ' + i.priority}>{i.priority}</span>,
    <button className="btn-mini" onClick={() => navegar(`/incidents?q=${encodeURIComponent(i.code)}`)}>
      Abrir
    </button>,
  ];
}

function Bloque({ titulo, porque, n, filas, columnas, fila, accion, textoAccion }: {
  titulo: string; porque: string; n: number; filas?: any[];
  columnas: string[]; fila: (x: any) => any[];
  accion?: () => void; textoAccion?: string;
}) {
  if (!n || !filas?.length) return null;
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h3>
        {titulo}
        <span className="muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>{n}</span>
      </h3>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{porque}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ fontSize: 13 }}>
          <thead><tr>{columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {filas.slice(0, 15).map((x: any, i: number) => (
              <tr key={x.id || i}>{fila(x).map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length > 15 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          y {filas.length - 15} más.
        </div>
      )}
      {accion && (
        <button className="btn-mini" style={{ marginTop: 10 }} onClick={accion}>
          {textoAccion || 'Ir'}
        </button>
      )}
    </div>
  );
}
