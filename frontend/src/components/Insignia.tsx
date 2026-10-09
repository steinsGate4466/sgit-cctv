import { Contador, cifra } from '../contadores';

/**
 * EL NÚMERO AL LADO DE UNA ENTRADA DEL MENÚ — bloque 170.
 *
 * Rojo si hay algo vencido o grave, ámbar si sólo hay pendientes. El texto
 * completo («3 órdenes fuera de plazo») va en el `title` y en el `aria-label`:
 * el número solo no dice de QUÉ son, y un lector de pantalla leería «3» y nada
 * más.
 */
export default function Insignia({ c, punto = false }: { c: Contador | null | undefined; punto?: boolean }) {
  if (!c || c.n <= 0) return null;
  return (
    <span className={'insignia ' + c.tono + (punto ? ' punto' : '')} title={c.que} aria-label={c.que} role="status">
      {punto ? '' : cifra(c.n)}
    </span>
  );
}
