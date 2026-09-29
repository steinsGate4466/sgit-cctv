/**
 * EL PULSO DE LA PLANTA — bloque 158. Lo que la bandeja cuenta ADEMÁS de lo
 * pendiente: cómo está la planta hoy.
 *
 * Pedido de Cristhian: «Mi bandeja tiene que ser más informativa». La bandeja
 * decía qué espera a alguien, pero no respondía a la primera pregunta de la
 * mañana: ¿cómo amaneció la planta? ¿Cuántas cámaras hay caídas, qué se cerró
 * ayer, quién va cargado?
 *
 * Aquí sólo están las cuentas puras (sin base de datos) para poder probarlas:
 * el día de planta, el orden de la carga y la línea de movimientos.
 */

/** El día de planta vive en `common/dia-de-planta.ts`; se reexporta por comodidad. */
export { inicioDelDiaDePlanta } from '../../common/dia-de-planta';

export interface CargaDeTecnico { tecnicoId: string; tecnico: string; abiertas: number; enProceso: number; vencidas: number }

/**
 * Quién va cargado. Se ordena por VENCIDAS primero y después por abiertas:
 * dos órdenes vencidas pesan más que cinco al día, porque son las que ya
 * fallaron una vez.
 */
export function ordenarCarga(filas: CargaDeTecnico[], tope = 6): CargaDeTecnico[] {
  return [...filas]
    .sort((a, b) => b.vencidas - a.vencidas || b.abiertas - a.abiertas || a.tecnico.localeCompare(b.tecnico))
    .slice(0, tope);
}

export type TipoMovimiento = 'INCIDENCIA' | 'OM_CREADA' | 'OM_CERRADA' | 'INCIDENCIA_RESUELTA';
export interface Movimiento { cuando: string; tipo: TipoMovimiento; codigo: string; texto: string; quien: string | null; ruta: string }

/** Primera línea, y como mucho 90 letras: la línea de movimientos se lee, no se estudia. */
export function textoCorto(t: string | null | undefined, max = 90): string {
  const linea = (t || '').split('\n')[0].trim();
  return linea.length > max ? linea.slice(0, max - 1).trimEnd() + '…' : linea;
}

/** Lo último que pasó, lo más nuevo arriba, sin repetir el mismo código y tipo. */
export function lineaDeMovimientos(movs: Movimiento[], tope = 8): Movimiento[] {
  const vistos = new Set<string>();
  return [...movs]
    .sort((a, b) => b.cuando.localeCompare(a.cuando))
    .filter((m) => {
      const k = m.tipo + m.codigo;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, tope)
    .map((m) => ({ ...m, texto: textoCorto(m.texto) }));
}
