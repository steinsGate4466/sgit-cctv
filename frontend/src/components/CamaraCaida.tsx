import { useState } from 'react';
import Icono from './Iconos';
import { Tono } from './Patron';
import { hora } from '../fechas';

/**
 * LA TARJETA DE UNA CÁMARA CAÍDA — bloque 39.
 *
 * =============================================================================
 *  PARA EL JEFE DE TREN, QUE MIRA Y NO TOCA
 * =============================================================================
 *  Todo lo que necesita saber de una cámara caída, sin abrir nada más y sin
 *  llamar a nadie por radio:
 *
 *    · A QUÉ APUNTA, con la foto. «AA-CAM-T2-COL-004» no le dice nada; la
 *      imagen del campo de visión, sí. Es lo primero de la tarjeta.
 *    · CUÁNDO se fue y cuándo lo reportaron, con el hueco entre las dos.
 *    · QUIÉN la está atacando y desde qué hora.
 *    · CÓMO va, con la última nota escrita por el técnico.
 *    · QUÉ MATERIAL FALTA, con su código de SAP — para poder mover una compra.
 *    · HASTA DÓNDE se puede llegar hoy sin parar el tren.
 *
 *  NO HAY NI UN BOTÓN QUE CAMBIE NADA. Es deliberado: Producción observa,
 *  Mantenimiento ejecuta. Esa frontera es la que permite que las dos áreas
 *  compartan pantalla sin pisarse.
 *
 * =============================================================================
 *  LA FOTO VA ARRIBA Y GRANDE, Y NO ES DECORACIÓN
 * =============================================================================
 *  Un jefe de línea no reconoce equipos por su código: reconoce sitios. La
 *  foto de a qué apunta convierte una fila de inventario en «ah, la del
 *  colado». Sin ella, la tarjeta obliga a abrir el plano — y entonces no se
 *  abre.
 *
 *  Si no hay foto se dice, y se dice como TAREA: «nadie ha subido a qué
 *  apunta». Un hueco gris no lo arregla nadie; una frase con sujeto, sí.
 */

const COLOR_HITO: Record<string, string> = {
  CAIDA: '#a32d2d', REPORTE: '#ba7517', ASIGNACION: '#185fa5',
  INICIO: '#1d9e75', CIERRE: '#1d9e75',
};

const NIVEL_INTERVENCION: Record<string, { et: string; tono: Tono; icono: string }> = {
  EN_MARCHA: { et: 'Se puede resolver con el tren en marcha', tono: 'bien', icono: 'ok' },
  CON_PERMISO_ELECTRICO: { et: 'Necesita bloqueo eléctrico', tono: 'atender', icono: 'electricidad' },
  CON_PERMISO_ALTURA: { et: 'Hay que subir: permiso de altura', tono: 'atender', icono: 'alerta' },
  EXIGE_PARADA: { et: 'Exige que el tren esté detenido', tono: 'grave', icono: 'parada' },
  SIN_CLASIFICAR: { et: 'Sin ambiente declarado: se trata como parada', tono: 'sindatos', icono: 'nota' },
};

export default function CamaraCaida({ c }: { c: any }) {
  /* La foto arranca cerrada en móvil y abierta en escritorio se decide con
     CSS, no aquí: saber el ancho de pantalla en JavaScript obliga a mantener
     dos verdades y una acaba desincronizándose de la otra. */
  const [verTodo, setVerTodo] = useState(false);
  const inter = NIVEL_INTERVENCION[c.intervencion?.nivel] ?? NIVEL_INTERVENCION.SIN_CLASIFICAR;

  return (
    <article className={'cam' + (c.zonaVital ? ' cam-vital' : '')}>

      {/* ---------- 1. QUÉ ES Y CUÁNTO LLEVA ---------- */}
      <header className="cam-cabeza">
        <div className="cam-quien">
          <h3 className="cam-zona">{c.zona}</h3>
          <div className="cam-codigo">{c.codigo}{c.lugar ? ` · ${c.lugar}` : ''}</div>
        </div>
        <span className={'marca marca-' + (c.zonaVital ? 'grave' : 'atender')}>
          {c.zonaVital && 'zona vital · '}
          {/* «sin imagen desde hace» sólo si se SABE cuándo se fue. Si el dato
              viene del reporte, se dice «reportada hace»: la diferencia entre
              las dos puede ser de horas y no es un matiz. */}
          {c.tiempo.horaDeCaidaDesconocida ? 'reportada hace ' : 'sin imagen desde hace '}
          {c.tiempo.enPalabras}
        </span>
      </header>

      {/* ---------- 2. A QUÉ APUNTA ---------- */}
      {c.foto ? (
        <figure className="cam-foto">
          <img src={c.foto.url} alt={`Campo de visión de ${c.codigo}`} loading="lazy" />
          <figcaption>{c.foto.pie || c.queSeVigila || 'A qué apunta esta cámara'}</figcaption>
        </figure>
      ) : (
        <p className="cam-sinfoto">
          <Icono n="camara" size={15} />
          Nadie ha subido a qué apunta esta cámara.
          {c.queSeVigila && <> Según la ficha, cubre: {c.queSeVigila}.</>}
        </p>
      )}

      {/* ---------- 3. QUÉ HA PASADO, CON HORAS ---------- */}
      <div className="cam-bloque">
        <div className="bloque-titulo">Qué ha pasado</div>
        <ol className="cronologia">
          {c.hitos.map((h: any, i: number) => (
            <li key={h.clave}>
              <span className="crono-punto" style={{ background: COLOR_HITO[h.clave] }} />
              {i < c.hitos.length - 1 && <span className="crono-linea" />}
              <div className="crono-texto">
                <div className="crono-que">{h.etiqueta}</div>
                <div className="crono-cuando">
                  {hora(h.cuando)}
                  {h.hace && <> · {h.hace} después</>}
                  {h.quien && <> · {h.quien}</>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* ---------- 4. CÓMO VA ---------- */}
      {c.orden ? (
        <div className="cam-bloque">
          <div className="cam-avance-cabeza">
            <span className="bloque-titulo" style={{ margin: 0 }}>
              Avance de {c.orden.code}
            </span>
            <b>{c.orden.avance} %</b>
          </div>
          <div className="barra"><div className="barra-relleno" style={{ width: `${c.orden.avance}%` }} /></div>
          {c.orden.ultimaNota ? (
            <p className="cam-nota">
              Última nota, hace {c.orden.ultimaNota.hace}
              {c.orden.ultimaNota.quien && <> · {c.orden.ultimaNota.quien}</>}:
              {' '}«{c.orden.ultimaNota.texto}»
            </p>
          ) : (
            <p className="cam-nota muted">
              El técnico todavía no ha registrado ningún avance.
            </p>
          )}
        </div>
      ) : (
        <p className="cam-sinorden">
          <Icono n="alerta" size={15} />
          <b>Todavía no hay nadie asignado.</b> La incidencia está registrada,
          pero no se ha abierto una orden de trabajo.
        </p>
      )}

      {/* ---------- 5. QUÉ FALTA PARA TERMINAR ---------- */}
      {c.faltaMaterial && (
        <div className="cam-falta">
          <Icono n="inventario" size={16} />
          <div>
            <b>{c.faltaMaterial}</b>
            <ul>
              {c.materiales.filter((m: any) => m.bloquea).map((m: any) => (
                <li key={m.descripcion}>
                  <b>{m.descripcion}</b> — {m.texto}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ---------- 6. HASTA DÓNDE SE PUEDE LLEGAR ---------- */}
      <div className={'cam-pie cam-pie-' + inter.tono}>
        <Icono n={inter.icono as any} size={17} />
        <div>
          <div className="cam-pie-que">{inter.et}</div>
          <div className="cam-pie-porque">{c.intervencion?.porQue}</div>
        </div>
      </div>

      {/* En espera: es lo que responde «¿por qué no avanza?» sin llamar. */}
      {c.espera && (
        <div className={'cam-pie ' + (c.espera.excedida ? 'cam-pie-grave' : 'cam-pie-atender')}>
          <Icono n="pausa" size={17} />
          <div>
            <div className="cam-pie-que">Parada: hasta aquí se puede llegar hoy</div>
            <div className="cam-pie-porque">{c.espera.texto}</div>
          </div>
        </div>
      )}

      {/* ---------- El resto, para quien lo quiera ---------- */}
      {(c.porQueEsVital || c.modelo || c.incidencia || c.materiales?.length) && (
        <>
          <button className="cam-mas" onClick={() => setVerTodo((v) => !v)}>
            {verTodo ? 'Ocultar el detalle' : 'Ver el detalle'}
            <Icono n="desplegar" size={15} />
          </button>
          {verTodo && (
            <dl className="cam-detalle">
              {c.porQueEsVital && (
                <><dt>Por qué es vital</dt><dd>{c.porQueEsVital}</dd></>
              )}
              {c.incidencia && (
                <><dt>Incidencia</dt>
                  <dd>{c.incidencia.code} · {c.incidencia.titulo} · prioridad {c.incidencia.prioridad.toLowerCase()}</dd></>
              )}
              {c.orden?.tecnico && (
                <><dt>Técnico</dt><dd>{c.orden.tecnico}</dd></>
              )}
              {c.modelo && (<><dt>Modelo</dt><dd>{c.modelo}</dd></>)}
              {c.materiales?.length > 0 && (
                <><dt>Materiales de la orden</dt>
                  <dd>
                    <ul className="cam-materiales">
                      {c.materiales.map((m: any) => (
                        <li key={m.descripcion}>
                          <b>{m.descripcion}</b>
                          {m.sapCode && <span className="muted"> · SAP {m.sapCode}</span>}
                          <div className="muted">{m.texto}</div>
                        </li>
                      ))}
                    </ul>
                  </dd></>
              )}
            </dl>
          )}
        </>
      )}
    </article>
  );
}
