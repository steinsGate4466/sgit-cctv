import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { pestanasDe } from '../pestanas';
import { moduloDe, pantallasVisibles, rutaDueña } from '../modulos';

/**
 * LAS PESTAÑAS — bloques 118 y 147.
 *
 * Dos niveles, los dos se pintan solos mirando la ruta actual:
 *
 *   1. LAS PANTALLAS DEL MÓDULO (bloque 147). El menú lateral ya sólo tiene
 *      una entrada por módulo; aquí arriba salen sus pantallas.
 *   2. LAS PESTAÑAS DE UNA PANTALLA (bloque 118): Todas / Preventivo /
 *      Correctivo / Mejora dentro de Órdenes, por ejemplo.
 *
 * SE OCULTA LO QUE NO SE PUEDE ABRIR. Enseñar una pestaña que devuelve 403 al
 * pulsarla es peor que no enseñarla: el usuario cree que el sistema falla, no
 * que no tiene permiso (la lección del bloque 67 con los botones).
 *
 * Con una sola opción no hay nada que elegir, y no se pinta: sería un adorno.
 */
export default function Pestanas() {
  const loc = useLocation();
  const { can, user } = useAuth();

  const modulo = moduloDe(loc.pathname);
  const delModulo = modulo ? pantallasVisibles(modulo, can, user) : [];
  const dueña = rutaDueña(loc.pathname);

  const internas = pestanasDe(loc.pathname).filter((p) => !p.permiso || can(p.permiso));

  const verModulo = delModulo.length >= 2;
  const verInternas = internas.length >= 2;
  if (!verModulo && !verInternas) return null;

  return (
    <div className="barra-modulo">
      {verModulo && (
        <nav className="subtabs" aria-label={modulo!.titulo}>
          {delModulo.map((p) => (
            <NavLink
              key={p.ruta}
              to={p.ruta}
              aria-current={p.ruta === dueña ? 'page' : undefined}
              className={() => 'subtab' + (p.ruta === dueña ? ' active' : '')}
            >
              {p.texto}
            </NavLink>
          ))}
        </nav>
      )}
      {verInternas && (
        <div className="train-tabs" role="tablist">
          {internas.map((p) => (
            <NavLink
              key={p.ruta}
              to={p.ruta}
              end
              role="tab"
              className={({ isActive }) => 'train-tab' + (isActive ? ' active' : '')}
            >
              {p.texto}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
