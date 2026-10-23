import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import RejillaDePuertos, { CifrasDePuertos, Puerto } from '../RejillaDePuertos';
import type { Cable } from './CablesDelPlano';
import { NIVEL } from './riesgos';
import { haceCuanto } from '../../fechas';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { NOMBRE_DE_TIPO } from '../../tipos-de-equipo';
import { IconoEquipo, NOMBRE_ICONO, iconoDe } from './Marcador';
import ReportarCaida from '../ReportarCaida';
import ReportarAveria from '../ReportarAveria';
import { TIPO_DE_AVISO_ES, tipoDeAviso, tipoDeOrdenSugerido } from '../../avisoSap';

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

export default function TarjetaEquipo({ e, cable, cablesDelSwitch, onCerrar, onReportado, onPuerto }: {
  e: any;
  /** Bloque 176 · el cable de este equipo a su switch, como lo calcula el servidor. */
  cable?: Cable | null;
  /** Si es un switch: los cables que salen de él en este plano. */
  cablesDelSwitch?: Cable[];
  onCerrar: () => void;
  /** Tras reportar, el mapa vuelve a pedir el estado para pintar el punto. */
  onReportado?: () => void;
  /** Bloque 176 · tocar un puerto del switch: el mapa resalta su cable. */
  onPuerto?: (assetId: string | null) => void;
}) {
  const { can } = useAuth();
  const tecnico = can('asset.read');

  /* Bloque 176 · LA SEGURIDAD DEL SITIO: la misma que se exige al abrir la
     orden (bloque 168), incluidas las áreas de riesgo dibujadas en el mapa.
     Se lee al abrir la tarjeta; si no hay permiso o falla, no se enseña. */
  const [perfil, setPerfil] = useState<any>(null);
  useEffect(() => {
    let vivo = true;
    setPerfil(null);
    api.get(`/seguridad/activo/${e.assetId}`).then((r) => { if (vivo) setPerfil(r.data); }).catch(() => { if (vivo) setPerfil(null); });
    return () => { vivo = false; };
  }, [e.assetId]);

  /* Bloque 176 · un SWITCH enseña su rejilla de puertos (la de Conexiones). */
  const esSwitch = e.tipo === 'SWITCH' && can('red.read');
  const [sw, setSw] = useState<any>(null);
  const [puertoMarcado, setPuertoMarcado] = useState<number | null>(null);
  useEffect(() => {
    if (!esSwitch) return;
    let vivo = true;
    api.get('/conexiones/switches', { params: { id: e.assetId } })
      .then((r) => { if (vivo) setSw((r.data || [])[0] ?? null); }).catch(() => { if (vivo) setSw(null); });
    return () => { vivo = false; };
  }, [esSwitch, e.assetId]);

  /* La OM sale con el equipo, la actividad y —si la hay— la incidencia ya
     puestos: quien la genera sólo revisa y guarda. El tipo se cambia en el
     formulario; aquí sólo se PROPONE.
     Bloque 181 · con aviso, lo propone el aviso, igual que en Incidencias
     (bloque 180): falla → correctivo, condición → preventivo, pedido →
     mejora. Antes un aviso de «funciona, pero se va a dañar» —punto verde—
     salía propuesto como mejora. Sin aviso: correctiva si el punto no está
     bien; si está bien, una mejora o una revisión. */
  const tipoOm = e.incidencia ? tipoDeOrdenSugerido(e.incidencia.tipoAviso) : e.estado === 'ok' ? 'MEJORA' : 'CORRECTIVO';
  const generarOm = `/maintenance?nueva=1&tipo=${tipoOm}&activo=${encodeURIComponent(e.assetId)}`
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
        {/* Bloque 181 · sin repetirlo: el estado «operativo» ya dice que no hay monitoreo. */}
        {e.fuente === 'declarado' && !/monitoreo/i.test(e.estadoTexto || '') && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Sin monitoreo automático: es lo declarado.</p>}

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

        {/* Bloque 176 · el riesgo del sitio, para todos: también para Producción. */}
        {(e.riesgos?.length > 0 || perfil) && (
          <section>
            <h3>Seguridad del sitio</h3>
            {e.riesgos?.length > 0 && (
              <div className="riesgo-chips">
                {e.riesgos.map((n: string) => (
                  <span key={n} className={'riesgo-chip riesgo-' + n} title={NIVEL[n]?.ayuda}>{NIVEL[n]?.icono} {NIVEL[n]?.texto ?? n}</span>
                ))}
              </div>
            )}
            {perfil && (
              <>
                <ul className="perfil-lista">
                  {perfil.enAltura && <li>En altura{perfil.alturaM != null ? ` (${perfil.alturaM} m)` : ''}{perfil.medio ? ` · ${String(perfil.medio).toLowerCase().replace('_', ' ')}` : ''}</li>}
                  {perfil.bloqueoElectrico && <li>Bloqueo eléctrico (LOTO) antes de tocarlo</li>}
                  {perfil.parada && <li>Con el tren parado</li>}
                  {perfil.personasMinimas >= 2 && <li>Nunca solo: {perfil.personasMinimas} personas</li>}
                  {perfil.comoLlegar && <li>Cómo llegar: {perfil.comoLlegar}</li>}
                </ul>
                {tecnico && (
                  <details className="perfil-detalle">
                    <summary>{`Qué exige al abrir la orden (${perfil.requisitos?.length ?? 0})`}</summary>
                    <ul>{(perfil.requisitos || []).map((r: any) => <li key={r.clave} title={r.porque}>{r.texto}</li>)}</ul>
                    {perfil.riesgos?.length > 0 && <p className="muted">Riesgos: {perfil.riesgos.join(' · ')}</p>}
                  </details>
                )}
                {perfil.faltaDeclarar?.length > 0 && (
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>Sin declarar: {perfil.faltaDeclarar.join('; ').toLowerCase()}.</p>
                )}
              </>
            )}
          </section>
        )}

        {tecnico && e.switch && (
          <section>
            <h3>Conexión</h3>
            <dl className="kv">
              <dt>Switch</dt><dd>{e.switch.codigo} · puerto {e.switch.puerto}</dd>
              {cable?.metros != null && (
                <><dt>Cable</dt><dd>{cable.metros} m de {TOPE_TIA} m {cable.estimado ? '(estimado, sin trazar)' : `(trazado${cable.trazadoPor ? ` por ${cable.trazadoPor}` : ''})`}</dd></>
              )}
            </dl>
            {cable && !cable.esEnlace && cable.metros != null && cable.metros > TOPE_TIA && (
              <div className="aviso-mapa grave">Pasa de 90 m (TIA-568): revisar el trazado o poner un extensor.</div>
            )}
            {cable?.cruza.filter((z) => z.nivel !== 'VITAL' && z.nivel !== 'ALTURA').map((z) => (
              <div key={z.nombre} className="aviso-mapa">El cable pasa por «{z.nombre}» ({(NIVEL[z.nivel]?.texto ?? z.nivel).toLowerCase()}): tenderlo o repararlo exige ese permiso.</div>
            ))}
            {!cable && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Su switch no está dibujado en este plano: no se puede medir el cable.</p>}
          </section>
        )}

        {esSwitch && (
          <section>
            <h3>Puertos</h3>
            {!sw ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>Cargando puertos…</p> : (
              <>
                <CifrasDePuertos sw={sw} />
                {sw.capacidad == null && <p className="muted" style={{ margin: '4px 0', fontSize: 12 }}>Falta declarar cuántos puertos tiene.</p>}
                <RejillaDePuertos sw={sw} puedeEditar={false} marcado={puertoMarcado}
                  onAbrir={(n: number, p: Puerto | null) => { setPuertoMarcado(n); onPuerto?.(p?.equipo?.id ?? null); }} />
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  {`${cablesDelSwitch?.length ?? 0} cables dibujados en este plano. Toca un puerto para ver su cable.`}
                </p>
              </>
            )}
          </section>
        )}

        {e.incidencia && (
          <section>
            {/* Bloque 181 · el tipo de aviso: una condición no es una caída, y
                el punto verde con «incidencia abierta» sin decirlo confundía. */}
            <h3>Incidencia abierta · {TIPO_DE_AVISO_ES[tipoDeAviso(e.incidencia.tipoAviso)]}</h3>
            <p>
              {(can('incident.read') || can('om.mirar'))
                ? <Link to={`/incidents?q=${encodeURIComponent(e.incidencia.code)}`}>{e.incidencia.code}</Link>
                : e.incidencia.code} · {e.incidencia.titulo}
            </p>
            {e.incidencia.avisoSap && <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Aviso SAP {e.incidencia.avisoSap}</p>}
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
          {esSwitch && can('asset.update') && (
            <Link className="btn-mini" to={`/conexiones?switch=${encodeURIComponent(e.assetId)}`}>Editar puertos</Link>
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
