import axios from 'axios';

const baseURL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/v1';

export const api = axios.create({ baseURL });

/* =========================================================================
   AVISO DE FALLO — el arreglo de los 92 errores tragados
   -------------------------------------------------------------------------
   EL PROBLEMA
   Por todo el frontend hay 92 sitios escritos así:

       api.get('/algo').then(r => r.data).catch(() => [])

   Cuando el servidor falla, ese `catch` devuelve una lista vacía y la
   pantalla enseña "no hay datos". El técnico lo lee como "no hay nada
   pendiente" y sigue con su día. En una lista de trabajo, ése es el peor
   error posible: no es que falte información, es que el sistema afirma que
   no hay trabajo cuando sí lo hay.

   POR QUÉ SE ARREGLA AQUÍ Y NO EN LAS 92 PANTALLAS
   Reescribir 92 llamadas a mano significa 92 oportunidades de romper la
   lógica de una pantalla que hoy funciona, y garantiza que la número 93 —la
   que escriba alguien el mes que viene— vuelva a tragarse el error.

   Aquí el fallo se anuncia ANTES de que el `catch` de la pantalla lo
   silencie. La pantalla puede seguir enseñando su lista vacía; lo que ya no
   puede es que el usuario no se entere de que hubo un fallo.

   Se avisa sólo de lo que el usuario no puede deducir por su cuenta:
   servidor caído, sin red, o error del servidor. Un 404 o un 400 los
   gestiona cada pantalla con su mensaje, que es más útil.
   ========================================================================= */

type Escucha = (aviso: { texto: string; grave: boolean } | null) => void;
const escuchas = new Set<Escucha>();

export function alFallarLaRed(fn: Escucha): () => void {
  escuchas.add(fn);
  return () => escuchas.delete(fn);
}

function anunciar(texto: string, grave = true) {
  escuchas.forEach((f) => f({ texto, grave }));
}

export function limpiarAvisoDeRed() {
  escuchas.forEach((f) => f(null));
}

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
  (res) => {
    // Una respuesta buena retira el aviso: si vuelve la red, la franja se va
    // sola. Dejarla puesta hasta que el usuario la cierre haría que la gente
    // aprendiera a ignorarla, que es como muere cualquier aviso.
    limpiarAvisoDeRed();
    return res;
  },
  async (err) => {
    const original: any = err.config || {};
    const status = err?.response?.status;
    const url = String(original.url || '');

    // ---- Aviso al usuario ANTES de que la pantalla se trague el error ----
    // El login se excluye: ahí el error se enseña dentro del formulario, y
    // un aviso flotante encima sería decir dos veces lo mismo.
    if (!url.includes('/auth/login')) {
      if (!err.response) {
        // Sin respuesta: o no hay red, o el servidor no está.
        anunciar(
          navigator.onLine
            ? 'El servidor no responde. Lo que ves puede estar incompleto.'
            : 'Sin conexión. Lo que ves es lo último que se cargó.',
        );
      } else if (status >= 500) {
        anunciar('El servidor dio un error. Lo que ves puede estar incompleto.');
      }
      // 400, 403 y 404 NO se anuncian aquí: son respuestas con sentido y
      // cada pantalla las explica mejor en su contexto.
    }

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
