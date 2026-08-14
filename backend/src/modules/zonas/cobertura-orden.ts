/* =============================================================================
   COBERTURA — la parte que decide QUÉ SE LEE PRIMERO
   -----------------------------------------------------------------------------
   Separada del servicio y sin base de datos, por la misma razón de siempre en
   este proyecto: es una REGLA DE NEGOCIO, no fontanería. Decide qué ve arriba
   el jefe de línea cuando abre la pantalla de pie al lado del tren, y eso hay
   que poder probarlo caso por caso con datos escritos a mano.
============================================================================= */

export interface ZonaCobertura {
  nombre: string;
  zonaVital: boolean;
  camaras: number;
  viendo: number;
  ciegas: number;
  dudosas: number;
}

/**
 * Peso de urgencia. Menor = más arriba.
 *
 * El orden NO es alfabético ni por código: es por lo que duele. Una zona
 * declarada vital y sin vista va antes que veinte cámaras caídas repartidas
 * por sitios que a nadie le importan.
 */
export function pesoDeUrgencia(z: ZonaCobertura): number {
  if (z.zonaVital && z.ciegas > 0) return 0;   // lo que para la línea
  if (z.ciegas > 0) return 1;                  // hueco real, zona no valorada
  if (z.zonaVital && z.dudosas > 0) return 2;  // vital, pero aún ve
  if (z.dudosas > 0) return 3;
  return 4;                                    // entero
}

/** Ordena las zonas tal y como se pintan. */
export function ordenarZonas<T extends ZonaCobertura>(zonas: T[]): T[] {
  return [...zonas].sort(
    (a, b) => pesoDeUrgencia(a) - pesoDeUrgencia(b)
      || b.ciegas - a.ciegas
      || String(a.nombre).localeCompare(String(b.nombre)),
  );
}

/**
 * La frase que se lee primero.
 *
 * Se construye en el servidor y no en la pantalla para que diga exactamente lo
 * mismo en la web, en el PDF y en el aviso de Telegram el día que se enganche.
 * Dos textos distintos para el mismo hecho es como se pierde la confianza en
 * un sistema.
 */
export function titularDeCobertura(
  camaras: number, viendo: number, zonasVitalesSinVista: number,
): string {
  if (!camaras) {
    return 'Todavía no hay cámaras cargadas en tu ámbito. No se puede medir cobertura.';
  }
  if (zonasVitalesSinVista) {
    return `${zonasVitalesSinVista} zona(s) declarada(s) vital(es) están sin vista ahora mismo.`;
  }
  const ciegas = camaras - viendo;
  if (ciegas) return `Hay ${ciegas} cámara(s) sin dar imagen, ninguna en zona vital.`;
  return 'Todas las cámaras de tu ámbito están dando imagen.';
}

/**
 * Porcentaje de cobertura, o `null` si no hay nada que medir.
 *
 * NUNCA devuelve 0 con el inventario vacío. Un 0 % haría creer que la planta
 * está a ciegas y un 100 % que está entera; las dos son mentira, y la segunda
 * es la peligrosa porque tranquiliza.
 */
export function porcentajeCobertura(camaras: number, viendo: number): number | null {
  if (!camaras) return null;
  return Math.round((viendo / camaras) * 1000) / 10;
}
