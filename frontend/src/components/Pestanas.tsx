import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { pestanasDe } from '../pestanas';

/**
 * LA BARRA DE PESTAÑAS — bloque 118.
 *
 * Se pinta sola: mira la ruta actual y, si esa pantalla pertenece a un grupo,
 * enseña el grupo entero. Una pantalla que no está en ningún grupo no pinta
 * nada, así que ponerla en todas partes no molesta a ninguna.
 *
 * SE OCULTA LA PESTAÑA QUE NO SE PUEDE ABRIR. Enseñar una pestaña que devuelve
 * 403 al pulsarla es peor que no enseñarla: el usuario cree que el sistema
 * falla, no que no tiene permiso (la lección del bloque 67 con los botones).
 */
export default function Pestanas() {
  const loc = useLocation();
  const { can } = useAuth();

  const todas = pestanasDe(loc.pathname);
  const visibles = todas.filter((p) => !p.permiso || can(p.permiso));

  // Con una sola pestaña no hay nada que elegir: sería un adorno.
  if (visibles.length < 2) return null;

  return (
    <div className="train-tabs" role="tablist">
      {visibles.map((p) => (
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
  );
}
