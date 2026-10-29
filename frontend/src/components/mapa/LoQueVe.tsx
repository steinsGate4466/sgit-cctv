import { NIVELES_DORI, metros, type Distancias } from '../../dori';

/**
 * LO QUE VE UNA CÁMARA, EN UNA LISTA — bloque 184.
 *
 * Los cuatro niveles DORI con su distancia, cada uno con la muestra del color
 * que lleva su franja en el mapa: así la leyenda y el dato se leen igual. La
 * usan la tarjeta del mapa y la pantalla de Fichas técnicas. Sólo enseña: no
 * pide nada al servidor.
 */
export default function LoQueVe({ dia, noche = false, irM, estado = 'ok' }: {
  dia: Distancias;
  /** Añadir la línea de la noche: hasta dónde llega su infrarrojo (o que no se sabe). */
  noche?: boolean;
  irM?: number | null;
  /** El color del estado de la cámara (el mismo del mapa). */
  estado?: string;
}) {
  return (
    <ul className={'lo-que-ve punto-' + estado}>
      {NIVELES_DORI.map((n) => (
        <li key={n.clave} title={n.norma}>
          <i className={'dori-muestra dori-' + n.clave} aria-hidden="true" />
          <span>{n.texto}</span>
          <b>{metros(dia[n.clave])}</b>
        </li>
      ))}
      {noche && (
        <li className="lo-que-ve-noche">
          <i aria-hidden="true">☾</i>
          <span>{irM ? 'De noche, con su infrarrojo' : 'De noche: la ficha no da el infrarrojo'}</span>
          <b>{irM ? metros(irM) : '—'}</b>
        </li>
      )}
    </ul>
  );
}
