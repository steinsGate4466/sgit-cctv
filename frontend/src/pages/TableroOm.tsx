import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { EsqueletoTablero } from '../components/Esqueleto';
import { Cifras, ComoSeCalcula } from '../components/Patron';
import {
  useVolverALaPantalla, useRefrescoDePulpito, useEdadEnSegundos,
} from '../useVolverALaPantalla';
import { haceCuanto, hora } from '../fechas';
import { elegirTren, trenPedido } from '../trenes';

/**
 * CÓMO VAN LAS OM DE MI TREN — bloque 113.
 *
 * =============================================================================
 *  LO QUE PIDIÓ PRODUCCIÓN
 * =============================================================================
 *  «Que el supervisor pueda ver cómo van las OM de ese tren... en qué van mis
 *   técnicos, cómo están avanzando, si están llenando todo el formulario, en
 *   qué proceso están, si están por acabar o de repente ni siquiera han
 *   empezado.»
 *
 *  Esta pantalla responde eso y NADA MÁS. No es el listado del ingeniero:
 *  `Maintenance.tsx` son 41 KB con alta, asignación, materiales y cierre.
 *  Producción sólo lee.
 *
 * =============================================================================
 *  MIRAN. NO TOCAN.
 * =============================================================================
 *  Ni un botón que cambie nada; el único que hay vuelve a pedir los datos. El
 *  backend lo respalda: la ruta es GET, exige `wo.read` o `om.mirar` —las dos
 *  de lectura— y el recorte por tren lo pone el SERVIDOR con `filtroConAmbito`.
 *  Escribir `?tren=T1` a mano no enseña el Tren 1: enseña vacío.
 *
 * =============================================================================
 *  EL «TIEMPO REAL», Y POR QUÉ NO ES UN WEBSOCKET
 * =============================================================================
 *  Está razonado en CLAUDE.md §48.1. En corto, y los tres motivos son de
 *  planta:
 *
 *   1. Con dos réplicas en Railway un socket exige afinidad de sesión o un bus
 *      (Redis). Eso es infraestructura nueva y la decide el usuario.
 *   2. El púlpito deja esta pantalla abierta ocho horas. Un socket que se cae
 *      y no reconecta es PEOR que un refresco: se queda congelado, la pantalla
 *      no parece rota, parece tranquila, y nadie se entera.
 *   3. Nadie necesita un segundo de latencia para saber cómo va una orden.
 *      Necesita saber que lo que ve es de hace menos de un minuto.
 *
 *  Así que: refresco de 25 s en pantalla ancha, apagado con la pestaña oculta,
 *  y LA EDAD DEL DATO ESCRITA ARRIBA. Tres peticiones por minuto contra un
 *  RitmoGuard de 600/min no rozan el cupo.
 */

/** Cada cuánto se vuelve a pedir en el púlpito. */
const CADA_MS = 25_000;

/** A partir de aquí la pantalla avisa de que el dato ya no es fresco. */
const VIEJO_S = 90;

const CLASE: Record<string, string> = {
  SIN_EMPEZAR: 'est-FUERA_DE_SERVICIO',
  PREPARADA: 'est-EN_MANTENIMIENTO',
  EN_CURSO: 'est-EN_MANTENIMIENTO',
  POR_ACABAR: 'est-OPERATIVO',
  DETENIDA: 'est-FUERA_DE_SERVICIO',
};

export default function TableroOm() {
  const [trenes, setTrenes] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [d, setD] = useState<any>(null);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [cargadoEn, setCargadoEn] = useState<number | null>(null);
  const edad = useEdadEnSegundos(cargadoEn);
  /* El tren del enlace se lee UNA vez al montar (bloque 103): releerlo en cada
     repintado haría imposible cambiar de pestaña aquí dentro. */
  const location = useLocation();
  const [pedido] = useState(() => trenPedido(location.search));

  useEffect(() => {
    let vivo = true;          // bloque 115: la guardia va aunque `pedido` no cambie
    api.get('/dashboard/infra/trenes')
      .then((r) => {
        if (!vivo) return;
        const t = r.data?.trenes || [];
        setTrenes(t);
        const elegido = elegirTren(t, pedido);
        if (elegido) setCode(elegido.code);
      })
      .catch(() => { if (vivo) setTrenes([]); })
      .finally(() => { if (vivo) setCargandoLista(false); });
    return () => { vivo = false; };
  }, [pedido]);

  const cargar = useCallback(async () => {
    if (!code) return;
    setCargando(true); setError('');
    try {
      const r = await api.get(`/work-orders/tablero?tren=${encodeURIComponent(code)}`);
      setD(r.data);
      setCargadoEn(Date.now());
    } catch (e: any) {
      /* Sin respuesta NO se dice «no tienes permiso»: la petición no llegó.
         Es la misma lección del bloque 104 en el acceso. */
      if (!e?.response) setError('Sin conexión con el servidor. Se reintenta solo.');
      else if (e.response.status === 403) setError('Tu usuario no tiene permiso para ver las órdenes.');
      else setError('No se pudo consultar. Vuelve a intentarlo.');
    } finally { setCargando(false); }
  }, [code]);

  useEffect(() => { cargar(); }, [cargar]);
  useVolverALaPantalla(cargar);
  useRefrescoDePulpito(cargar, CADA_MS);

  if (cargandoLista) return <div className="page"><EsqueletoTablero /></div>;

  if (!trenes.length) {
    return (
      <div className="page">
        <h1 className="page-title">Avance de órdenes</h1>
        <div className="card vacio">
          <h3>Todavía no hay trenes en el árbol de planta</h3>
          <p>En cuanto se creen, aquí aparece el avance de sus órdenes.</p>
        </div>
      </div>
    );
  }

  const suTren = trenes.find((t) => t.code === code);
  const filas: any[] = d?.data ?? [];
  const r = d?.resumen;

  return (
    <div className="page">
      <h1 className="page-title">
        Cómo van las OM{suTren ? ` · ${suTren.nombre}` : ''}
      </h1>

      {/* LA EDAD DEL DATO, SIEMPRE. No sólo cuando envejece: si sólo
          apareciera al envejecer, su ausencia no significaría nada. */}
      <p className={edad !== null && edad >= VIEJO_S ? 'edad-dato viejo' : 'edad-dato'}>
        {edad === null ? 'Consultando…' : `Datos de hace ${edad} s.`}
        {d?.generadoEn ? ` Generado a las ${hora(d.generadoEn)}.` : ''}
        {' '}
        <button type="button" className="btn-mini" onClick={cargar} disabled={cargando}>
          {cargando ? 'Actualizando…' : 'Actualizar ahora'}
        </button>
      </p>

      {trenes.length > 1 && (
        <div className="train-tabs">
          {trenes.map((t) => (
            <button key={t.code} type="button"
              className={'train-tab' + (code === t.code ? ' active' : '')}
              onClick={() => setCode(t.code)}>
              {t.nombre}
            </button>
          ))}
        </div>
      )}

      {error && <div className="card peligro">{error}</div>}

      {cargando && !d ? <EsqueletoTablero /> : d && (
        <div className={cargando ? 'recargando' : undefined}>
          <Cifras
            datos={[
              { n: r?.vivas ?? 0, et: 'órdenes vivas' },
              { n: r?.sinEmpezar ?? 0, et: 'sin empezar' },
              { n: r?.detenidas ?? 0, et: 'detenidas' },
              { n: r?.porAcabar ?? 0, et: 'por acabar' },
            ]}
          />

          {/* UN RECORTE QUE NO SE DICE ES UNA MENTIRA (bloque 101). */}
          {(d.recortadas ?? 0) > 0 && (
            <p className="nada-que-hacer">
              <b>Se enseñan {d.tope} de {d.total} órdenes.</b> Filtra por tren para verlas todas.
            </p>
          )}

          {!filas.length ? (
            <div className="card vacio">
              <h3>No hay órdenes abiertas en este tren</h3>
              <p>Cuando se abra una, aparece aquí con su avance.</p>
            </div>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Dónde</th>
                  <th>Técnico</th>
                  <th>En qué va</th>
                  <th>Último parte</th>
                  <th>Sin noticias</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((o: any) => (
                  <tr key={o.id}>
                    <td>
                      <b>{o.code}</b>
                      <div className="muted">{o.activity || 'sin actividad escrita'}</div>
                    </td>
                    <td>
                      {o.asset?.assetCode || o.location?.name || '—'}
                      <div className="muted">{o.zone || o.location?.code || ''}</div>
                    </td>
                    <td>
                      {o.technician?.fullName || <span className="muted">sin asignar</span>}
                    </td>
                    <td>
                      <span className={'chip ' + (CLASE[o.estadoAvance] || '')}>{o.frase}</span>
                      <div className="muted">
                        {o.progressPct}% · {o._count?.checklist ?? 0} puntos del formulario
                      </div>
                    </td>
                    <td>
                      {o.ultimoAvance ? (
                        <>
                          {haceCuanto(o.ultimoAvance.en)}
                          <div className="muted">
                            {o.ultimoAvance.quien || 'sin firma'}
                            {o.ultimoAvance.motivo ? ` · ${o.ultimoAvance.motivo}` : ''}
                          </div>
                        </>
                      ) : <span className="muted">ningún parte</span>}
                    </td>
                    <td>{o.horasSinNoticias} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <ComoSeCalcula>
        <p>
          Salen las órdenes abiertas, en proceso y en espera de tu tren. Las
          cerradas no: para eso está el listado de gestión.
        </p>
        <p>
          <b>«Sin empezar»</b> es que nadie la detalló ni la arrancó.{' '}
          <b>«Detenida»</b> es que está en espera de algo declarado.
        </p>
        <p>
          <b>La pantalla se actualiza sola cada {CADA_MS / 1000} segundos</b> en
          monitor, y al volver a ella en el móvil.
        </p>
        <p>
          <b>Aquí no se toca nada.</b> Producción observa; el trabajo de campo
          lo ejecuta Mantenimiento.
        </p>
      </ComoSeCalcula>
    </div>
  );
}
