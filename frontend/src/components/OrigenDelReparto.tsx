import { Link } from 'react-router-dom';
import { fecha } from '../fechas';
import { plural } from '../formato';

/**
 * DE DÓNDE SALEN LAS CIFRAS DEL REPARTO — bloque 164.
 *
 * «¿Por qué dice 43 preventivas y 37 correctivos? Eso debe salir de las OM
 * registradas.» Salía de todas las órdenes creadas en 90 días, canceladas y
 * automáticas incluidas, y la pantalla no lo decía. Ahora el servidor ya no
 * cuenta las canceladas, y aquí se dice con qué se contó y de dónde salió
 * cada orden. Cada cifra abre Órdenes filtrada con LAS MISMAS (§58: ve y manda).
 */
const ORIGEN = {
  AUTOMATICA: 'generadas por el sistema desde los planes',
  INCIDENCIA: 'de incidencias',
  MANUAL: 'registradas a mano',
} as const;
type Origen = keyof typeof ORIGEN;

export default function OrigenDelReparto({ r, dias }: { r: any; dias: number }) {
  if (!r?.origen || !r.desde) return null;
  const enlace = (tipo: string, origen?: Origen) => {
    const p = new URLSearchParams({ creadasDesde: new Date(r.desde).toISOString(), filtroTipo: tipo, sinCanceladas: '1' });
    if (origen) p.set('origen', origen);
    return '/maintenance?' + p.toString();
  };
  const fila = (tipo: 'PREVENTIVO' | 'CORRECTIVO', et: string, total: number, o: Record<Origen, number>) => (
    <li>
      <Link to={enlace(tipo)}><b>{total} {et}</b></Link>
      {total > 0 && ': '}
      {(Object.keys(ORIGEN) as Origen[]).filter((k) => o[k] > 0).map((k, i) => (
        <span key={k}>{i > 0 && ' · '}<Link to={enlace(tipo, k)}>{o[k]} {ORIGEN[k]}</Link></span>
      ))}
    </li>
  );
  return (
    <div className="origen-reparto">
      <p>
        Cuenta las OM creadas desde el {fecha(r.desde)} ({dias} días)
        {r.canceladasFuera > 0 ? `, sin ${plural(r.canceladasFuera, 'cancelada', 'canceladas')}` : ''}.
      </p>
      <ul>
        {fila('PREVENTIVO', 'preventivas', r.preventivo, r.origen.preventivo)}
        {fila('CORRECTIVO', 'correctivas', r.correctivo, r.origen.correctivo)}
      </ul>
      {r.demo > 0 && <p className="origen-demo">Incluye {plural(r.demo, 'orden de demostración', 'órdenes de demostración')} (DEMO-…).</p>}
    </div>
  );
}
