import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';

/**
 * DIÁLOGOS DE LA APLICACIÓN — bloque 35.
 *
 * =============================================================================
 *  QUÉ SE ESTÁ REEMPLAZANDO Y POR QUÉ IMPORTA
 * =============================================================================
 *  El sistema tenía 117 llamadas a `window.confirm`, `window.alert` y
 *  `window.prompt` repartidas por 35 archivos. Funcionan, pero son la ventana
 *  gris del navegador, y eso trae cuatro problemas concretos en planta:
 *
 *  1. LLEVAN LA DIRECCIÓN DEL SERVIDOR EN EL TÍTULO.
 *     Chrome escribe «aceros-arequipa-sgitcctv.up.railway.app dice:» encima de
 *     cada mensaje. En una demo ante Producción, lo primero que se lee no es
 *     la pregunta: es que esto corre en un servicio de terceros.
 *
 *  2. NO SE PUEDEN LEER EN EL CELULAR CON GUANTES.
 *     El cuadro nativo usa la tipografía del sistema a tamaño fijo, sin
 *     jerarquía. «¿Eliminar esta foto?» y «Vas a borrar 43 registros y no se
 *     recuperan» se ven exactamente igual de graves. Aquí no lo son.
 *
 *  3. BLOQUEAN EL HILO.
 *     `confirm()` congela la pestaña entera. Con una petición en curso, la
 *     barra de progreso se queda quieta y el técnico vuelve a pulsar.
 *
 *  4. EL NAVEGADOR PUEDE APAGARLOS.
 *     Si alguien marca «impedir que esta página cree más diálogos» —una
 *     casilla que Chrome ofrece tras varios seguidos— `confirm()` empieza a
 *     devolver `false` SIN PREGUNTAR. El botón deja de funcionar y no hay
 *     ningún error: simplemente no pasa nada. En una pantalla de borrado eso
 *     es benigno; en una de confirmación de trabajo hecho, no.
 *
 * =============================================================================
 *  POR QUÉ DEVUELVE UNA PROMESA Y NO UN ESTADO
 * =============================================================================
 *  La forma natural en React sería `const [abierto, setAbierto] = useState()`
 *  y partir cada acción en dos mitades: la que abre y la que continúa. Eso
 *  obliga a reescribir las 117 llamadas partiendo funciones por la mitad, y
 *  cada corte es una ocasión de perder una validación por el camino.
 *
 *  `window.confirm` es SÍNCRONO: el código dice «pregunta, y si dice que no,
 *  sal». Esa forma es la correcta y hay que conservarla. La única manera de
 *  conservarla sin bloquear el hilo es una promesa:
 *
 *      if (!(await confirmar({ ... })))) return;
 *
 *  El cambio en cada sitio es de una línea, y el orden de las comprobaciones
 *  se queda exactamente donde estaba.
 *
 * =============================================================================
 *  LO QUE HACE Y EL NATIVO NO
 * =============================================================================
 *   · Distingue PELIGRO de pregunta normal, con color y con el botón en rojo.
 *   · Puede exigir ESCRIBIR una palabra para confirmar. Un botón se pulsa por
 *     reflejo; escribir «BORRAR» obliga a leer.
 *   · Atrapa el foco dentro del diálogo (Tab no se escapa al fondo) y lo
 *     devuelve al botón de origen al cerrar. Es lo que espera un lector de
 *     pantalla, y también quien trabaja sólo con teclado.
 *   · Escape cancela, Enter acepta cuando no hay palabra que escribir.
 *   · `aria-modal` y `role="alertdialog"`, que es lo que corresponde a una
 *     pregunta que interrumpe.
 */

type Peticion = {
  tipo: 'confirmar' | 'avisar' | 'pedir';
  titulo: string;
  mensaje?: string;
  /** Texto del botón que sigue adelante. Por defecto «Aceptar». */
  aceptar?: string;
  cancelar?: string;
  /** Pinta el diálogo y el botón en rojo. Para lo que no se deshace. */
  peligro?: boolean;
  /** Si viene, hay que teclearlo exacto para poder aceptar. */
  exigeEscribir?: string;
  /** Sólo para 'pedir': valor inicial del campo. */
  valorInicial?: string;
  /** Sólo para 'pedir': si es true, no se puede aceptar en blanco. */
  obligatorio?: boolean;
  resolver: (v: any) => void;
};

type API = {
  /** Pregunta de sí o no. Devuelve `true` si la persona sigue adelante. */
  confirmar: (o: Omit<Peticion, 'tipo' | 'resolver'> | string) => Promise<boolean>;
  /** Un mensaje que sólo se lee. Devuelve cuando se cierra. */
  avisar: (o: Omit<Peticion, 'tipo' | 'resolver'> | string) => Promise<void>;
  /** Pide un texto. Devuelve `null` si se cancela — igual que window.prompt. */
  pedirTexto: (o: Omit<Peticion, 'tipo' | 'resolver'> | string) => Promise<string | null>;
};

const Ctx = createContext<API | null>(null);

/* Los selectores viven FUERA del efecto, y no es sólo por limpieza.
   `verificar-foco.cjs` busca la lista de dependencias de cada `useEffect` que
   llama a `.focus()`, y lo hace con una expresión regular. Con estos
   selectores dentro del cuerpo, sus corchetes —`[href]`, `[tabindex]`— le
   hacían creer que ESO era la lista de dependencias, y denunciaba un efecto
   que en realidad ya tenía `[]`.

   Se podría haber hecho más listo al verificador, pero eso es escribir un
   analizador de TypeScript para un problema que se resuelve sacando una
   constante. Y la constante deja el efecto más corto de leer, que era la otra
   mitad del asunto. */
const SEL_ENFOCABLE =
  'button:not([disabled]), input, textarea, [href], [tabindex]:not([tabindex="-1"])';
const SEL_ACEPTAR = '[data-aceptar]';

/**
 * SI NO HAY PROVEEDOR, NO SE CALLA.
 *
 * Devolver un `confirmar` que siempre diga «sí» convertiría un olvido de
 * montaje en un borrado sin preguntar. Devolver siempre «no» dejaría botones
 * muertos sin explicación. Las dos son peores que un error en la consola.
 */
export function useDialogos(): API {
  const api = useContext(Ctx);
  if (!api) {
    throw new Error(
      'useDialogos() fuera de <ProveedorDialogos>. Envuelve la aplicación en ' +
      'main.tsx: sin el proveedor no hay forma de preguntar nada.',
    );
  }
  return api;
}

const normalizar = (o: any): Omit<Peticion, 'tipo' | 'resolver'> =>
  typeof o === 'string' ? { titulo: o } : o;

export function ProveedorDialogos({ children }: { children: ReactNode }) {
  const [cola, setCola] = useState<Peticion[]>([]);
  const actual = cola[0];

  /* UNA COLA Y NO UN SOLO HUECO.
     Hay sitios que avisan dos veces seguidas (por ejemplo, al subir varios
     archivos y fallar dos). Con una sola ranura, el segundo aviso pisaba al
     primero y se perdía justo el mensaje que explicaba el fallo. */
  const encolar = useCallback((p: Omit<Peticion, 'resolver'>) =>
    new Promise<any>((resolver) => setCola((c) => [...c, { ...p, resolver }])), []);

  const api = useRef<API>({
    confirmar: (o) => encolar({ tipo: 'confirmar', ...normalizar(o) }),
    avisar: (o) => encolar({ tipo: 'avisar', ...normalizar(o) }),
    pedirTexto: (o) => encolar({ tipo: 'pedir', ...normalizar(o) }),
  }).current;

  const cerrar = useCallback((valor: any) => {
    setCola((c) => {
      c[0]?.resolver(valor);
      return c.slice(1);
    });
  }, []);

  return (
    <Ctx.Provider value={api}>
      {children}
      {actual && <Cuadro key={cola.length} p={actual} cerrar={cerrar} />}
    </Ctx.Provider>
  );
}

function Cuadro({ p, cerrar }: { p: Peticion; cerrar: (v: any) => void }) {
  const [texto, setTexto] = useState(p.valorInicial ?? '');
  const caja = useRef<HTMLDivElement>(null);
  const devolverFocoA = useRef<HTMLElement | null>(null);

  const esPedir = p.tipo === 'pedir';
  const esAviso = p.tipo === 'avisar';

  /* El valor con el que se «cancela» tiene que imitar al nativo, porque las
     llamadas que se están sustituyendo comprueban justo eso:
       confirm -> false     prompt -> null     alert -> undefined  */
  const valorAlCancelar = esPedir ? null : esAviso ? undefined : false;

  const puedeAceptar =
    (!p.exigeEscribir || texto.trim().toUpperCase() === p.exigeEscribir.trim().toUpperCase())
    && (!esPedir || !p.obligatorio || texto.trim().length > 0);

  const aceptar = () => cerrar(esPedir ? texto : esAviso ? undefined : true);

  /* FOCO: entra, se queda dentro, y vuelve de donde vino.
     ------------------------------------------------------------------
     Sin atrapar el foco, un Tab se va a los botones DE DETRÁS del diálogo:
     con teclado se puede pulsar «Eliminar» de la fila de al lado creyendo
     que se está respondiendo a la pregunta. El nativo no tiene este problema
     porque lo gestiona el navegador; al hacerlo nosotros, nos toca a nosotros.

     Las dependencias son [] a propósito: montar y desmontar. Si dependiera de
     algo que cambia al escribir, el foco saltaría con cada tecla — es
     exactamente el fallo que se corrigió en Modal.tsx el 05/08. */
  useEffect(() => {
    devolverFocoA.current = document.activeElement as HTMLElement;
    const enfocables = () => Array.from(
      caja.current?.querySelectorAll<HTMLElement>(SEL_ENFOCABLE) ?? []);

    // Lo primero enfocado: el campo si lo hay, si no el botón de aceptar.
    const primero = caja.current?.querySelector<HTMLElement>('input, textarea')
      ?? caja.current?.querySelector<HTMLElement>(SEL_ACEPTAR);
    primero?.focus();

    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); cerrarRef.current(); return; }
      if (e.key !== 'Tab') return;
      const f = enfocables();
      if (!f.length) return;
      const primeroF = f[0]; const ultimo = f[f.length - 1];
      if (e.shiftKey && document.activeElement === primeroF) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeroF.focus(); }
    };
    document.addEventListener('keydown', alTeclado);

    // El fondo no hace scroll: en el celular, deslizar movía la página de
    // detrás y al cerrar aparecías en otro sitio de la lista.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', alTeclado);
      document.body.style.overflow = overflow;
      devolverFocoA.current?.focus?.();
    };
  }, []);

  // Escape siempre cancela con el valor que imita al nativo. Se guarda en una
  // referencia para que el efecto de arriba no dependa de nada que cambie.
  const cerrarRef = useRef(() => cerrar(valorAlCancelar));
  cerrarRef.current = () => cerrar(valorAlCancelar);

  return (
    <div
      className="dlg-fondo"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !p.peligro) cerrarRef.current(); }}
    >
      <div
        ref={caja}
        className={'dlg' + (p.peligro ? ' dlg-peligro' : '')}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dlg-titulo"
      >
        <h2 className="dlg-titulo" id="dlg-titulo">{p.titulo}</h2>

        {/* Los saltos de línea del mensaje se respetan: muchos de los textos
            que se están migrando venían con «\n\n» para separar la pregunta
            de la consecuencia, y esa separación es la que hace que se lea. */}
        {p.mensaje && <p className="dlg-mensaje">{p.mensaje}</p>}

        {esPedir && (
          <textarea
            className="dlg-campo"
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && puedeAceptar) aceptar();
            }}
          />
        )}

        {p.exigeEscribir && (
          <>
            <label className="dlg-etiqueta">
              Escribe <b>{p.exigeEscribir}</b> para confirmar
            </label>
            <input
              className="dlg-campo"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && puedeAceptar) aceptar(); }}
              autoComplete="off"
            />
          </>
        )}

        <div className="dlg-acciones">
          {!esAviso && (
            <button className="btn-mini" onClick={() => cerrarRef.current()}>
              {p.cancelar ?? 'Cancelar'}
            </button>
          )}
          <button
            data-aceptar
            className={p.peligro ? 'btn-peligro' : 'btn'}
            disabled={!puedeAceptar}
            onClick={aceptar}
          >
            {p.aceptar ?? (esAviso ? 'Entendido' : 'Aceptar')}
          </button>
        </div>
      </div>
    </div>
  );
}
