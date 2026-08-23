import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { EsqueletoTablero } from '../components/Esqueleto';

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

/** Un número grande con su explicación debajo. Sin datos, lo dice. */
function Indicador({ valor, unidad, titulo, explica, aviso, color }: {
  valor: number | null; unidad?: string; titulo: string;
  explica: string; aviso?: string | null; color?: string;
}) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#46536b', textTransform: 'uppercase', letterSpacing: .6 }}>
        {titulo}
      </div>
      {valor === null ? (
        <>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--muted)', marginTop: 6 }}>Sin datos</div>
          {aviso && <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{aviso}</div>}
        </>
      ) : (
        <div style={{ fontSize: 38, fontWeight: 800, color: color || 'var(--navy)', lineHeight: 1.1, marginTop: 4 }}>
          {valor}<span style={{ fontSize: 17, fontWeight: 600, marginLeft: 3 }}>{unidad}</span>
        </div>
      )}
      <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>{explica}</div>
    </div>
  );
}

export default function Indicadores() {
  const nav = useNavigate();
  const [dias, setDias] = useState(90);
  const [tren, setTren] = useState('');
  const [t, setT] = useState<any>(null);
  const [tend, setTend] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async (d: number, tr: string) => {
    const [a, b] = await Promise.all([
      api.get('/indicadores', { params: { dias: d, tren: tr || undefined } }).then((r) => r.data).catch(() => null),
      api.get('/indicadores/tendencia', { params: { meses: 6 } }).then((r) => r.data).catch(() => []),
    ]);
    setT(a); setTend(b || []);
  }, []);

  useEffect(() => { setCargando(true); cargar(dias, tren).finally(() => setCargando(false)); }, [dias, tren, cargar]);

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
      <div className="card explica">
        <b>Estos son los números que se llevan a un comité.</b> Salen de las órdenes
        que ya se registran: no hay que cargar nada nuevo.
        <div style={{ marginTop: 8 }}>
          Donde no hay datos suficientes dice <b>«sin datos»</b> y no un cero. Un cero
          se leería como «tardamos cero horas en reparar», y eso acabaría en una
          diapositiva siendo mentira.
        </div>
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
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        <Indicador
          titulo="MTTR · tiempo de reparación"
          valor={t.mttr.horas} unidad="h"
          explica={t.mttr.significa}
          aviso="Todavía no hay ninguna orden correctiva cerrada en el periodo."
        />
        <Indicador
          titulo="MTBF · entre averías"
          valor={t.mtbf.horas} unidad="h"
          explica={t.mtbf.significa}
          aviso={t.mtbf.sinDatos}
        />
        <Indicador
          titulo="Disponibilidad"
          valor={t.disponibilidad.pct} unidad="%"
          color={dispColor}
          explica={t.disponibilidad.significa}
          aviso="Hace falta el MTTR y el MTBF para poder calcularla."
        />
        <Indicador
          titulo="Cumplimiento del preventivo"
          valor={t.preventivo.pct} unidad="%"
          color={cumpColor}
          explica="Rutinas cerradas ANTES de su fecha. Es el indicador que predice a los demás: si baja, en dos meses sube el correctivo."
          aviso="Todavía no se ha cerrado ninguna rutina preventiva con fecha programada."
        />
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
          De izquierda a derecha: menos de una semana · 1 a 4 semanas · 1 a 3 meses ·
          más de 3 meses. <b>Un backlog estable es normal</b>; uno que crece dice que
          el equipo no da abasto — y eso se ve antes en la antigüedad que en el total.
          {t.backlog.masDe90 > 0 && (
            <> Hay <b>{t.backlog.masDe90}</b> con más de tres meses: eso ya nadie
            recuerda por qué se abrió, y esconde lo urgente.</>
          )}
        </div>
        {t.preventivo.pendientesVencidas > 0 && (
          <div className="card peligro" style={{ marginTop: 12 }}>
            <b>{t.preventivo.pendientesVencidas} rutina(s) preventiva(s) vencida(s) y sin cerrar.</b>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              Es lo que se convierte en correctivo dentro de dos meses.
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
              Ésta es la conversación de presupuesto: cuando un equipo aparece arriba
              tres periodos seguidos, cambiarlo sale más barato que seguir
              arreglándolo — y aquí está el número para demostrarlo.
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
            Un número suelto no dice nada. Lo que dice si el mantenimiento está
            mejorando es la columna leída de arriba abajo.
          </div>
        </div>
      )}
    </div>
  );
}
