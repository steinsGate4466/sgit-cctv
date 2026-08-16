import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import Icono from './Iconos';

/**
 * EL PATRÓN DE PANTALLA — bloque 38.
 *
 * =============================================================================
 *  EL PROBLEMA QUE SE MIDIÓ ANTES DE TOCAR NADA
 * =============================================================================
 *  Una auditoría de las 44 pantallas dio 9 454 palabras de texto visible: una
 *  media de 214 por pantalla. Media página de prosa ENCIMA de los datos, antes
 *  de llegar al dato. Activos llegaba a 666 palabras, 12 columnas y 28 campos.
 *
 *  Y algo peor que el volumen: sólo 5 de 44 pantallas tenían indicadores
 *  arriba. Las otras 39 abrían directamente en una tabla. Cada pantalla se
 *  había inventado su propia forma, así que había que reaprender en cada clic.
 *
 *  El error de fondo fue escribir la DOCUMENTACIÓN dentro de la interfaz. Esas
 *  tarjetas azules explicaban decisiones de diseño. El jefe de producción las
 *  lee una vez y a partir de ahí son ruido permanente que tapa la respuesta.
 *
 * =============================================================================
 *  LA REGLA
 * =============================================================================
 *      Arriba la respuesta. En medio lo que hay que hacer.
 *      Abajo, y sólo si se pide, el detalle.
 *
 *  Y una prueba para cada pantalla: si el jefe la mira CINCO SEGUNDOS desde la
 *  puerta, ¿sabe si tiene que hacer algo? Si hay que leer para saberlo, la
 *  pantalla está mal.
 *
 * =============================================================================
 *  DOS DISPOSITIVOS, DOS PERSONAS DISTINTAS
 * =============================================================================
 *  No es la misma pantalla más estrecha:
 *
 *   · EL JEFE, en el PC del púlpito, LEE Y DECIDE. Quiere comparar, ver quién
 *     tiene qué, ordenar. Ahí la tabla es lo correcto.
 *
 *   · EL TÉCNICO, en SU teléfono, HACE. Con guante, con reflejo del sol, con
 *     una mano, a veces sin señal. Ahí una tabla de seis columnas no sirve:
 *     necesita una tarjeta por cosa y el botón grande abajo, donde llega el
 *     pulgar.
 *
 *  El titular y la lista de acciones son LOS MISMOS en los dos. Lo que cambia
 *  es de ahí para abajo.
 */

/* =============================================================================
   1. EL TITULAR — la respuesta, en una frase
   ============================================================================= */

export type Tono = 'grave' | 'atender' | 'bien' | 'sindatos';

const TONO: Record<Tono, { fondo: string; texto: string; apoyo: string; icono: string }> = {
  grave:    { fondo: '#fdeceb', texto: '#7f1d1d', apoyo: '#a32d2d', icono: 'alerta' },
  atender:  { fondo: '#fdf3e2', texto: '#78350f', apoyo: '#92500b', icono: 'reloj' },
  bien:     { fondo: '#eaf5ed', texto: '#14532d', apoyo: '#166534', icono: 'ok' },
  /* Gris a propósito, ni verde ni rojo. «No sé» no es «está bien» y tampoco
     «está mal». El gris no tranquiliza, que es justo lo que se busca. */
  sindatos: { fondo: '#f1f4f7', texto: '#334155', apoyo: '#475569', icono: 'nota' },
};

/**
 * La frase que responde la pregunta de la pantalla.
 *
 * EL TEXTO LO REDACTA EL BACKEND, no esta pantalla. Así dice exactamente lo
 * mismo en la web, en el PDF y en el aviso de Telegram. Si lo escribiera cada
 * pantalla, el mismo dato acabaría contado de tres formas distintas.
 *
 * CUANDO NO HAY NADA QUE HACER, EL TITULAR TAMBIÉN LO DICE. Una pantalla en
 * blanco parece rota; «Los tres trenes con vista completa» en verde cierra la
 * consulta en dos segundos, que es el objetivo.
 */
export function Titular({
  tono, texto, apoyo, children,
}: {
  tono: Tono;
  texto: string;
  /** Segunda línea: el detalle que convierte el dato en decisión. */
  apoyo?: ReactNode;
  children?: ReactNode;
}) {
  const c = TONO[tono];
  return (
    <div className="titular" style={{ background: c.fondo }}>
      <Icono n={c.icono as any} size={22} />
      <div style={{ minWidth: 0 }}>
        <div className="titular-frase" style={{ color: c.texto }}>{texto}</div>
        {apoyo && <div className="titular-apoyo" style={{ color: c.apoyo }}>{apoyo}</div>}
        {children}
      </div>
    </div>
  );
}

/* =============================================================================
   2. LO QUE HAY QUE HACER — máximo cinco, ordenadas por lo que duele
   ============================================================================= */

export type Accion = {
  id: string;
  /** Pastilla de la izquierda: «3 días», «hoy», «vencida». */
  marca?: string;
  /** El tono de la pastilla. */
  tono?: Tono;
  /** Lo que hay que hacer, en una línea. */
  texto: string;
  /** Dónde está, en una línea más corta. */
  donde?: string;
  /** A dónde lleva al pulsar, si es otra pantalla. */
  a?: string;
  /**
   * Qué hacer al pulsar, si el destino está en ESTA pantalla.
   *
   * Estado por Tren lo usa para cambiar de vista sin recargar: sus ocho
   * listas ya viven ahí. Sacarlas a rutas propias sólo para poder enlazarlas
   * sería reescribir la pantalla entera por un detalle de navegación.
   *
   * Se usa `a` O `alPulsar`, nunca los dos. Con destino se pinta un enlace de
   * verdad, que es mejor: funciona el clic central y el «abrir en pestaña
   * nueva». Con función se pinta un botón, que es lo honesto cuando no hay
   * ninguna dirección detrás.
   */
  alPulsar?: () => void;
};

/**
 * La lista corta de lo que espera una decisión.
 *
 * CINCO COMO MÁXIMO, y no es un capricho. Una lista de treinta se lee como una
 * tabla: se mira por encima y no se actúa sobre ninguna. Cinco se leen enteras.
 * El resto vive en el detalle, que está a un clic.
 *
 * CADA FILA LLEVA SU ANTIGÜEDAD. «3 días» es lo que hace que alguien se mueva;
 * «Colada continua» a secas, no.
 */
export function LoQueHayQueHacer({
  titulo, acciones, vacio, tope = 5,
}: {
  titulo?: string;
  acciones: Accion[];
  /** Qué decir cuando no hay nada. Nunca se deja el hueco en blanco. */
  vacio?: string;
  tope?: number;
}) {
  if (!acciones.length) {
    return vacio ? <p className="nada-que-hacer">{vacio}</p> : null;
  }
  const visibles = acciones.slice(0, tope);
  const restantes = acciones.length - visibles.length;

  return (
    <>
      {titulo && <div className="bloque-titulo">{titulo}</div>}
      <div className="acciones">
        {visibles.map((a) => {
          const cuerpo = (
            <>
              {a.marca && (
                <span className={'marca marca-' + (a.tono ?? 'atender')}>{a.marca}</span>
              )}
              <span className="accion-texto">
                {a.texto}
                {a.donde && <span className="accion-donde">{a.donde}</span>}
              </span>
              {(a.a || a.alPulsar) && <Icono n="flecha" size={15} />}
            </>
          );
          /* Si lleva destino es un enlace de verdad, no un div con onClick:
             así funciona el clic central, el «abrir en pestaña nueva» y el
             teclado, sin escribir nada para conseguirlo. */
          if (a.a) return <Link key={a.id} to={a.a} className="accion">{cuerpo}</Link>;
          /* Y si sólo hay una función, un <button>. Un div con onClick no se
             alcanza con el tabulador ni lo anuncia un lector de pantalla, y
             aquí estas filas son la navegación principal de la pantalla. */
          if (a.alPulsar) {
            return (
              <button key={a.id} type="button" className="accion" onClick={a.alPulsar}>
                {cuerpo}
              </button>
            );
          }
          return <div key={a.id} className="accion">{cuerpo}</div>;
        })}
      </div>
      {restantes > 0 && (
        <p className="acciones-resto">
          y {restantes} más — están abajo, en el detalle.
        </p>
      )}
    </>
  );
}

/* =============================================================================
   3. LOS NÚMEROS, EN UNA LÍNEA
   ============================================================================= */

/**
 * Cuatro tarjetas de indicador ocupan el mismo espacio que el titular y dicen
 * menos. Aquí van seguidas en una línea: se leen de un vistazo y dejan sitio a
 * lo que importa.
 *
 * Un valor `null` se escribe «sin datos», nunca cero. Es la regla que atraviesa
 * todo el sistema: un tablero donde la mitad está en verde por estar vacío se
 * enseña una vez en una reunión y nadie vuelve a mirarlo.
 */
export function Cifras({ datos }: { datos: Array<{ n: number | null; de?: number; et: string }> }) {
  return (
    <div className="cifras">
      {datos.map((c, i) => (
        <div key={c.et} className="cifra">
          {i > 0 && <span className="cifra-sep">·</span>}
          {c.n === null
            ? <span className="cifra-sindatos">sin datos</span>
            : <><b>{c.n}</b>{c.de != null && <span className="cifra-de">/{c.de}</span>}</>}
          <span className="cifra-et">{c.et}</span>
        </div>
      ))}
    </div>
  );
}

/* =============================================================================
   4. EL DETALLE, PLEGADO
   ============================================================================= */

/**
 * La tabla de 312 filas sigue estando. Detrás de un botón.
 *
 * El que la necesita la abre; el 90 % nunca la abre. Antes era lo primero que
 * se veía al entrar, y empujaba la respuesta fuera de la pantalla.
 *
 * Se usa `<details>` del navegador y no un `useState`: funciona con el buscador
 * del navegador (Ctrl+F encuentra dentro de un `details` cerrado y lo abre
 * solo), con teclado, y sin JavaScript. Un desplegable hecho a mano pierde las
 * tres cosas.
 */
export function Detalle({
  titulo, children, abiertoAlEntrar = false,
}: {
  titulo: string;
  children: ReactNode;
  abiertoAlEntrar?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoAlEntrar);
  return (
    <details
      className="detalle"
      open={abierto}
      onToggle={(e) => setAbierto((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="detalle-cabeza">
        <span>{titulo}</span>
        {/* El chevron gira con CSS al abrirse; no hace falta cambiar el
            icono desde JavaScript. */}
        <Icono n="desplegar" size={16} />
      </summary>
      <div className="detalle-cuerpo">{children}</div>
    </details>
  );
}

/* =============================================================================
   5. «CÓMO SE CALCULA ESTO» — la explicación, a demanda
   ============================================================================= */

/**
 * Aquí van las tarjetas azules que antes ocupaban el tercio superior de cada
 * pantalla. No se pierden: dejan de estorbar.
 *
 * La explicación de una regla se lee UNA vez, normalmente el primer día. A
 * partir de ahí es ruido permanente entre la persona y la respuesta.
 */
export function ComoSeCalcula({ children }: { children: ReactNode }) {
  return (
    <details className="como-calcula">
      <summary>Cómo se calcula esto</summary>
      <div className="como-calcula-cuerpo">{children}</div>
    </details>
  );
}
