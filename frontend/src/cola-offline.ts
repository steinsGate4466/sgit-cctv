/**
 * BORRADORES SIN SEÑAL (bloque 12.6).
 *
 * EL PROBLEMA REAL
 * Los técnicos usan DATOS MÓVILES dentro de naves de estructura metálica.
 * Van a perder señal a mitad del informe. Hoy eso significa perder lo
 * escrito, y eso es exactamente lo que hace que la gente vuelva al cuaderno.
 * Es riesgo de ADOPCIÓN, no técnico: el sistema mejor hecho del mundo no
 * sirve si el primer día te borra lo que escribiste.
 *
 * LA REGLA QUE HACE ESTO SEGURO
 * **Sólo se activa cuando la subida FALLA.** El camino normal no se toca:
 * si hay señal, la petición sale y aquí no pasa nada. Por eso este archivo
 * no puede romper nada que hoy funcione — sólo entra en escena donde antes
 * había un error y se perdía el trabajo.
 *
 * DÓNDE SE GUARDA
 * En IndexedDB del propio navegador del teléfono. No en `localStorage`:
 * ése tiene ~5 MB y es síncrono (bloquea la pantalla al escribir). IndexedDB
 * aguanta mucho más y no congela la interfaz.
 *
 * LO QUE NO PROMETE, DICHO CLARO
 *   · Si el técnico borra los datos del navegador, se pierden.
 *   · Si cambia de teléfono, no viajan.
 *   · Las fotos ocupan; por eso van aparte y se avisa si no caben.
 * Por eso se llama BORRADOR y no "enviado". La pantalla nunca debe decir
 * que algo se guardó en el sistema cuando sólo está en el teléfono.
 */

const BD = 'sgit-offline';
const ALMACEN = 'pendientes';
const VERSION = 1;

export interface Pendiente {
  id: string;
  /** Ruta relativa de la API, tal cual se llamaría con axios. */
  url: string;
  metodo: 'post' | 'patch';
  cuerpo: any;
  /** Para enseñarlo en la lista sin adivinar qué era. */
  titulo: string;
  creadoEn: number;
  intentos: number;
  ultimoError?: string;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const req = indexedDB.open(BD, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  });
}

/**
 * Todas las operaciones van envueltas: si IndexedDB no está disponible
 * —navegador viejo, modo privado, permisos— el sistema debe seguir
 * funcionando igual que antes, sin cola. Nunca romper por la red de
 * seguridad.
 */
async function conBD<T>(fn: (db: IDBDatabase) => Promise<T>, siFalla: T): Promise<T> {
  try {
    if (typeof indexedDB === 'undefined') return siFalla;
    const db = await abrir();
    const r = await fn(db);
    db.close();
    return r;
  } catch {
    return siFalla;
  }
}

export async function guardarPendiente(p: Omit<Pendiente, 'id' | 'creadoEn' | 'intentos'>): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fila: Pendiente = { ...p, id, creadoEn: Date.now(), intentos: 0 };
  await conBD(async (db) => {
    await new Promise<void>((ok, mal) => {
      const tx = db.transaction(ALMACEN, 'readwrite');
      tx.objectStore(ALMACEN).put(fila);
      tx.oncomplete = () => ok();
      tx.onerror = () => mal(tx.error);
    });
  }, undefined);
  avisar();
  return id;
}

export async function listarPendientes(): Promise<Pendiente[]> {
  return conBD(
    (db) =>
      new Promise<Pendiente[]>((ok) => {
        const tx = db.transaction(ALMACEN, 'readonly');
        const req = tx.objectStore(ALMACEN).getAll();
        req.onsuccess = () => ok((req.result || []).sort((a, b) => a.creadoEn - b.creadoEn));
        req.onerror = () => ok([]);
      }),
    [],
  );
}

export async function borrarPendiente(id: string): Promise<void> {
  await conBD(async (db) => {
    await new Promise<void>((ok) => {
      const tx = db.transaction(ALMACEN, 'readwrite');
      tx.objectStore(ALMACEN).delete(id);
      tx.oncomplete = () => ok();
      tx.onerror = () => ok();
    });
  }, undefined);
  avisar();
}

async function anotarFallo(p: Pendiente, error: string): Promise<void> {
  await conBD(async (db) => {
    await new Promise<void>((ok) => {
      const tx = db.transaction(ALMACEN, 'readwrite');
      tx.objectStore(ALMACEN).put({ ...p, intentos: p.intentos + 1, ultimoError: error });
      tx.oncomplete = () => ok();
      tx.onerror = () => ok();
    });
  }, undefined);
}

/* ---------- aviso a la interfaz ---------- */

type Escucha = (n: number) => void;
const escuchas = new Set<Escucha>();

export function alCambiarPendientes(fn: Escucha): () => void {
  escuchas.add(fn);
  listarPendientes().then((l) => fn(l.length));
  return () => escuchas.delete(fn);
}

async function avisar() {
  const l = await listarPendientes();
  for (const fn of escuchas) {
    try { fn(l.length); } catch { /* una escucha rota no tumba a las demás */ }
  }
}

/* ---------- reintento ---------- */

let enMarcha = false;

/**
 * Intenta subir todo lo pendiente, de lo más viejo a lo más nuevo.
 *
 * EN ORDEN Y DE UNO EN UNO a propósito: si el técnico registró un avance y
 * luego el cierre de la misma orden, subir el cierre primero daría un error
 * o —peor— dejaría el avance encima del cierre.
 *
 * Se para en el PRIMER fallo de red. Si no hay señal, insistir con los 20
 * siguientes sólo gasta batería.
 */
export async function subirPendientes(
  enviar: (p: Pendiente) => Promise<void>,
): Promise<{ subidos: number; quedan: number }> {
  if (enMarcha) return { subidos: 0, quedan: (await listarPendientes()).length };
  enMarcha = true;
  let subidos = 0;
  try {
    const lista = await listarPendientes();
    for (const p of lista) {
      try {
        await enviar(p);
        await borrarPendiente(p.id);
        subidos++;
      } catch (e: any) {
        const estado = e?.response?.status;
        // 4xx = el servidor lo rechazó por su contenido. Reintentar no lo va
        // a arreglar nunca, y dejarlo en la cola es prometer algo que no va a
        // pasar. Se anota el motivo y se deja para que la persona decida.
        if (estado && estado >= 400 && estado < 500) {
          await anotarFallo(p, e?.response?.data?.message || `Rechazado (${estado})`);
          continue;
        }
        // Sin respuesta o 5xx = sigue sin haber camino. Se para aquí.
        await anotarFallo(p, 'Sin conexión');
        break;
      }
    }
  } finally {
    enMarcha = false;
    await avisar();
  }
  return { subidos, quedan: (await listarPendientes()).length };
}

/** ¿El navegador cree que hay red? Es una pista, no una certeza. */
export const hayRed = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
