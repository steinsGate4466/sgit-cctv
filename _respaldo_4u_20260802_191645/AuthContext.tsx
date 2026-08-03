import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api } from '../api/client';
import { useInactivity } from './useInactivity';

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
    setUser(data.user);
  }

  const logout = useCallback((motivo?: string) => {
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

  const cerrarPorInactividad = useCallback(() => logout('inactividad'), [logout]);
  const { restante, seguir, minutosCierre } = useInactivity(!!user, cerrarPorInactividad);

  // Comprueba si el usuario tiene un permiso (para mostrar/ocultar acciones en la UI).
  const can = (permission: string) => (user?.permissions || []).includes(permission);

  return (
    <Ctx.Provider value={{ user, login, logout, can }}>
      {children}
      {restante !== null && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '26px 28px', maxWidth: 380,
            width: 'calc(100% - 32px)', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,.3)',
          }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>¿Sigues ahí?</div>
            <div style={{ fontSize: 14, color: '#475569', marginBottom: 6 }}>
              Tu sesión se cerrará en <strong>{restante}</strong> segundo{restante === 1 ? '' : 's'}
              {' '}por inactividad.
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 18 }}>
              El sistema muestra direcciones IP y contraseñas de equipos de planta.
              Por eso se cierra sola a los {minutosCierre} minutos sin uso.
            </div>
            <button className="btn-primary" style={{ width: '100%' }} onClick={seguir}>
              Sigo aquí
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
