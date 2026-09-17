/**
 * BLOQUEO DE CUENTA — lógica pura, probada aparte.
 * ===========================================================================
 *
 *  BLOQUE 104. Hasta aquí el bloqueo por cuenta vivía en un `Map` dentro de
 *  `auth.service.ts`, con dos defectos que sólo se ven leyendo despacio:
 *
 *  1 · **EL CONTADOR NO CADUCABA NUNCA.** No había ventana: `fails` subía y
 *      sólo se ponía a cero al acertar la contraseña. O sea que no eran «5
 *      fallos seguidos», eran **5 fallos desde la última vez que entró bien**.
 *      Un técnico que se equivoca dos veces el lunes con el guante puesto y
 *      tres el viernes, queda bloqueado el viernes. Y no es un caso raro:
 *      es el caso NORMAL en campo.
 *
 *  2 · **VIVÍA EN MEMORIA.** El freno por origen ya se había llevado a la
 *      base (`intentos_acceso`, bloque 12.2); el de cuenta se quedó atrás.
 *      Con dos réplicas en Railway cada una lleva su cuenta —el límite
 *      efectivo se duplica— y un despliegue lo borra entero, que además
 *      DESBLOQUEA por accidente a quien estuviera bloqueado.
 *
 * ===========================================================================
 *  LO QUE NO SE HACE, Y ES DECISIÓN DEL USUARIO
 * ===========================================================================
 *  **El castigo NO es escalonado.** Se propuso 1 → 5 → 15 minutos y se
 *  descartó: un primer castigo de un minuto le da a quien prueba contraseñas
 *  desde fuera una ventana barata para seguir probando. Son 15 minutos desde
 *  el primer bloqueo, siempre.
 *
 *  Lo que resuelve el caso del técnico torpe no es aflojar el castigo: es la
 *  VENTANA de arriba —que los fallos viejos dejen de contar— y el DESBLOQUEO
 *  por el supervisor. Un castigo blando protege peor y ayuda menos.
 */

/** Fallos que se toleran dentro de la ventana antes de cerrar la puerta. */
export const MAX_FALLOS = 5;

/**
 * Cuánto tiempo cuentan los fallos. Fuera de esta ventana, el contador
 * empieza de cero: es lo que impide que los errores de meses distintos se
 * sumen hasta bloquear a alguien que nunca falló dos veces seguidas.
 */
export const VENTANA_MS = 15 * 60_000;

/** Cuánto dura el bloqueo. FIJO, no escalonado (ver cabecera). */
export const CASTIGO_MS = 15 * 60_000;

/** La clave con la que vive en `intentos_acceso`, junto a la del freno por origen. */
export const PREFIJO_CUENTA = 'cuenta';

export function claveDeCuenta(email: string): string {
  return `${PREFIJO_CUENTA}|${(email || '').trim().toLowerCase()}`;
}

export interface EstadoCuenta {
  /** Fallos contados dentro de la ventana en curso. */
  fallos: number;
  /** Cuándo empezó a contar esta ventana. */
  ventanaDesde: number;
  /** 0 = no bloqueada. */
  bloqueadaHasta: number;
}

export interface VeredictoCuenta {
  bloqueada: boolean;
  /** Minutos que faltan. Se redondea hacia arriba: decir «0 min» y no dejar entrar es peor que no decir nada. */
  minutosRestantes: number;
  estado: EstadoCuenta;
}

export function estadoLimpio(ahora: number): EstadoCuenta {
  return { fallos: 0, ventanaDesde: ahora, bloqueadaHasta: 0 };
}

/** ¿Puede intentar entrar ahora mismo? No toca nada: sólo mira. */
export function estaBloqueada(estado: EstadoCuenta, ahora: number): VeredictoCuenta {
  if (estado.bloqueadaHasta > ahora) {
    return {
      bloqueada: true,
      minutosRestantes: Math.ceil((estado.bloqueadaHasta - ahora) / 60_000),
      estado,
    };
  }
  return { bloqueada: false, minutosRestantes: 0, estado };
}

/**
 * Registra un fallo y decide si hay que cerrar la puerta.
 *
 * Función pura: recibe el estado y el reloj, devuelve el estado nuevo. Así se
 * puede probar el caso de «dos fallos el lunes y tres el viernes» sin esperar
 * cuatro días, que es exactamente el caso que este bloque viene a arreglar.
 */
export function registrarFallo(estado: EstadoCuenta, ahora: number): VeredictoCuenta {
  /* Si la ventana ya expiró, los fallos viejos NO cuentan. Éste es el arreglo
     del bloque: antes se sumaban para siempre. */
  const dentroDeLaVentana = ahora - estado.ventanaDesde < VENTANA_MS;
  const base: EstadoCuenta = dentroDeLaVentana ? estado : estadoLimpio(ahora);

  const fallos = base.fallos + 1;

  if (fallos >= MAX_FALLOS) {
    return {
      bloqueada: true,
      minutosRestantes: Math.ceil(CASTIGO_MS / 60_000),
      /* Al bloquear se VACÍA el contador: cuando pase el castigo se empieza
         limpio. Si no, saldría del bloqueo y al primer fallo volvería a caer
         — y eso ya no frena a nadie: sólo castiga al despistado. Es la misma
         decisión que el freno por origen. */
      estado: { fallos: 0, ventanaDesde: ahora, bloqueadaHasta: ahora + CASTIGO_MS },
    };
  }

  return {
    bloqueada: false,
    minutosRestantes: 0,
    estado: { fallos, ventanaDesde: base.ventanaDesde, bloqueadaHasta: 0 },
  };
}

/** Cuántos intentos le quedan antes de quedarse fuera. Para poder DECÍRSELO. */
export function intentosRestantes(estado: EstadoCuenta, ahora: number): number {
  const dentro = ahora - estado.ventanaDesde < VENTANA_MS;
  const fallos = dentro ? estado.fallos : 0;
  return Math.max(0, MAX_FALLOS - fallos);
}
