import { useEffect, useState, useCallback } from 'react';
import { EsqueletoTabla } from '../components/Esqueleto';
import { NadaPendiente } from '../components/Ilustraciones';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useVolverALaPantalla } from '../useVolverALaPantalla';

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

const fecha = (d: any) => (d ? new Date(d).toLocaleDateString() : '—');
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

  return (
    <div>
      <h1 className="page-title">Mi bandeja</h1>
      <p className="page-sub">Lo que espera una decisión tuya. No es un tablero: es una lista para vaciar.</p>

      {r.total === 0 ? (
        <div className="card vacio">
          <NadaPendiente />
          <h3>No hay nada esperándote</h3>
          <p>
            Ni órdenes sin detallar, ni firmas pendientes, ni permisos sin
            resolver. Eso es una buena noticia y merece decirse.
          </p>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <Contador t="Sin detallar" v={r.sinDetallar} cls={r.sinDetallar ? 'warn' : 'ok'}
              hint="El técnico no puede empezar" />
            <Contador t="Firmas de almacén" v={r.firmasPendientes} cls={r.firmasPendientes ? 'warn' : 'ok'}
              hint="Órdenes esperando material" />
            <Contador t="Permisos de altura" v={r.accesos} cls={r.accesos ? 'crit' : 'ok'}
              hint="Sin esto nadie sube" />
            <Contador t="Órdenes vencidas" v={r.vencidas} cls={r.vencidas ? 'crit' : 'ok'}
              hint="Pasaron de fecha" />
          </div>

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
              w.tecnico || <span className="muted">sin asignar</span>,
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

          <Bloque
            titulo="Incidencias de prioridad alta sin cerrar"
            porque="Son las que Producción está esperando."
            n={r.incidenciasCriticas}
            filas={d.incidenciasCriticas}
            columnas={['Código', 'Problema', 'Equipo', 'Prioridad', 'Abierta hace']}
            fila={(i: any) => [
              <b>{i.code}</b>,
              <span style={{ fontSize: 12 }}>{i.title}</span>,
              i.asset?.assetCode || '—',
              <span className={'badge ' + i.priority}>{i.priority}</span>,
              diasDesde(i.reportedAt) + ' días',
            ]}
            accion={() => navegar('/incidents')}
            textoAccion="Ir a incidencias"
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
