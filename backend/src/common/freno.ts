/**
 * FRENO DE PETICIONES — lógica pura, probada aparte.
 *
 * POR QUÉ EXISTE (hallazgo de la auditoría del 02/08)
 *
 * `POST /users/pin/verify` no tenía NINGÚN freno. El PIN es corto a
 * propósito: sirve para reanudar una orden en campo con guantes, sin teclear
 * la contraseña entera. Un PIN de 4 cifras son 10.000 combinaciones. Sin
 * freno, un programa las prueba todas en segundos y entra como ese técnico.
 *
 * El login sí tenía bloqueo por cuenta, pero con dos puntos ciegos:
 *   - No hay límite por IP, así que se puede rociar: un intento en cada una
 *     de cincuenta cuentas no dispara ningún bloqueo de cuenta.
 *   - El contador vive en memoria: se borra en cada despliegue.
 *
 * Esto añade un freno por ORIGEN además del que ya hay por cuenta.
 *
 * LIMITACIÓN, DICHA CLARA: sigue siendo en memoria. Con una sola instancia
 * en Railway funciona; el día que haya dos, cada una llevará su cuenta y el
 * límite efectivo se duplicará. La versión definitiva va en base de datos y
 * está anotada en el esqueleto. No se hace hoy porque una tabla nueva es una
 * migración, y hoy ya hemos tenido bastante base de datos.
 */

export interface Cupo {
  /** Peticiones permitidas en la ventana. */
  maximo: number;
  /** Tamaño de la ventana, en milisegundos. */
  ventanaMs: number;
  /** Cuánto se cierra la puerta al pasarse. */
  castigoMs: number;
}

export interface EstadoFreno {
  golpes: number[];
  bloqueadoHasta: number;
}

export interface Veredicto {
  permitido: boolean;
  /** Segundos que faltan para poder reintentar. Sólo si está bloqueado. */
  esperaSeg: number;
  estado: EstadoFreno;
}

export const CUPO_LOGIN: Cupo = { maximo: 20, ventanaMs: 5 * 60_000, castigoMs: 10 * 60_000 };

/**
 * El PIN es MUCHO más estrecho que el login, y a propósito: son 4 cifras.
 * 10 intentos por minuto deja trabajar a quien se equivoca con el guante
 * puesto, y convierte 10.000 combinaciones en más de dieciséis horas.
 */
export const CUPO_PIN: Cupo = { maximo: 10, ventanaMs: 60_000, castigoMs: 15 * 60_000 };

export function estadoInicial(): EstadoFreno {
  return { golpes: [], bloqueadoHasta: 0 };
}

/**
 * Decide si esta petición pasa. Función pura: recibe el estado y el reloj,
 * devuelve el estado nuevo. Así se puede probar sin esperar de verdad.
 */
export function evaluar(estado: EstadoFreno, cupo: Cupo, ahora: number): Veredicto {
  if (estado.bloqueadoHasta > ahora) {
    return {
      permitido: false,
      esperaSeg: Math.ceil((estado.bloqueadoHasta - ahora) / 1000),
      estado,
    };
  }

  // Sólo cuentan los golpes dentro de la ventana. Los viejos se tiran, que
  // si no la lista crece sin fin y acabaríamos con una fuga de memoria en el
  // propio mecanismo que protege la memoria.
  const golpes = estado.golpes.filter((t) => ahora - t < cupo.ventanaMs);
  golpes.push(ahora);

  if (golpes.length > cupo.maximo) {
    return {
      permitido: false,
      esperaSeg: Math.ceil(cupo.castigoMs / 1000),
      // Al bloquear se VACÍAN los golpes: cuando pase el castigo empieza
      // limpio. Si no, saldría del bloqueo y al primer intento volvería a
      // caer, y eso ya no frena a un atacante: sólo castiga al despistado.
      estado: { golpes: [], bloqueadoHasta: ahora + cupo.castigoMs },
    };
  }

  return { permitido: true, esperaSeg: 0, estado: { golpes, bloqueadoHasta: 0 } };
}

/**
 * Clave del freno. Se mezcla la ruta con el origen para que gastar el cupo
 * del PIN no deje a esa IP sin poder iniciar sesión: son puertas distintas.
 */
export function clave(ruta: string, origen: string | undefined | null): string {
  return `${ruta}|${(origen || 'desconocido').trim()}`;
}

/**
 * Limpia entradas caducadas. Se llama de vez en cuando para que el mapa no
 * crezca indefinidamente: cada IP que toque el login deja una entrada, y un
 * escaneo automático desde miles de direcciones sería, él solo, una forma de
 * tumbar el servidor por memoria.
 */
export function barrer(mapa: Map<string, EstadoFreno>, cupo: Cupo, ahora: number): number {
  let fuera = 0;
  for (const [k, v] of mapa) {
    const viejo = v.golpes.every((t) => ahora - t > cupo.ventanaMs);
    if (viejo && v.bloqueadoHasta < ahora) {
      mapa.delete(k);
      fuera++;
    }
  }
  return fuera;
}
