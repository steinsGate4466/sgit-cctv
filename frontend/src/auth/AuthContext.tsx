import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api } from '../api/client';
import { useInactivity } from './useInactivity';
import { registrarSalida, olvidarSalida } from './salida';

/** Bloque 183. Cuenta de pantalla fija: sin cierre por inactividad. */
export const PERMISO_PANTALLA_FIJA = 'sesion.pantalla_fija';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
  /** Trenes que puede ver. Vacío = todos. Lo decide el ingeniero (4C). */
  ambitoTrenes?: string[];
}

interface AuthCtx {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: (motivo?: string) => void;
  can: (permission: string) => boolean;
  /** Vuelve a pedir el perfil al servidor. `false` si no se pudo. */
  refrescarPerfil: () => Promise<boolean>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('sgit_user');
    return raw ? JSON.parse(raw) : null;
  });

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('sgit_token', data.accessToken);
    if (data.refreshToken) localStorage.setItem('sgit_refresh', data.refreshToken);
    localStorage.setItem('sgit_user', JSON.stringify(data.user));
    olvidarSalida();
    setUser(data.user);
  }

  const logout = useCallback((motivo?: string) => {
    // SE AVISA AL SERVIDOR ANTES DE BORRAR NADA.
    //
    // Hasta ahora "cerrar sesión" sólo borraba el token del navegador: en el
    // servidor la sesión seguía viva hasta caducar, y un token robado seguía
    // funcionando. Ahora se revoca de verdad.
    //
    // No se espera la respuesta: si el servidor no contesta, el usuario sale
    // igual. Dejarlo dentro porque falló la red sería lo peor de los dos
    // mundos — y la sesión caduca sola de todas formas.
    const refresh = localStorage.getItem('sgit_refresh');
    api.post('/auth/logout', { refreshToken: refresh }).catch(() => undefined);

    localStorage.removeItem('sgit_token');
    localStorage.removeItem('sgit_refresh');
    localStorage.removeItem('sgit_user');
    setUser(null);
    // El motivo se muestra en la pantalla de acceso: si la sesión se cerró
    // sola, el usuario tiene que entender por qué y no creer que fue un fallo.
    //
    // Se comprueba que sea texto a propósito: si alguien escribe
    // onClick={logout}, React pasa el evento del clic como primer argumento y
    // la URL quedaría /login?motivo=[object Object]. Aquí se ignora.
    const valido = typeof motivo === 'string' && motivo.length > 0;
    location.href = valido ? `/login?motivo=${encodeURIComponent(motivo!)}` : '/login';
  }, []);

  // AL ABRIR LA APLICACIÓN SE RELEE EL PERFIL DEL SERVIDOR.
  //
  // El usuario guardado en el navegador es de cuando inició sesión, y puede
  // tener horas. Si el ingeniero le cambió el rol o le acotó los trenes, el
  // menú seguiría enseñándole lo de antes hasta que volviera a entrar.
  //
  // Esto NO es la seguridad —el servidor ya rechaza lo que no toca— sino
  // evitar la peor cara de un permiso: pulsar una opción que sigue en el
  // menú y recibir un error, sin entender por qué.
  //
  // Si la llamada falla no se cierra la sesión: puede ser un corte de red y
  // dejar tirado a alguien en planta por eso sería peor que el problema.
  /* LA MISMA RECARGA, PERO TAMBIÉN A MANO — bloque 86.
     -------------------------------------------------------------------------
     Petición del usuario: «en caso de que se deban actualizar ciertos permisos
     que exista un botón actualizar».

     Ahora el cambio de rol se aplica solo, pero el botón sigue haciendo falta
     por dos motivos que no son teóricos: si hay un corte de red justo en ese
     momento, la recarga automática falla en silencio —y así está escrito,
     porque dejar tirado a alguien en planta sería peor—; y porque cuando algo
     no se ve, **poder pulsar algo es la diferencia entre esperar y resolver**.

     Devuelve si pudo o no, para que la pantalla lo DIGA. Un botón que refresca
     sin confirmar nada es indistinguible de uno roto. */
  const refrescarPerfil = useCallback(async (): Promise<boolean> => {
    try {
      const { data } = await api.get('/auth/me');
      if (!data) return false;
      /* `data` primero NO: el orden es `...user, ...data` para que lo que trae
         el servidor pise a lo guardado. Al revés, lo viejo ganaría y el botón
         no serviría para nada. */
      const fresco = { ...(user as any), ...data };
      localStorage.setItem('sgit_user', JSON.stringify(fresco));
      setUser(fresco);
      return true;
    } catch {
      return false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let vigente = true;
    api.get('/auth/me')
      .then(({ data }) => {
        if (!vigente || !data) return;
        const fresco = { ...user, ...data };
        localStorage.setItem('sgit_user', JSON.stringify(fresco));
        setUser(fresco);
      })
      .catch(() => { /* corte de red: se sigue con lo que había */ });
    return () => { vigente = false; };
    // Sólo al montar y al cambiar de identidad. Con `user` entero en las
    // dependencias se llamaría en bucle, porque la propia llamada lo cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* BLOQUE 183 · EL CIERRE POR INACTIVIDAD VUELVE, BIEN HECHO.
     El bloque 182 lo quitó; Cristhian lo pidió de vuelta como barrera de
     seguridad «pero bien hecho». Lo que cambió está en useInactivity.ts.
     La PANTALLA FIJA del púlpito (permiso `sesion.pantalla_fija`, sólo
     lectura forzada en el servidor) no lleva reloj: un monitor con el mapa
     abierto todo el turno no es una sesión abandonada. */
  const pantallaFija = (user?.permissions || []).includes(PERMISO_PANTALLA_FIJA);
  const cerrarPorInactividad = useCallback((minutos: number) => {
    registrarSalida('inactividad', String(minutos));
    logout('inactividad');
  }, [logout]);
  const { restante, seguir, minutosCierre } = useInactivity(!!user && !pantallaFija, cerrarPorInactividad);

  /* CERRAR EN UNA PESTAÑA CIERRA EN TODAS. Antes la otra pestaña seguía
     «dentro» con el token ya borrado y a los minutos fallaba sin explicar
     nada, o te mandaba al acceso sin decir por qué. */
  useEffect(() => {
    if (!user) return;
    const alCambiar = (e: StorageEvent) => {
      if (e.key !== 'sgit_token' || e.newValue) return;
      setUser(null);
      if (location.pathname !== '/login') {
        location.href = '/login?motivo=otra-pestana';
      }
    };
    window.addEventListener('storage', alCambiar);
    return () => window.removeEventListener('storage', alCambiar);
  }, [user]);

  // Comprueba si el usuario tiene un permiso (para mostrar/ocultar acciones en la UI).
  const can = (permission: string) => (user?.permissions || []).includes(permission);

  return (
    <Ctx.Provider value={{ user, login, logout, can, refrescarPerfil }}>
      {children}
      {restante !== null && (
        <div className="aviso-inactividad" role="alertdialog" aria-modal="true" aria-labelledby="aviso-inact-tit">
          <div className="aviso-inactividad-caja">
            <div id="aviso-inact-tit" className="aviso-inactividad-tit">¿Sigues ahí?</div>
            <div className="aviso-inactividad-txt">
              La sesión se cierra en <strong>{restante}</strong> segundo{restante === 1 ? '' : 's'}.
              Mueve el ratón, toca la pantalla o pulsa el botón.
            </div>
            <div className="aviso-inactividad-nota">
              Se cierra a los {minutosCierre} minutos sin uso: aquí hay IP y contraseñas de equipos.
            </div>
            <button className="btn-primary" style={{ width: '100%' }} onClick={seguir} autoFocus>
              Sigo aquí
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
