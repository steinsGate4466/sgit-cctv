import axios from 'axios';

const baseURL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/v1';

export const api = axios.create({ baseURL });

/* =========================================================================
   IDENTIFICADOR DE APARATO — "¿desde qué PC se hizo esto?"
   -------------------------------------------------------------------------
   HAY QUE DECIRLO CLARO PORQUE SE PREGUNTA SIEMPRE:
   **un navegador NO puede leer la MAC de la máquina.** La MAC es de capa 2 y
   no sale de la red local; ningún sitio web del mundo la ve. Lo que sí se
   puede es que este navegador se presente siempre con el mismo número.

   Es un número aleatorio que se genera una vez y se queda guardado. No dice
   quién eres —eso ya lo dice el token— sino SI ES EL MISMO APARATO DE
   SIEMPRE. Sirve para distinguir "entró desde el PC de siempre" de "entró
   desde un aparato que nunca habíamos visto", que es la pregunta real
   cuando algo huele mal.

   NO ES UNA MEDIDA DE SEGURIDAD: se borra limpiando el navegador y se puede
   falsificar. Es una pista de auditoría, y así está tratado en el servidor.
   La vinculación de aparato de verdad (bloque 13.1) va aparte y sí bloquea.
   ========================================================================= */
const CLAVE_DISPOSITIVO = 'sgit.dispositivo';

function idDeEsteAparato(): string {
  try {
    let v = localStorage.getItem(CLAVE_DISPOSITIVO);
    if (!v || v.length < 8) {
      // crypto.randomUUID no existe en navegadores viejos ni fuera de HTTPS.
      v = (globalThis.crypto?.randomUUID?.() ||
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`)
        .replace(/[^A-Za-z0-9-]/g, '');
      localStorage.setItem(CLAVE_DISPOSITIVO, v);
    }
    return v;
  } catch {
    // Navegador con el almacenamiento bloqueado. Sin identificador, y ya está:
    // el sistema tiene que seguir funcionando igual.
    return '';
  }
}

api.interceptors.request.use((config) => {
  const id = idDeEsteAparato();
  if (id) config.headers.set?.('X-Dispositivo', id);
  return config;
});

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


/* =============================================================================
   UNA SOLA RENOVACIÓN A LA VEZ — bloque 170
   -----------------------------------------------------------------------------
   EL BUG: «cuando estás mucho tiempo, aunque estés moviendo todo y cambiando
   de página, igual se sale».

   Cada 15 minutos caduca el token de acceso. La pantalla que estás abriendo
   lanza varias peticiones a la vez, todas reciben 401, y CADA UNA pedía
   renovar con el mismo refresh token. El servidor rota el token en la primera;
   la segunda llega tarde con el viejo y eso es exactamente la firma de un robo:
   cierra todas tus sesiones. Lo mismo con dos pestañas abiertas.

   Por eso aquí:
     1. En esta pestaña, una sola renovación en vuelo: las demás peticiones
        esperan a esa misma promesa en vez de lanzar la suya.
     2. Entre pestañas, un candado del navegador (Web Locks). Quien entra
        segundo mira primero si el token guardado ya cambió: si otra pestaña
        ya renovó, usa ese y no gasta el refresh.
     3. El servidor, además, perdona 30 s una reutilización por renovación
        (be/src/modules/auth/rotacion.ts) por si algo se escapa de aquí.
============================================================================= */
/* `null` = la sesión ya no vale (el servidor dijo 401/403): hay que salir.
   `'temporal'` = no se pudo renovar AHORA (sin red, servidor caído, 429): la
   sesión puede seguir viva, así que NO se echa a nadie; falla esta petición y
   la siguiente vuelve a probar. Antes, un 429 del freno echaba al usuario. */
type Renovado = string | null | 'temporal';
let enVuelo: Promise<Renovado> | null = null;

async function renovarAhora(enviado: string): Promise<Renovado> {
  // Otra pestaña (u otra petición) ya renovó mientras ésta esperaba.
  const actual = localStorage.getItem('sgit_token');
  if (actual && enviado && actual !== enviado) return actual;

  const refresh = localStorage.getItem('sgit_refresh');
  if (!refresh) return null;
  try {
    /* Auditoría 20/10: la renovación va con axios suelto (sin el interceptor
       de `api`), así que el identificador del aparato no viajaba y la sesión
       nueva —cada 15 min— nacía sin saber desde qué equipo era. */
    const aparato = idDeEsteAparato();
    const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken: refresh },
      aparato ? { headers: { 'X-Dispositivo': aparato } } : undefined);
    localStorage.setItem('sgit_token', data.accessToken);
    if (data.refreshToken) localStorage.setItem('sgit_refresh', data.refreshToken);

    /* LOS PERMISOS NUEVOS TAMBIÉN SE GUARDAN — bloque 86.
       La renovación trae los permisos frescos (el servidor los relee de la
       base). Si sólo se guardara el token, el menú y los botones seguirían con
       la lista del día en que la persona entró. Si no viene `user`, no se toca:
       vaciarlo dejaría el menú en blanco. */
    if (data.user) localStorage.setItem('sgit_user', JSON.stringify(data.user));
    return data.accessToken as string;
  } catch (e: any) {
    // Puede que otra pestaña haya renovado justo en medio: si el token
    // guardado ya no es el que se envió, ése vale.
    const tras = localStorage.getItem('sgit_token');
    if (tras && tras !== enviado) return tras;
    const st = e?.response?.status;
    return st === 401 || st === 403 ? null : 'temporal';
  }
}

export function renovarUnaVez(enviado: string): Promise<Renovado> {
  if (enVuelo) return enVuelo;
  const locks: any = (globalThis.navigator as any)?.locks;
  const tarea = locks?.request
    ? locks.request('sgit-renovar-sesion', () => renovarAhora(enviado))
    : renovarAhora(enviado);
  enVuelo = Promise.resolve(tarea).finally(() => { enVuelo = null; });
  return enVuelo;
}

// Ante un 401 (token de acceso expirado) NO se cierra sesión de golpe:
// se intenta RENOVAR con el refresh token y se reintenta la petición original.
// Solo si la renovación falla se cierra la sesión.
/* =============================================================================
   CUÁNDO SE TRAJERON LOS DATOS QUE HAY EN PANTALLA — bloque 112
   -----------------------------------------------------------------------------
   PETICIÓN DEL USUARIO, REPETIDA: «en cada dashboard siempre tiene que haber un
   apartado de fecha en la que se actualizó».

   Tenía razón y el número decía cuánta: de las 56 pantallas, **sólo 7** lo
   enseñaban. Las otras 49 dejaban creer que lo que se ve es de ahora mismo — y
   en el púlpito, donde la pantalla lleva ocho horas abierta, eso no es un
   detalle de presentación: es una pantalla que miente sin romperse.

   -----------------------------------------------------------------------------
   POR QUÉ SE HACE AQUÍ Y NO PANTALLA POR PANTALLA

   La forma evidente era añadir `cargadoEn` a las 49. Son tres ediciones en cada
   una —estado, marca al recibir, línea en el título— y CIENTO CUARENTA Y SIETE
   sitios donde equivocarse. Peor: la que se olvide queda igual que antes y
   nadie lo nota, porque la ausencia de un aviso no se ve.

   Aquí sólo hay un sitio: **toda respuesta buena de un GET deja su hora**. La
   cabecera la lee y la escribe. Las 56 pantallas quedan cubiertas de golpe, y
   una pantalla nueva nace cubierta sin que su autor tenga que acordarse.

   -----------------------------------------------------------------------------
   QUÉ DICE EXACTAMENTE, Y QUÉ NO

   Dice **cuándo llegó la última respuesta buena**. NO dice que todos los
   paneles de la pantalla sean de esa hora: si uno falló, el suyo es más viejo.
   Por eso el texto es «Datos traídos hace X» y no «todo está actualizado» —
   afirma un hecho comprobable en vez de una garantía que no se puede dar.

   Sólo cuentan los GET. Un POST que guarda algo no refresca lo que se ve, y
   contarlo pondría el contador a cero enseñando datos viejos: justo la mentira
   que esto viene a quitar.
============================================================================= */
let ultimaCargaMs: number | null = null;
const oyentes = new Set<(t: number | null) => void>();

/** Se llama al cambiar de pantalla: lo de antes no describe lo de ahora. */
export function reiniciarUltimaCarga() {
  ultimaCargaMs = null;
  for (const f of oyentes) f(null);
}

export function ultimaCarga(): number | null { return ultimaCargaMs; }

export function escucharUltimaCarga(f: (t: number | null) => void): () => void {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}

api.interceptors.response.use(
  (res) => {
    /* Bloque 112. Va antes de cualquier otra cosa: si algo de abajo lanzara,
       la hora quedaría sin registrar y la pantalla diría que no ha cargado. */
    if (String(res.config?.method || 'get').toLowerCase() === 'get') {
      ultimaCargaMs = Date.now();
      for (const f of oyentes) f(ultimaCargaMs);
    }
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
      } else if (status === 403) {
        /* EL 403 SÍ SE ANUNCIA — bloque 66.
           -------------------------------------------------------------------
           EL PROBLEMA QUE RESUELVE, y salió mirando la pantalla:

           Hay 128 `catch(() => [])` repartidos por 42 archivos. Convierten
           CUALQUIER fallo en una lista vacía. Con un error de red o un 500 el
           usuario sí se entera —lo anuncian las dos ramas de arriba—, pero con
           un 403 la pantalla se quedaba en blanco sin decir nada.

           Y un 403 no es «no hay datos»: es «no tienes permiso para verlos».
           El usuario ve una tabla vacía, concluye que faltan datos, y se pone
           a cargarlos. O peor: dice que el software no funciona. Le pasó al
           usuario y lo llamó «data muerta».

           Se anuncia en el aviso central y no dentro de cada pantalla porque
           así queda arreglado en los 42 archivos de golpe, sin tocar ninguno.

           400 y 404 siguen sin anunciarse: un 400 es un formulario mal
           rellenado —lo explica el propio formulario— y un 404 en una ficha
           concreta lo dice mejor la pantalla que lo pidió. */
        anunciar('No tienes permiso para ver esto. La pantalla puede salir vacía.', false);
      } else if (status === 429) {
        /* Bloque 171 · el freno del servidor. Antes llegaba sin cabeceras CORS
           y se leía como «el servidor no responde». Ahora llega legible y se
           dice lo que es, con cuánto esperar. */
        const espera = Number(err?.response?.headers?.['retry-after']) || 0;
        anunciar(espera
          ? `Demasiadas consultas seguidas. Espera ${espera} s y vuelve a intentarlo.`
          : 'Demasiadas consultas seguidas. Espera unos segundos y vuelve a intentarlo.', false);
      }
      // 400 y 404 NO se anuncian aquí: son respuestas con sentido y cada
      // pantalla las explica mejor en su contexto.
    }

    // Sólo login/refresh/logout quedan fuera: un 401 ahí no se arregla renovando.
    // (/auth/me y /auth/sesiones SÍ se renuevan como cualquier otra petición.)
    if (status === 401 && !original._retry && !/\/auth\/(login|refresh|logout)/.test(url)) {
      original._retry = true;
      const enviado = String(original.headers?.Authorization || '').replace(/^Bearer\s+/, '');
      const nuevo = await renovarUnaVez(enviado);
      if (nuevo === 'temporal') {
        anunciar('No se pudo renovar la sesión ahora mismo. Sigues dentro; vuelve a intentarlo en un momento.', false);
        return Promise.reject(err);
      }
      if (nuevo) {
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${nuevo}`;
        return api(original); // reintenta la petición original con el token nuevo
      }
      hardLogout();
    }
    return Promise.reject(err);
  },
);

/**
 * EL MOTIVO DE UN ERROR EN UNA DESCARGA — bloque 142.
 *
 * Con `responseType: 'blob'`, si el servidor contesta 400 el mensaje llega
 * DENTRO de un Blob y no en `response.data.message`. Sin esto la pantalla
 * decía «no se pudo generar» cuando el servidor sí explicaba por qué
 * («son 612 etiquetas, filtra por tren»).
 */
export async function motivoDelError(err: any, porDefecto: string): Promise<string> {
  const d = err?.response?.data;
  try {
    const cuerpo = d instanceof Blob ? JSON.parse(await d.text()) : d;
    const m = cuerpo?.message;
    if (Array.isArray(m)) return m.join(', ');
    if (typeof m === 'string' && m.trim()) return m;
  } catch { /* no era JSON: se usa el texto por defecto */ }
  return porDefecto;
}
