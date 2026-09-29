import { useState } from 'react';
import { haceCuanto } from '../../fechas';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { NOMBRE_DE_TIPO } from '../../tipos-de-equipo';
import { IconoEquipo, NOMBRE_ICONO, iconoDe } from './Marcador';
import ReportarCaida from '../ReportarCaida';
import ReportarAveria from '../ReportarAveria';

/**
 * LA TARJETA DE UN PUNTO — bloque 151. «Tipo videojuego»: lo que es, cómo
 * está, dónde, y a dónde ir. Cambia según quién mira:
 *
 *   · Producción (sin `asset.read`): qué se deja de ver y cómo va la orden.
 *   · Técnico: posición en metros, altura, switch y puerto, cable estimado.
 *
 * VE Y MANDA, NO HACE (§58): los botones llevan al módulo donde se trabaja.
 * Aquí no hay ni un `api.post`; lo vigila `verificar:mapa`.
 *
 * LA EXCEPCIÓN ACORDADA — bloque 159. «Reportar una falla: tocar el equipo en
 * el mapa → qué pasa → foto. Listo.» (plan del 28/09, proceso de Producción).
 * El reporte se hace AQUÍ, pero no con un formulario nuevo: son LOS MISMOS dos
 * formularios del QR (`ReportarCaida` para quien sólo reporta, `ReportarAveria`
 * para quien trabaja órdenes), con sus permisos y su auditoría. El mapa no
 * gana una regla propia; sólo deja de mandarte al QR para decir «no veo».
 * `verificar:mapa` sólo admite ESOS dos formularios de escritura.
 */
const ESTADO: Record<string, string> = { ok: 'Operativo', alerta: 'Con alerta', caida: 'Sin servicio', sindato: 'Sin dato' };
const TOPE_TIA = 90;

export default function TarjetaEquipo({ e, equipos, metrosPorPx, onCerrar, onReportado }: {
  e: any;
  equipos: any[];
  metrosPorPx: number | null;
  onCerrar: () => void;
  /** Tras reportar, el mapa vuelve a pedir el estado para pintar el punto. */
  onReportado?: () => void;
}) {
  const { can } = useAuth();
  const tecnico = can('asset.read');

  /* Cable estimado: si el switch también está dibujado, la distancia en L
     (por donde va de verdad un cable: por bandeja, no en diagonal). */
  const sw = e.switch ? equipos.find((x) => x.assetId === e.switch.assetId) : null;
  const cableM = sw && metrosPorPx
    ? Math.round((Math.abs(sw.xPx - e.xPx) + Math.abs(sw.yPx - e.yPx)) * metrosPorPx)
    : null;

  /* La OM sale con el equipo, la actividad y —si la hay— la incidencia ya
     puestos: quien la genera sólo revisa y guarda. Correctiva si el punto no
     está bien; si está bien, es una mejora o una revisión (el tipo se cambia
     en el formulario). */
  const generarOm = `/maintenance?nueva=1&tipo=${e.estado === 'ok' ? 'MEJORA' : 'CORRECTIVO'}&activo=${encodeURIComponent(e.assetId)}`
    + `&actividad=${encodeURIComponent(e.incidencia ? `${e.codigo}: ${e.incidencia.titulo}` : `${e.codigo}: ${e.estadoTexto}`)}`
    + (e.incidencia?.id ? `&incidencia=${encodeURIComponent(e.incidencia.id)}` : '');
  const trabaja = can('wo.update');
  /* Tras reportar, el punto ya trae su incidencia; la confirmación (con el
     número) se sigue viendo hasta cerrar la tarjeta. */
  const [reportado, setReportado] = useState(false);
  const alReportar = () => { setReportado(true); onReportado?.(); };

  return (
    <aside className="tarjeta-mapa" aria-live="polite">
      <header className={'tarjeta-mapa-cab punto-' + e.estado}>
        <span className="tarjeta-mapa-tipo"><IconoEquipo e={e} tam={18} /> {NOMBRE_ICONO[iconoDe(e)] || NOMBRE_DE_TIPO[e.tipo] || e.tipo}</span>
        <h2>{e.codigo}</h2>
        <span className="tarjeta-mapa-estado">{ESTADO[e.estado] || e.estado}</span>
        <button type="button" className="tarjeta-mapa-cerrar" aria-label="Cerrar" onClick={onCerrar}>×</button>
      </header>
      <div className="tarjeta-mapa-cuerpo">
        <p style={{ margin: 0 }}>{e.estadoTexto}</p>
        {e.fuente === 'declarado' && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Sin monitoreo automático: es lo declarado.</p>}

        {e.referencia && (
          <section>
            <h3>{tecnico ? 'Dónde' : 'Qué vigila'}</h3>
            <p>{e.referencia}</p>
          </section>
        )}

        {tecnico && (
          <section>
            <h3>Ubicación</h3>
            <dl className="kv">
              {e.xM != null && <><dt>Posición</dt><dd>X {e.xM} m · Y {e.yM} m</dd></>}
              {e.alturaM != null && <><dt>Altura</dt><dd>{e.alturaM} m</dd></>}
            </dl>
            {e.alturaM != null && e.alturaM >= 1.8 && (
              <div className="aviso-mapa">Trabajo en altura (≥ 1,8 m): permiso y arnés.</div>
            )}
          </section>
        )}

        {tecnico && e.switch && (
          <section>
            <h3>Conexión</h3>
            <dl className="kv">
              <dt>Switch</dt><dd>{e.switch.codigo} · puerto {e.switch.puerto}</dd>
              {cableM != null && <><dt>Cable est.</dt><dd>{cableM} m de {TOPE_TIA} m</dd></>}
            </dl>
            {cableM != null && cableM > TOPE_TIA && (
              <div className="aviso-mapa grave">Pasa de 90 m (TIA-568): revisar el trazado o poner un extensor.</div>
            )}
          </section>
        )}

        {e.incidencia && (
          <section>
            <h3>Incidencia abierta</h3>
            <p>
              {(can('incident.read') || can('om.mirar'))
                ? <Link to={`/incidents?q=${encodeURIComponent(e.incidencia.code)}`}>{e.incidencia.code}</Link>
                : e.incidencia.code} · {e.incidencia.titulo}
            </p>
          </section>
        )}

        {/* Bloque 163: lo último que se le hizo, con enlace a su historial. */}
        {e.ultima && (
          <p className="muted tarjeta-mapa-ultima">
            Última intervención: <b>{e.ultima.code}</b> · {haceCuanto(e.ultima.fecha, 'sin fecha')}
          </p>
        )}

        {e.om ? (
          <section>
            <h3>{tecnico ? 'Orden' : 'Cuándo vuelve'}</h3>
            <div className="barra-avance" aria-label={`Avance ${e.om.avance} %`}>
              <div style={{ width: `${Math.max(0, Math.min(100, e.om.avance ?? 0))}%` }} />
            </div>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{e.om.code} · {e.om.avance ?? 0} %</p>
          </section>
        ) : e.estado !== 'ok' && (
          <p className="muted" style={{ fontSize: 12 }}>Todavía no hay orden abierta.</p>
        )}

        <div className="tarjeta-mapa-acciones">
          {e.om && (can('wo.read') || can('om.mirar')) && (
            <Link className="btn-primary" to={`/maintenance?om=${encodeURIComponent(e.om.code)}`}>Ir a la orden</Link>
          )}
          {!e.om && can('wo.create') && (
            <Link className={e.estado === 'ok' ? 'btn-mini' : 'btn-primary'} to={generarOm}>Generar OM</Link>
          )}
          {(can('asset.read') || can('activos.mirar')) && (
            <Link className="btn-mini" to={`/a/${e.assetId}`}>Ficha</Link>
          )}
        </div>

        {/* REPORTAR DESDE EL MAPA — bloque 159. Sólo si no hay ya una
            incidencia abierta: una segunda sobre el mismo equipo es la misma
            avería contada dos veces. */}
        {(!e.incidencia || reportado) && can('incident.create') && (
          <section className="tarjeta-mapa-reportar">
            <h3>Reportar</h3>
            {trabaja
              ? <ReportarAveria assetId={e.assetId} codigo={e.codigo} zona={e.referencia} alCrear={alReportar} />
              : <ReportarCaida assetId={e.assetId} codigo={e.codigo} onListo={alReportar} />}
          </section>
        )}
      </div>
    </aside>
  );
}
