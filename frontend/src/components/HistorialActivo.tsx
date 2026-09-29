import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { CAUSA_ES, fh } from '../pages/omCatalogos';
import { plural } from '../formato';

const TIPO_OM: Record<string, string> = { CORRECTIVO: 'Correctiva', PREVENTIVO: 'Preventiva', PREDICTIVO: 'Predictiva', MEJORA: 'Mejora', INSTALACION: 'Instalación' };

/** Una foto de evidencia: se pide con la sesión (no es un enlace público). */
function FotoEvidencia({ ev }: { ev: { id: string; caption?: string | null } }) {
  const [url, setUrl] = useState<string | null>(null);
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    let vivo = true;
    let u: string | null = null;
    api.get('/work-orders/evidence/' + ev.id + '/file', { responseType: 'blob' })
      .then((r) => { if (!vivo) return; u = URL.createObjectURL(r.data); setUrl(u); })
      .catch(() => { if (vivo) setUrl(null); });
    return () => { vivo = false; if (u) URL.revokeObjectURL(u); };
  }, [ev.id]);
  if (!url) return <span className="lv-foto lv-foto-cargando" title={ev.caption || 'Foto de evidencia'} />;
  return (
    <>
      <button type="button" className="lv-foto" title={ev.caption || 'Foto de evidencia'} onClick={() => setAbierta(true)}>
        <img src={url} alt={ev.caption || 'Foto de evidencia'} />
      </button>
      {abierta && (
        <div className="lv-foto-grande" role="dialog" aria-label={ev.caption || 'Foto de evidencia'} onClick={() => setAbierta(false)}>
          <img src={url} alt={ev.caption || 'Foto de evidencia'} />
          {ev.caption && <div>{ev.caption}</div>}
        </div>
      )}
    </>
  );
}

/**
 * HISTORIAL DEL ACTIVO — la retroalimentación antes de intervenir.
 *
 * PARA QUÉ SIRVE
 * Todo lo que se capturaba —causas de cierre, reincidencia, tramos de cable,
 * incidencias— se guardaba y nadie lo volvía a mirar. El ingeniero creaba una
 * orden sin ver el pasado del equipo y el técnico iba a campo a improvisar.
 *
 * Este panel se usa en tres momentos, a propósito los tres:
 *   · al crear una orden      -> el ingeniero decide con datos
 *   · en la ficha del activo  -> consulta de oficina
 *   · al escanear el QR       -> el técnico lo ve parado frente al equipo
 */

const COLOR: Record<string, { fondo: string; borde: string; texto: string }> = {
  CONFIRMADA: { fondo: 'var(--crit-fondo)', borde: 'var(--crit-borde)', texto: 'var(--crit-texto)' },
  SOSPECHA: { fondo: 'var(--warn-fondo)', borde: 'var(--warn-borde)', texto: 'var(--warn-texto)' },
  NINGUNA: { fondo: 'var(--ok-fondo)', borde: 'var(--ok-borde)', texto: 'var(--ok-texto)' },
};

const MEDIO: Record<string, string> = {
  MANLIFT: 'Manlift', GRUA: 'Grúa', ANDAMIO: 'Andamio',
  ESCALERA: 'Escalera', LINEA_VIDA: 'Línea de vida', OTRO: 'Otro',
};

interface Props {
  assetId: string;
  /** compacto = para el celular y para el panel dentro del formulario. */
  compacto?: boolean;
}

export default function HistorialActivo({ assetId, compacto }: Props) {
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  /* LA GUARDIA — bloque 115. NO ES DE ADORNO.
     -------------------------------------------------------------------------
     Este efecto se relanza cada vez que cambia el equipo. Al dar de alta una
     OM el ingeniero cambia el equipo en el desplegable: se lanzan DOS
     peticiones, y si la primera —la del equipo que ya descartó— llega
     DESPUÉS, es la que se queda en pantalla. La ficha diría una cámara y el
     historial sería de otra.

     Y este componente existe justo para que nadie intervenga a ciegas: se
     enseña ANTES de tocar el equipo, con las señales de reincidencia. Un
     historial cruzado no es un fallo de pantalla: es mandar a alguien a campo
     con la información de otro equipo.

     React ejecuta la limpieza ANTES de volver a lanzar el efecto, así que
     `vivo` cierra las dos puertas: el cambio de equipo y el desmontaje. */
  useEffect(() => {
    if (!assetId) { setCargando(false); return; }
    let vivo = true;
    setCargando(true);
    api.get('/assets/' + assetId + '/historial')
      .then((r) => { if (vivo) setD(r.data); })
      .catch(() => { if (vivo) setD(null); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [assetId]);

  if (!assetId) return null;
  if (cargando) return <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>Consultando el historial…</div>;
  if (!d) return null;

  const c = COLOR[d.severidad] || COLOR.NINGUNA;
  const sinHistorial = !d.resumen.ordenesTotales && !d.resumen.incidencias;

  return (
    <div style={{ marginTop: 12 }}>
      {/* ------------------------------------------------ señales de patrón */}
      <div style={{
        background: c.fondo, border: `1px solid ${c.borde}`, borderRadius: 8,
        padding: '10px 12px', fontSize: 13, color: c.texto,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          {d.severidad === 'CONFIRMADA' ? 'Reincidencia confirmada'
            : d.severidad === 'SOSPECHA' ? 'Posible reincidencia'
            : sinHistorial ? 'Sin historial previo'
            : 'Sin patrón de reincidencia'}
        </div>

        {d.senales?.length ? (
          <ul style={{ margin: '4px 0 0 18px' }}>
            {d.senales.map((s: any, i: number) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {s.mensaje}
                {s.sugerencia && (
                  <div style={{ fontSize: 12, opacity: 0.85 }}>→ {s.sugerencia}</div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ fontSize: 12 }}>
            {sinHistorial
              ? 'Es la primera intervención registrada sobre este equipo.'
              : `${plural(d.resumen.ordenesTotales, 'orden', 'órdenes')}(es) registradas, sin patrón detectado.`}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- resumen */}
      {!sinHistorial && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {[
            { t: 'Órdenes', v: d.resumen.ordenesTotales },
            { t: `En ${d.ventanaDias} días`, v: d.resumen.ordenesEnVentana },
            { t: 'Incidencias', v: d.resumen.incidencias },
            { t: 'Sin falla hallada', v: d.resumen.sinFallaEncontrada, alerta: d.resumen.sinFallaEncontrada >= 2 },
            // Impacto real en producción: es el argumento para un reemplazo,
            // mucho más que la cantidad de órdenes.
            ...(d.resumen.minutosSinVision
              ? [{ t: 'Min. sin visión', v: d.resumen.minutosSinVision, alerta: d.resumen.minutosSinVision > 240 }]
              : []),
          ].map((k) => (
            <div key={k.t} style={{
              border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', minWidth: 84,
            }}>
              <div className="muted" style={{ fontSize: 10 }}>{k.t}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.alerta ? 'var(--crit-texto)' : undefined }}>
                {k.v}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --------------------------------------------------- qué le pasa */}
      {Object.keys(d.porCausa || {}).length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Causas registradas</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(d.porCausa).map(([causa, n]: any) => (
              <span key={causa} style={{
                background: 'var(--bg)', borderRadius: 12, padding: '3px 10px', fontSize: 12,
              }}>
                {CAUSA_ES[causa] || causa} <strong>×{n}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- cableado */}
      {d.tramos?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Cableado conectado</div>
          {d.tramos.map((t: any) => (
            <div key={t.id} style={{ fontSize: 12, marginBottom: 2 }}>
              · {t.category} {t.meters != null ? `· ${t.meters} m` : '· sin medir'}
              {t.meters != null && (
                <span className="muted"> ({t.metersEstimated ? 'estimado' : 'medido'})</span>
              )}
              {t.shielded ? ' · blindado' : ' · sin blindaje'}
              {t.route ? ` · ${t.route.toLowerCase()}` : ''}
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------ vecinos que comparten */}
      {d.compartida?.vecinos > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
            Comparte {d.compartida.via} con {plural(d.compartida.vecinos, 'equipo')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {d.compartida.vecinosDetalle?.slice(0, compacto ? 6 : 20).map((v: any) => (
              <span key={v.assetCode} style={{
                background: v.ordenes ? 'var(--crit-fondo)' : 'var(--suave-fondo)',
                color: v.ordenes ? 'var(--crit-texto)' : undefined,
                borderRadius: 12, padding: '3px 10px', fontSize: 12,
              }}>
                {v.assetCode}{v.ordenes ? ` · ${v.ordenes} falla(s)` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ----------------------------------------------- accesos en altura */}
      {d.accesos?.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12 }}>
          <span style={{ fontWeight: 600 }}>Acceso especial: </span>
          {d.accesos[0].status === 'APROBADO' ? 'requirió ' : 'se solicitó '}
          {MEDIO[d.accesos[0].means] || d.accesos[0].means}
          {d.accesos[0].heightMeters ? ` (${d.accesos[0].heightMeters} m)` : ''}
          {' · '}{fh(d.accesos[0].createdAt)}
        </div>
      )}

      {/* ------------------------------------------ materiales históricos */}
      {d.materiales?.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Materiales usados antes</div>
          <div className="muted">{d.materiales.join(' · ')}</div>
        </div>
      )}

      {/* ------------------------------------ LÍNEA DE VIDA — bloque 163 ----
          Antes: una tabla de órdenes aparte y las incidencias en otro sitio.
          Ahora todo lo que le pasó al equipo en UNA línea, lo más nuevo
          arriba: cada incidencia, cada orden con su causa, quién la hizo y
          SUS FOTOS. Es la pregunta de la auditoría —«¿qué se le hizo y cómo
          se sabe?»— contestada en un solo sitio. */}
      {!compacto && (d.ordenes?.length > 0 || d.incidencias?.length > 0) && (
        <div className="linea-vida">
          <div className="linea-vida-titulo">Línea de vida del equipo</div>
          <ol>
            {[
              ...(d.ordenes || []).map((o: any) => ({ k: 'om-' + o.id, cuando: o.endedAt || o.executedDate || o.scheduledDate, tipo: 'om', o })),
              ...(d.incidencias || []).map((i: any) => ({ k: 'inc-' + i.id, cuando: i.reportedAt, tipo: 'inc', i })),
            ]
              .sort((a, b) => String(b.cuando || '').localeCompare(String(a.cuando || '')))
              .slice(0, 12)
              .map((x: any) => (x.tipo === 'om' ? (
                <li key={x.k} className={'lv lv-om ' + (x.o.status === 'CERRADA' ? 'lv-cerrada' : 'lv-abierta')}>
                  <div className="lv-cab">
                    <b>{x.o.code}</b> · {TIPO_OM[x.o.type] || x.o.type}
                    <span className="lv-estado">{x.o.status === 'CERRADA' ? 'cerrada' : 'abierta'}</span>
                    <span className="muted lv-fecha">{fh(x.cuando)}</span>
                  </div>
                  <div className="lv-cuerpo">
                    {x.o.rootCause && <span>Causa: {CAUSA_ES[x.o.rootCause] || x.o.rootCause}. </span>}
                    {x.o.isRecurrent && <span className="lv-reincide">Reincidente. </span>}
                    {x.o.diagnosis && <span className="muted">{String(x.o.diagnosis).split('\n')[0].slice(0, 140)}</span>}
                    <div className="muted lv-quien">{x.o.technician?.fullName || 'sin técnico asignado'}</div>
                  </div>
                  {x.o.evidences?.length > 0 && (
                    <div className="lv-fotos">
                      {x.o.evidences.map((ev: any) => <FotoEvidencia key={ev.id} ev={ev} />)}
                      {(x.o._count?.evidences ?? 0) > x.o.evidences.length && (
                        <span className="muted">+{x.o._count.evidences - x.o.evidences.length}</span>
                      )}
                    </div>
                  )}
                  {x.o.status === 'CERRADA' && !(x.o.evidences?.length > 0) && (
                    <div className="lv-sin-foto">Sin fotos de evidencia.</div>
                  )}
                </li>
              ) : (
                <li key={x.k} className="lv lv-inc">
                  <div className="lv-cab">
                    <b>{x.i.code}</b> · Incidencia
                    <span className="lv-estado">{String(x.i.status || '').toLowerCase().replace('_', ' ')}</span>
                    <span className="muted lv-fecha">{fh(x.cuando)}</span>
                  </div>
                  <div className="lv-cuerpo">
                    {x.i.title}
                    {x.i.visionDownMin > 0 && <span className="muted"> · {x.i.visionDownMin} min sin visión</span>}
                  </div>
                </li>
              )))}
          </ol>
        </div>
      )}
    </div>
  );
}
