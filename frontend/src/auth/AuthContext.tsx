import { createContext, useContext, useState, ReactNode } from 'react';
import { api } from '../api/client';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
}

interface AuthCtx {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
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

  function logout() {
    localStorage.removeItem('sgit_token');
    localStorage.removeItem('sgit_refresh');
    localStorage.removeItem('sgit_user');
    setUser(null);
    location.href = '/login';
  }

  // Comprueba si el usuario tiene un permiso (para mostrar/ocultar acciones en la UI).
  const can = (permission: string) => (user?.permissions || []).includes(permission);

  return <Ctx.Provider value={{ user, login, logout, can }}>{children}</Ctx.Provider>;
}
