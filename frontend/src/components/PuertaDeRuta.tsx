import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { inicioPara, moduloDe, puedeAbrir } from '../modulos';
import Icono from './Iconos';

/**
 * PANTALLA QUE NO ES DE TU ROL — bloque 171.
 *
 * En vez de cargarla, recibir 403 y quedar vacía, se dice qué pasa y a dónde
 * ir. Ver `puedeAbrir` en modulos.ts.
 */
export default function PuertaDeRuta({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { can, user, refrescarPerfil } = useAuth();
  if (puedeAbrir(pathname, can, user)) return <>{children}</>;
  const m = moduloDe(pathname);
  return (
    <div className="card vacio puerta-ruta">
      <span className="puerta-ruta-ico"><Icono n="candado" size={26} /></span>
      <h3>{'Esta pantalla no está en tu menú'}</h3>
      <p className="muted">
        {m
          ? `Es parte de «${m.titulo}» y tu rol no tiene acceso a ella. Si la necesitas, pídeselo al Jefe de Mantenimiento.`
          : 'Tu rol no tiene acceso a ella. Si la necesitas, pídeselo al Jefe de Mantenimiento.'}
      </p>
      <div className="puerta-ruta-botones">
        <Link className="btn-primary" to={inicioPara(can, user)}>{'Ir a mi inicio'}</Link>
        <Link className="btn-mini" to="/modulos">{'Ver lo que sí puedo abrir'}</Link>
        <button type="button" className="btn-mini" onClick={() => { refrescarPerfil(); }}
          title="Si te acaban de dar el permiso, esto lo trae sin volver a entrar">
          {'Ya me dieron acceso'}
        </button>
      </div>
    </div>
  );
}
