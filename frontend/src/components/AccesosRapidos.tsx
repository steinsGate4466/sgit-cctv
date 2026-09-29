import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Icono from './Iconos';

/**
 * ACCESOS RÁPIDOS — bloque 159. «Que desde el mapa se pueda generar una
 * incidencia, una OM o lo que sea… que el dashboard también.»
 *
 * No crean nada aquí (§58): llevan al alta de su módulo con el formulario ya
 * abierto. Cada uno sale sólo si la persona tiene el permiso de esa alta.
 */
export default function AccesosRapidos() {
  const { can } = useAuth();
  const items = [
    can('incident.create') && { a: '/incidents?nueva=1', t: 'Reportar incidencia', i: 'incidencia' as const },
    can('wo.create') && { a: '/maintenance?nueva=1&tipo=CORRECTIVO', t: 'Nueva OM', i: 'orden' as const },
    (can('asset.read') || can('activos.mirar') || can('om.mirar')) && { a: '/mapa', t: 'Ver el mapa', i: 'ubicacion' as const },
  ].filter(Boolean) as { a: string; t: string; i: 'incidencia' | 'orden' | 'ubicacion' }[];
  if (!items.length) return null;
  return (
    <nav className="accesos-rapidos" aria-label="Accesos rápidos">
      {items.map((x) => (
        <Link key={x.a} to={x.a} className="acceso-rapido">
          <Icono n={x.i} size={16} /> {x.t}
        </Link>
      ))}
    </nav>
  );
}
