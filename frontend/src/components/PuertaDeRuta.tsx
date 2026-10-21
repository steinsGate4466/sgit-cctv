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
/* AUDITORÍA 20/10 · el porqué depende de QUIÉN pregunta. Al Jefe de
   Mantenimiento le decía «pídeselo al Jefe de Mantenimiento»: él reparte los
   accesos, y esas pantallas son de otro perfil, no le faltan a él. */
function porQue(ruta: string, modulo: string | undefined, can: (p: string) => boolean,
  user: { ambitoTrenes?: string[] | null } | null | undefined): string {
  if (ruta === '/mi-tren' && !(user?.ambitoTrenes?.length)) {
    return 'Mi tren sale cuando tu usuario tiene un tren asignado. Se asigna en Ajustes › Usuarios.';
  }
  const donde = modulo ? `Es parte de «${modulo}» y es de otro perfil. ` : 'Es de otro perfil. ';
  if (can('role.manage')) return donde + 'Tú repartes los accesos: si alguien la necesita, se da en Ajustes › Roles.';
  return donde + 'Si la necesitas, pídeselo al Jefe de Mantenimiento.';
}

export default function PuertaDeRuta({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { can, user, refrescarPerfil } = useAuth();
  if (puedeAbrir(pathname, can, user)) return <>{children}</>;
  const m = moduloDe(pathname);
  return (
    <div className="card vacio puerta-ruta">
      <span className="puerta-ruta-ico"><Icono n="candado" size={26} /></span>
      <h3>{'Esta pantalla no está en tu menú'}</h3>
      <p className="muted">{porQue(pathname, m?.titulo, can, user)}</p>
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
