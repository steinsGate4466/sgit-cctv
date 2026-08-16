import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icono from './Iconos';

/**
 * LA MISMA TABLA EN DOS DISPOSITIVOS — bloque 38.
 *
 * =============================================================================
 *  POR QUÉ NO BASTA CON QUE LA TABLA «SEA RESPONSIVE»
 * =============================================================================
 *  La solución habitual es dejar la tabla y ponerle scroll horizontal. En un
 *  púlpito con ratón se aguanta. En un teléfono, con guante y sol de frente,
 *  no: hay que deslizar de lado para leer una fila, y al deslizar se pierde de
 *  vista la primera columna, que es la que dice de QUÉ fila se trata.
 *
 *  Aquí no se estrecha la tabla: se cambia de forma. En el celular cada fila
 *  es una TARJETA, con su título arriba y sus datos debajo etiquetados. Nada
 *  de deslizar, nada de adivinar qué columna era ésa.
 *
 *  Y se pinta UNA SOLA VEZ, no dos escondidas con `display:none`. Dos copias
 *  del mismo contenido en el HTML duplican el peso —que en el plan de datos
 *  del técnico se nota— y le hacen leer todo dos veces a un lector de
 *  pantalla.
 *
 * =============================================================================
 *  SEIS COLUMNAS COMO MÁXIMO, Y NO ES ARBITRARIO
 * =============================================================================
 *  La auditoría encontró tablas de 12 y 13 columnas. Doce columnas no caben en
 *  los 1366 px de un púlpito ni con letra de 10 px. Lo que no cabe en seis va
 *  al detalle de la fila, que está a un clic.
 *
 *  La regla la vigila `verificar-densidad.cjs`: esto se degrada solo, una
 *  columna cada vez, y cada una parece razonable por separado.
 */

export type Columna<T> = {
  /** Cabecera en escritorio. En móvil es la etiqueta del dato. */
  et: string;
  /** Qué pintar. Recibe la fila entera. */
  ver: (fila: T) => ReactNode;
  /**
   * `principal` es el dato que identifica la fila —el código de la orden, el
   * nombre de la zona—. En móvil sube al título de la tarjeta, en grande y sin
   * etiqueta: dentro de la tarjeta ya se sabe qué es.
   */
  principal?: boolean;
  /**
   * `soloEscritorio` deja el dato fuera de la tarjeta. Para lo que hace falta
   * al comparar veinte filas en el púlpito y estorba al mirar una en el
   * teléfono: la IP, el gabinete, la fecha de garantía.
   */
  soloEscritorio?: boolean;
  /** Ancho fijo en escritorio, para que las columnas no bailen al filtrar. */
  ancho?: number;
};

export function TablaAdaptable<T>({
  filas, columnas, clave, enlaceDe, vacio, accionDe,
}: {
  filas: T[];
  columnas: Columna<T>[];
  /** Identificador estable. NUNCA el índice: al reordenar, React mezcla filas. */
  clave: (f: T) => string;
  /** Si devuelve una ruta, la fila entera lleva ahí. */
  enlaceDe?: (f: T) => string | undefined;
  vacio?: ReactNode;
  /** Botón grande al pie de cada tarjeta. Sólo en móvil: es el gesto del pulgar. */
  accionDe?: (f: T) => { texto: string; a: string } | undefined;
}) {
  if (!filas.length) {
    return <div className="card vacio">{vacio ?? <p>No hay nada que mostrar.</p>}</div>;
  }

  const principal = columnas.find((c) => c.principal) ?? columnas[0];
  const resto = columnas.filter((c) => c !== principal);

  return (
    <div className="tabla-adaptable">
      {/* ---------- Cabecera: sólo existe en escritorio ---------- */}
      <div className="ta-cabecera" role="row">
        {columnas.map((c) => (
          <div
            key={c.et}
            role="columnheader"
            className={'ta-celda' + (c.soloEscritorio ? ' ta-solo-pc' : '')}
            style={c.ancho ? { flex: `0 0 ${c.ancho}px` } : undefined}
          >
            {c.et}
          </div>
        ))}
        {accionDe && <div className="ta-celda ta-flecha" aria-hidden="true" />}
      </div>

      {/* ---------- Las filas ---------- */}
      {filas.map((f) => {
        const a = enlaceDe?.(f);
        const accion = accionDe?.(f);

        const contenido = (
          <>
            {/* En móvil este bloque es el TÍTULO de la tarjeta; en escritorio
                es la primera celda. Lo hace el CSS, no dos marcados. */}
            <div
              className="ta-celda ta-principal"
              style={principal.ancho ? { flex: `0 0 ${principal.ancho}px` } : undefined}
            >
              {principal.ver(f)}
            </div>

            {resto.map((c) => (
              <div
                key={c.et}
                className={'ta-celda' + (c.soloEscritorio ? ' ta-solo-pc' : '')}
                style={c.ancho ? { flex: `0 0 ${c.ancho}px` } : undefined}
              >
                {/* La etiqueta se pinta SIEMPRE y el CSS la esconde en
                    escritorio, donde ya está en la cabecera. Al revés
                    —añadirla con JavaScript en móvil— obligaría a saber el
                    ancho de la pantalla en el código, y eso se desincroniza
                    con el CSS a la primera. */}
                <span className="ta-etiqueta">{c.et}</span>
                <span className="ta-valor">{c.ver(f)}</span>
              </div>
            ))}

            {accion && (
              <div className="ta-celda ta-accion">
                {/* 44 px de alto y ancho completo: es el botón que se pulsa
                    caminando, con una mano. */}
                <Link to={accion.a} className="btn ta-boton">{accion.texto}</Link>
              </div>
            )}

            {a && !accion && <Icono n="flecha" size={16} />}
          </>
        );

        return a && !accion
          ? <Link key={clave(f)} to={a} className="ta-fila ta-pulsable">{contenido}</Link>
          : <div key={clave(f)} className="ta-fila">{contenido}</div>;
      })}
    </div>
  );
}
