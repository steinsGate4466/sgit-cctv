/**
 * RITMO — límite de peticiones GENERAL, lógica pura y probada aparte.
 *
 * POR QUÉ EXISTE (hallazgo S-03 de la auditoría del 04/08)
 * El freno de `freno.ts` se aplica SÓLO donde se marca con `@Freno`, y está
 * pensado para adivinar secretos: login y PIN. Los otros 214 endpoints no
 * tenían ningún tope. Con un token válido se pueden lanzar 10.000 peticiones
 * por minuto.
 *
 * Y hay un caso concreto que lo hace urgente: `/exportacion/todo` construye
 * el libro Excel ENTERO en memoria. Pedirlo en bucle tumba el servidor.
 *
 * LA REGLA DE ORO DE ESTE ARCHIVO: NO ESTORBAR.
 * El técnico que está mapeando gabinetes hace decenas de peticiones seguidas
 * de forma perfectamente legítima. Un tope apretado lo bloquearía haciendo su
 * trabajo, y eso es peor que el ataque del que protege. Por eso el tope
 * general es DELIBERADAMENTE GENEROSO: sirve contra el abuso automatizado,
 * no contra el uso intenso.
 *
 * SE CUENTA POR USUARIO, NO POR IP.
 * En planta todos salen por la misma IP —la del router o la de la antena—,
 * así que contar por IP castigaría a todo el equipo por culpa de uno. Sin
 * sesión (rutas públicas) se cae a la IP, que es lo único que hay.
 *
 * LIMITACIÓN, DICHA CLARA: vive en memoria del proceso. Con una instancia en
 * Railway funciona. Con dos, cada una lleva su cuenta y el límite efectivo se
 * duplica. Aun así protege del caso real —un bucle disparando peticiones— y
 * no cuesta una tabla nueva ni una migración. La versión en base de datos
 * queda anotada para cuando haya más de una instancia.
 */

export interface CupoRitmo {
  /** Peticiones permitidas dentro de la ventana. */
  maximo: number;
  /** Tamaño de la ventana, en milisegundos. */
  ventanaMs: number;
}

/**
 * Tope general. 600 por minuto = 10 por segundo sostenidas.
 * Una pantalla pesada del sistema hace 6 peticiones al abrirse; esto da para
 * abrir 100 pantallas en un minuto. Nadie trabaja así, y un bucle sí.
 */
export const RITMO_GENERAL: CupoRitmo = { maximo: 600, ventanaMs: 60_000 };

/**
 * Tope para lo que cuesta caro de generar: el libro Excel completo, los
 * informes PDF, las hojas de etiquetas. Son operaciones de segundos y de
 * mucha memoria; nadie necesita más de 5 por minuto ni por asomo.
 */
export const RITMO_PESADO: CupoRitmo = { maximo: 5, ventanaMs: 60_000 };

export interface EstadoRitmo {
  /** Marcas de tiempo de las peticiones dentro de la ventana. */
  golpes: number[];
}

export interface VeredictoRitmo {
  permitido: boolean;
  /** Segundos hasta que vuelva a haber hueco. Sólo si no está permitido. */
  esperaSeg: number;
  /** Cuántas peticiones quedan en la ventana. Para la cabecera informativa. */
  restantes: number;
  estado: EstadoRitmo;
}

export const estadoRitmoInicial = (): EstadoRitmo => ({ golpes: [] });

/** Clave de conteo: quién + qué familia de rutas. */
export function claveRitmo(quien: string, familia: string): string {
  return `${familia}::${quien}`;
}

/**
 * Ventana deslizante. Se descartan los golpes viejos y se cuenta lo que
 * queda dentro. Sin castigo añadido: en cuanto la ventana avanza, se puede
 * volver a trabajar. Un castigo largo aquí sería exactamente el estorbo que
 * este archivo quiere evitar.
 */
export function evaluarRitmo(
  estado: EstadoRitmo,
  cupo: CupoRitmo,
  ahora: number,
): VeredictoRitmo {
  const desde = ahora - cupo.ventanaMs;
  const golpes = estado.golpes.filter((t) => t > desde);

  if (golpes.length >= cupo.maximo) {
    // El más antiguo dentro de la ventana es el que libera el primer hueco.
    const liberaEn = golpes[0] + cupo.ventanaMs - ahora;
    return {
      permitido: false,
      esperaSeg: Math.max(1, Math.ceil(liberaEn / 1000)),
      restantes: 0,
      estado: { golpes },
    };
  }

  golpes.push(ahora);
  return {
    permitido: true,
    esperaSeg: 0,
    restantes: cupo.maximo - golpes.length,
    estado: { golpes },
  };
}
