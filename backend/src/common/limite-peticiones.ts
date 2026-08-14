/* =============================================================================
   LÍMITE DE PETICIONES — bloque 26
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE
   Había bloqueo de intentos en el login y nada más. Eso frena el ataque de
   diccionario contra una contraseña, pero no frena:

     · barrer /assets/<id> con miles de identificadores para ver qué existe,
     · pedir el PDF de un informe en bucle hasta tumbar el servidor,
     · un script mal escrito de otra área que dispara 300 peticiones/segundo
       sin querer — que es lo que pasa de verdad, mucho antes que un ataque.

   Es de las primeras preguntas de una auditoría web, y hasta hoy la respuesta
   era «no hay».

   -----------------------------------------------------------------------------
   POR QUÉ ESCRITO A MANO Y NO CON UNA LIBRERÍA
   El mismo criterio que las cabeceras de seguridad de `main.ts`: son treinta
   líneas, no hay que auditar una dependencia más, y Aceros revisa lo que
   entra. Una ventana deslizante en memoria hace el trabajo.

   -----------------------------------------------------------------------------
   LO QUE ESTE LÍMITE NO HACE — dicho claro, no escondido
   El contador vive en la MEMORIA del proceso. Con un solo servidor —que es lo
   que hay hoy en Railway— cuenta bien. El día que haya dos instancias detrás
   de un balanceador, cada una contará por su cuenta y el límite real será el
   doble. Cuando llegue ese día se mueve el contador a Redis; el resto del
   código no se entera porque sólo llama a `permitido()`.

   Tampoco es una defensa contra denegación de servicio distribuida: eso se
   para antes, en Cloudflare. Esto para el abuso desde un origen.
============================================================================= */

export interface ReglaDeLimite {
  /** Ventana en milisegundos. */
  ventanaMs: number;
  /** Cuántas peticiones se permiten dentro de la ventana. */
  maximo: number;
}

/** Por defecto: 300 peticiones por minuto y origen.
 *  Una persona usando la aplicación a toda velocidad no pasa de 60; una
 *  pantalla que carga seis listados a la vez tampoco. 300 deja sitio de sobra
 *  al uso legítimo y corta en seco el barrido automático. */
export const LIMITE_GENERAL: ReglaDeLimite = { ventanaMs: 60_000, maximo: 300 };

/** Lo que crea cosas o gasta CPU va más apretado: informes en PDF, subidas,
 *  exportaciones a Excel. Uno de esos cuesta cien veces más que un listado. */
export const LIMITE_PESADO: ReglaDeLimite = { ventanaMs: 60_000, maximo: 30 };

interface Marca { conteo: number; hasta: number; }

export class ContadorDePeticiones {
  private readonly marcas = new Map<string, Marca>();
  /* Empieza en 0, NO en Date.now(). Parece un detalle y no lo es: `consultar`
     recibe el reloj desde fuera para poder probarlo, así que arrancar este
     campo con el reloj real dejaba la limpieza comparando una marca de 2026
     contra un tiempo de prueba pequeño — la resta salía negativa y la
     limpieza NO se ejecutaba nunca. Lo cazó la prueba de la fuga de memoria. */
  private ultimaLimpieza = 0;

  /**
   * @returns `null` si se permite; los segundos que faltan si hay que frenar.
   */
  consultar(clave: string, regla: ReglaDeLimite, ahora = Date.now()): number | null {
    this.limpiar(ahora);

    const m = this.marcas.get(clave);
    if (!m || m.hasta <= ahora) {
      this.marcas.set(clave, { conteo: 1, hasta: ahora + regla.ventanaMs });
      return null;
    }
    m.conteo++;
    if (m.conteo > regla.maximo) {
      return Math.max(1, Math.ceil((m.hasta - ahora) / 1000));
    }
    return null;
  }

  /* Sin esto el Map crece para siempre: cada IP nueva deja su entrada y en
     un servidor de meses eso es una fuga de memoria lenta, de las que se
     descubren cuando el proceso muere de madrugada. */
  private limpiar(ahora: number) {
    if (this.ultimaLimpieza && ahora - this.ultimaLimpieza < 60_000) return;
    this.ultimaLimpieza = ahora;
    for (const [k, v] of this.marcas) {
      if (v.hasta <= ahora) this.marcas.delete(k);
    }
  }

  /** Sólo para las pruebas. */
  get tamano() { return this.marcas.size; }
}

/** ¿Esta ruta es de las caras? */
export function esRutaPesada(ruta: string): boolean {
  return /\/(informe|pdf|exportar|export|archivos|upload|qr)\b/i.test(ruta);
}

/**
 * Clave de conteo. Se usa el USUARIO si viene autenticado, y la IP si no.
 *
 * Contar sólo por IP castigaría a toda la planta: en Aceros salen todos por
 * la misma IP pública, así que un técnico dando caña dejaría sin servicio a
 * los demás. Contar por usuario reparte el límite donde corresponde.
 */
export function claveDeOrigen(userId: string | undefined, ip: string): string {
  return userId ? `u:${userId}` : `ip:${ip}`;
}
