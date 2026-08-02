import axios from 'axios';

const baseURL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/v1';

export const api = axios.create({ baseURL });

// Adjunta el token JWT (guardado en localStorage) a cada petición.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sgit_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function hardLogout() {
  localStorage.removeItem('sgit_token');
  localStorage.removeItem('sgit_refresh');
  localStorage.removeItem('sgit_user');
  if (location.pathname !== '/login') location.href = '/login';
}

// Ante un 401 (token de acceso expirado) NO se cierra sesión de golpe:
// se intenta RENOVAR con el refresh token y se reintenta la petición original.
// Solo si la renovación falla se cierra la sesión.
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original: any = err.config || {};
    const status = err?.response?.status;
    const url = String(original.url || '');

    // Los fallos de /auth/ (login/refresh) no disparan renovación ni logout aquí.
    if (status === 401 && !original._retry && !url.includes('/auth/')) {
      original._retry = true;
      const refresh = localStorage.getItem('sgit_refresh');
      if (refresh) {
        try {
          const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken: refresh });
          localStorage.setItem('sgit_token', data.accessToken);
          if (data.refreshToken) localStorage.setItem('sgit_refresh', data.refreshToken);
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original); // reintenta la petición original con el token nuevo
        } catch {
          // el refresh también falló: recién ahí cerramos sesión
        }
      }
      hardLogout();
    }
    return Promise.reject(err);
  },
);
