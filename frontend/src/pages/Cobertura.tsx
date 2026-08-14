import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Icono from '../components/Iconos';
import { EsqueletoTablero } from '../components/Esqueleto';

/**
 * MI COBERTURA — la pantalla del jefe de línea.
 *
 * ===========================================================================
 *  POR QUÉ NO VALE «ESTADO POR TREN»
 * ===========================================================================
 *  «Estado por Tren» está escrita para Mantenimiento: tramos de cable sobre
 *  90 m, canales libres del grabador, gabinetes con foto. Todo correcto, y a
 *  un jefe de línea no le dice absolutamente nada.
 *
 *  Él tiene una sola pregunta:
 *
 *      «¿QUÉ ESTOY DEJANDO DE VER AHORA MISMO, Y CUÁNTO IMPORTA?»
 *
 *  Esta pantalla contesta eso y nada más. Se lee en diez segundos de pie al
 *  lado del tren, que es donde se va a leer.
 *
 *  Lo primero es una FRASE, no un número. Un porcentaje hay que interpretarlo;
 *  «dos zonas vitales están sin vista» no.
 */

const ESTADO: Record<string, string> = {
  FUERA_SERVICIO: 'Fuera de servicio',
  MANTENIMIENTO: 'En mantenimiento',
  CON_INCIDENCIA: 'Con incidencia',
  BAJA: 'Dada de baja',
};

const NIVEL: Record<string, { et: string; clase: string }> = {
  CRITICA: { et: 'Crítica', clase: 'crit' },
  ALTA: { et: 'Alta', clase: 'warn' },
  MEDIA: { et: 'Media', clase: '' },
  BAJA: { et: 'Baja', clase: '' },
};

export default function Cobertura() {
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const r = await api.get('/zonas/cobertura');
      setD(r.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo cargar la cobertura.');
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <div className="page"><EsqueletoTablero /></div>;
  if (error) return <div className="page"><div className="card peligro">{error}</div></div>;
  if (!d) return null;

  const hayProblema = d.zonasVitalesSinVista > 0;

  return (
    <div className="page">
      <h1 className="page-title">Mi cobertura</h1>
      <p className="page-sub">
        Qué se está viendo y qué no, ordenado por lo que le cuesta a la producción.
      </p>

      {/* EL TITULAR. Es lo único que mucha gente va a leer. */}
      <div className={'card ' + (hayProblema ? 'peligro' : 'explica')}
           style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Icono n={hayProblema ? 'alerta' : 'ok'} size={22} />
        <div>
          <b style={{ fontSize: 15 }}>{d.titular}</b>
          {d.coberturaPct !== null && (
            <div style={{ marginTop: 4, fontSize: 13 }}>
              {d.viendo} de {d.camaras} cámaras dando imagen ({d.coberturaPct} %).
              {' '}
              <span className="muted">
                El porcentaje es sólo de contexto: lo que manda es <b>dónde</b> está
                el hueco, no cuántos son.
              </span>
            </div>
          )}
        </div>
      </div>

      {d.coberturaPct === null && (
        <div className="card explica">
          Todavía no hay cámaras cargadas en tu ámbito, así que no se puede medir
          nada. No sale 0 % ni 100 %: los dos serían mentira.
        </div>
      )}

      {d.sinDeclarar > 0 && (
        <div className="card explica">
          <b>{d.sinDeclarar} zona(s) con cámaras que nadie ha valorado.</b> Mientras
          no se diga cuánto importan, todas pesan igual y el trabajo se ordena
          por intuición. Se declara en <b>Zonas vitales</b>.
        </div>
      )}

      {/* ---- Las zonas, ya ordenadas por el servidor ---- */}
      {d.zonas.map((z: any) => {
        const nivel = z.criticidadProduccion ? NIVEL[z.criticidadProduccion] : null;
        const ciega = z.ciegas > 0;
        return (
          <div key={z.id} className="card"
               style={{
                 padding: '14px 16px', marginBottom: 12,
                 borderLeft: `4px solid ${
                   z.zonaVital && ciega ? 'var(--crit,#dc2626)'
                   : ciega ? 'var(--warn,#d97706)'
                   : 'var(--ok,#16a34a)'}`,
               }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline' }}>
              <b style={{ fontSize: 15 }}>{z.nombre}</b>
              {nivel && <span className={'badge ' + nivel.clase}>{nivel.et}</span>}
              {z.zonaVital && ciega && (
                <span className="badge crit"><Icono n="alerta" size={12} /> Sin vista</span>
              )}
              <span className="muted" style={{ fontSize: 12 }}>
                {[z.tren, z.etapa].filter(Boolean).join(' · ')}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 13 }}>
                <b style={{ color: ciega ? 'var(--crit,#dc2626)' : 'var(--ok,#16a34a)' }}>
                  {z.viendo}
                </b>
                <span className="muted"> / {z.camaras} cámaras viendo</span>
              </span>
            </div>

            {/* QUÉ SE VE DESDE AQUÍ. Es lo que convierte un código de activo
                en algo que un jefe de línea reconoce. */}
            {z.queSeVigila && (
              <div style={{ marginTop: 6, fontSize: 13 }}>
                <span className="muted">Cubre: </span>{z.queSeVigila}
              </div>
            )}

            {z.zonaVital && z.porQueEsVital && (
              <div style={{ marginTop: 4, fontSize: 12.5, color: '#8c1414' }}>
                {z.porQueEsVital}
                {z.impactoSiSeCae && <> — <b>{z.impactoSiSeCae}</b></>}
              </div>
            )}

            {z.declaracionVencida && (
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--warn,#b45309)' }}>
                <Icono n="alerta" size={12} /> La valoración de esta zona caducó.
                Se sigue aplicando, pero hay que confirmarla.
              </div>
            )}

            {/* Las cámaras concretas que no ven, con desde cuándo. «Tres días
                sin ver el colado» mueve a alguien; «1 cámara caída» no. */}
            {z.sinVista.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {z.sinVista.map((c: any) => (
                  <div key={c.codigo}
                       style={{ fontSize: 12.5, padding: '4px 0', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <code>{c.codigo}</code>
                    <span>{ESTADO[c.estado] || c.estado}</span>
                    {c.dias !== null
                      ? <span className="muted">
                          {c.dias === 0 ? 'desde hoy' : `desde hace ${c.dias} día(s)`}
                        </span>
                      : <span className="muted">sin incidencia abierta que lo explique</span>}
                  </div>
                ))}
              </div>
            )}

            {z.dudosas > 0 && z.ciegas === 0 && (
              <div className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>
                {z.dudosas} cámara(s) dan imagen pero tienen una incidencia abierta.
              </div>
            )}
          </div>
        );
      })}

      {!d.zonas.length && (
        <div className="card vacio">
          <h3>No hay cámaras en tu ámbito</h3>
          <p>
            En cuanto se carguen los equipos y cuelguen de una zona del árbol de
            planta, aquí aparece qué cubre cada una y qué se está dejando de ver.
          </p>
        </div>
      )}
    </div>
  );
}
