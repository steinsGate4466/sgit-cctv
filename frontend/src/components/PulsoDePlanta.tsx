import { Link } from 'react-router-dom';
import { haceCuanto } from '../fechas';
import { plural } from '../formato';
import Icono from './Iconos';

/**
 * CÓMO AMANECIÓ LA PLANTA — bloque 158.
 *
 * La bandeja decía lo que espera a alguien; esto dice cómo está la planta
 * HOY: cámaras, órdenes, incidencias y preventivos de la semana, quién va
 * cargado y lo último que pasó. Cada cifra lleva a su módulo (§58: ve y manda).
 *
 * Los números vienen contados por el servidor (`pulso` de /dashboard/bandeja).
 * Si una cifra es cero se dice cero: no se esconde, porque «no hay cámaras
 * caídas» también es información.
 */
const MOV: Record<string, { et: string; tono: string; ico: 'incidencia' | 'orden' | 'ok' }> = {
  INCIDENCIA: { et: 'Incidencia', tono: 'grave', ico: 'incidencia' },
  OM_CREADA: { et: 'OM nueva', tono: 'info', ico: 'orden' },
  OM_CERRADA: { et: 'OM cerrada', tono: 'bien', ico: 'ok' },
  INCIDENCIA_RESUELTA: { et: 'Resuelta', tono: 'bien', ico: 'ok' },
};

export default function PulsoDePlanta({ p }: { p: any }) {
  if (!p) return null;
  // Mismo criterio que «Cámaras sin servicio» del Dashboard: fuera, en mantenimiento o con incidencia.
  const caidas = (p.camaras?.fueraDeServicio ?? 0) + (p.camaras?.enMantenimiento ?? 0) + (p.camaras?.conIncidencia ?? 0);
  const maxCarga = Math.max(1, ...(p.carga || []).map((c: any) => c.abiertas));

  const tarjetas = [
    {
      a: '/mapa', et: 'Cámaras', tono: caidas ? 'grave' : 'bien',
      n: p.camaras?.total ? `${p.camaras.total - caidas}/${p.camaras.total}` : '0',
      sub: caidas ? `${plural(caidas, 'con problema', 'con problema')}` : (p.camaras?.total ? 'todas sin novedad' : 'no hay cámaras cargadas'),
    },
    {
      a: '/maintenance', et: 'Órdenes en curso', tono: p.ordenes?.enEspera ? 'atender' : 'info',
      n: String(p.ordenes?.enProceso ?? 0),
      sub: `${p.ordenes?.abiertas ?? 0} por empezar · ${p.ordenes?.cerradasHoy ?? 0} cerradas hoy`,
    },
    {
      a: '/incidents', et: 'Incidencias abiertas', tono: p.incidencias?.abiertas ? 'atender' : 'bien',
      n: String(p.incidencias?.abiertas ?? 0),
      sub: `${p.incidencias?.reportadasHoy ?? 0} hoy · ${p.incidencias?.resueltasHoy ?? 0} resueltas`,
    },
    {
      a: '/preventive', et: 'Preventivos 7 días', tono: 'info',
      n: String(p.preventivosSemana ?? 0),
      sub: 'programados esta semana',
    },
  ];

  return (
    <section className="pulso" aria-label="Cómo está la planta hoy">
      <div className="pulso-tarjetas">
        {tarjetas.map((t) => (
          <Link key={t.et} to={t.a} className={'pulso-tarjeta tono-' + t.tono}>
            <span className="pulso-et">{t.et}</span>
            <b className="pulso-n">{t.n}</b>
            <span className="pulso-sub">{t.sub}</span>
          </Link>
        ))}
      </div>

      <div className="pulso-columnas">
        <div className="pulso-panel">
          <h3>Carga por técnico</h3>
          {!(p.carga || []).length && <p className="muted">Nadie tiene órdenes abiertas asignadas.</p>}
          {(p.carga || []).map((c: any) => (
            <div key={c.tecnicoId} className="carga-fila">
              <span className="carga-nombre">{c.tecnico}</span>
              <span className="carga-barra" aria-hidden="true">
                <i style={{ width: `${(c.abiertas / maxCarga) * 100}%` }} />
              </span>
              <span className="carga-n">
                {c.abiertas}
                {c.vencidas > 0 && <em className="carga-vencidas"> · {c.vencidas} venc.</em>}
              </span>
            </div>
          ))}
        </div>

        <div className="pulso-panel">
          <h3>Últimas 24 horas</h3>
          {!(p.movimientos || []).length && <p className="muted">Sin movimientos en las últimas 24 horas.</p>}
          <ul className="movimientos">
            {(p.movimientos || []).map((m: any) => {
              const t = MOV[m.tipo] || MOV.OM_CREADA;
              return (
                <li key={m.tipo + m.codigo}>
                  <Link to={m.ruta} className={'mov tono-' + t.tono}>
                    <span className="mov-ico"><Icono n={t.ico} size={14} /></span>
                    <span className="mov-texto">
                      <b>{t.et} · {m.codigo}</b> {m.texto}
                      <span className="mov-cuando">{haceCuanto(m.cuando, '')}{m.quien ? ` · ${m.quien}` : ''}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
