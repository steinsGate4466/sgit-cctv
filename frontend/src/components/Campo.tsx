import { ReactNode } from 'react';

/**
 * UN CAMPO DE FORMULARIO.
 *
 * POR QUÉ EXISTE
 * Los formularios estaban escritos con `<label>` y `<input>` sueltos, cada
 * pantalla a su manera: unos con la ayuda debajo, otros con el texto dentro
 * del placeholder, otros sin nada. Con cuarenta campos en la ficha del
 * activo, esa falta de patrón se nota: no hay dónde apoyar la vista.
 *
 * Aquí un campo es siempre lo mismo: etiqueta, control, y —si hace falta—
 * una línea de ayuda debajo. Nada más.
 *
 * LA AYUDA VA DEBAJO, NO EN EL PLACEHOLDER. Un placeholder desaparece en
 * cuanto se empieza a escribir, justo cuando más falta hace; y en un campo
 * ya relleno no hay forma de recuperarlo. Se usa para un EJEMPLO del valor
 * ("SAP-REP-1001"), no para explicar qué es el campo.
 */
export default function Campo({
  etiqueta, ayuda, obligatorio, error, children, ancho,
}: {
  etiqueta: string;
  ayuda?: string;
  obligatorio?: boolean;
  error?: string;
  children: ReactNode;
  /** Ocupa las dos columnas: para notas, descripciones y direcciones. */
  ancho?: boolean;
}) {
  return (
    <div className={'campo' + (ancho ? ' campo-ancho' : '') + (error ? ' campo-error' : '')}>
      <label>
        {etiqueta}
        {/* El asterisco lleva título: quien usa lector de pantalla también
            tiene que enterarse de que el campo es obligatorio. */}
        {obligatorio && <span className="campo-req" title="Obligatorio">*</span>}
      </label>
      {children}
      {error
        ? <span className="campo-msg campo-msg-error">{error}</span>
        : ayuda && <span className="campo-msg">{ayuda}</span>}
    </div>
  );
}

/** Agrupa campos bajo un título. Con cuarenta campos, sin secciones no hay
 *  forma de encontrar nada. */
export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="form-seccion">
      <legend>{titulo}</legend>
      <div className="form-grid">{children}</div>
    </fieldset>
  );
}
