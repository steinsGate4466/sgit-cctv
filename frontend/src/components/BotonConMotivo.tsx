import { useEffect, useRef, useState } from 'react';

/* =============================================================================
   EL BOTÓN QUE DICE POR QUÉ NO PUEDE — bloque 67
   -----------------------------------------------------------------------------
   PETICIÓN DEL USUARIO tras la prueba de su amiga desarrolladora: «mete
   alertas de errores cuando no te deje hacer algo, indicando qué falla o qué
   falta».

   El barrido encontró 80 botones que se apagan solos. En 32 de ellos el
   apagado NO es momentáneo —no es «estoy guardando»— sino que falta un dato.
   Y ninguno decía cuál.

   -----------------------------------------------------------------------------
   POR QUÉ UN BOTÓN APAGADO ES MAL DISEÑO, Y NO ES UNA OPINIÓN

   Un botón gris no se puede pulsar, no se puede enfocar con el teclado y
   **no dispara ningún evento**: no hay forma de preguntarle por qué. El
   usuario ve el botón muerto, mira el formulario, no encuentra la diferencia
   y concluye lo mismo que concluyó él en la exposición: que el software está
   roto.

   En un formulario de cuatro campos se adivina. En el de instalaciones, que
   cambia según el sitio, no se adivina: el campo que falta puede estar tres
   pantallazos más arriba.

   -----------------------------------------------------------------------------
   LA DECISIÓN: EL BOTÓN SE QUEDA VIVO

     · Si falta algo, el botón **se puede pulsar**. Al pulsarlo NO se envía
       nada: se enseña qué falta, justo debajo, y se dice en voz alta para el
       lector de pantalla.
     · Si está ocupado guardando, ENTONCES SÍ se apaga de verdad. Ahí el
       apagado sí es correcto: la razón es evidente y dura un segundo.

   Se pulsa una vez, se lee qué falta, se rellena. Un gesto que antes no
   existía.

   -----------------------------------------------------------------------------
   TRES DETALLES QUE PARECEN MENORES Y NO LO SON

   1. `aria-disabled` SÍ, `disabled` NO. Le dice al lector de pantalla que la
      acción no está disponible sin quitar el botón del recorrido del teclado
      ni matar el `onClick`. Es exactamente el caso para el que existe.

   2. EL MOTIVO NO SE ENSEÑA HASTA QUE SE PULSA. Pintar «falta el nombre»
      nada más abrir un formulario vacío es regañar a alguien por no haber
      empezado. Se avisa cuando la persona cree que ha terminado.

   3. EL MOTIVO SE BORRA SOLO CUANDO YA NO FALTA. Si se quedara puesto,
      seguiría diciendo «falta el nombre» con el nombre ya escrito, y un
      aviso que miente enseña a ignorar todos los avisos. Esa regla ya está
      escrita en CLAUDE.md y aquí se cumple.
============================================================================= */

type Props = {
  /** Qué falta para poder pulsar. `null` = se puede. */
  falta?: string | null;
  /** Guardando ahora mismo: aquí sí se apaga de verdad. */
  ocupado?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  type?: 'button' | 'submit';
  style?: React.CSSProperties;
  title?: string;
  /** Dónde se pinta el motivo. Por defecto, debajo. */
  motivoDebajo?: boolean;
};

export default function BotonConMotivo({
  falta = null,
  ocupado = false,
  onClick,
  children,
  className = 'btn-primary',
  type = 'button',
  style,
  title,
  motivoDebajo = true,
}: Props) {
  const [mostrado, setMostrado] = useState<string | null>(null);
  const ultimoFalta = useRef(falta);

  /* Si ya no falta, el aviso se va solo. Ver detalle 3 de la cabecera. */
  useEffect(() => {
    if (ultimoFalta.current !== falta) {
      ultimoFalta.current = falta;
      if (!falta) setMostrado(null);
      else if (mostrado) setMostrado(falta);   // se actualiza al siguiente que falte
    }
  }, [falta, mostrado]);

  function pulsar(e: React.MouseEvent) {
    if (ocupado) return;
    if (falta) {
      /* Con `type="submit"` hay que frenar el envío a mano: el formulario no
         sabe que aquí falta algo. */
      e.preventDefault();
      setMostrado(falta);
      return;
    }
    setMostrado(null);
    onClick?.();
  }

  return (
    <>
      <button
        type={type}
        className={`${className}${falta ? ' btn-falta' : ''}`}
        style={style}
        disabled={ocupado}
        aria-disabled={!!falta}
        title={title || falta || undefined}
        onClick={pulsar}
      >
        {children}
      </button>

      {motivoDebajo && mostrado && (
        <div className="motivo-falta" role="alert">
          <span aria-hidden="true">▲</span> {mostrado}
        </div>
      )}
    </>
  );
}
