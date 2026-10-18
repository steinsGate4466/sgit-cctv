/* =============================================================================
   EL LÍMITE DE PETICIONES, COMPARTIDO ENTRE INSTANCIAS — bloque 174
   -----------------------------------------------------------------------------
   DEUDA QUE CIERRA (bloque 100, «lo que NO se cierra aquí»): el contador del
   límite vivía en la memoria de CADA proceso. Con dos réplicas en Railway cada
   una contaba su mitad y el tope real se duplicaba: 600/min se volvían 1.200,
   y las rutas caras (Excel, PDF) 60 en vez de 30.

   NO HACE FALTA REDIS. La planta ya tiene una base compartida por todas las
   instancias: el contador vive en una tabla (`limite_peticiones`) con una sola
   sentencia atómica por petición:

       INSERT … ON CONFLICT (clave, ventana) DO UPDATE SET n = n + 1 RETURNING n

   Dos instancias que suman a la vez no se pisan: PostgreSQL serializa la fila.

   VENTANA FIJA, no deslizante. `ventana` = el milisegundo en que EMPIEZA
   (`floor(ahora / ventanaMs) * ventanaMs`): así ventanas de distinto tamaño se
   pueden limpiar con un solo corte de tiempo. En el
   borde de dos ventanas caben, como mucho, dos cupos seguidos; es lo que pasa
   con cualquier limitador de ventana fija y aquí basta: el límite está para
   frenar un bucle, no para medir a nadie.

   SI LA BASE NO RESPONDE, SE CUENTA EN MEMORIA (como antes). Un fallo de base
   de datos no puede dejar a la planta sin sistema — misma decisión que los
   guards del bloque 12.3 y 82. Lo peor que pasa es volver, un rato, al límite
   por instancia.

   LIMPIEZA: cada minuto, como mucho, cada instancia borra las ventanas viejas.
   Es idempotente: si lo hacen dos a la vez no pasa nada.
============================================================================= */
import { ContadorDePeticiones, ReglaDeLimite } from './limite-peticiones';

export interface BaseParaContar {
  $queryRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>;
  $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>;
}

/** Segundos que faltan para que termine la ventana en curso. */
export function segundosHastaFinDeVentana(ahora: number, ventanaMs: number): number {
  const fin = (Math.floor(ahora / ventanaMs) + 1) * ventanaMs;
  return Math.max(1, Math.ceil((fin - ahora) / 1000));
}

/** La clave incluye la regla: el cupo general y el de rutas caras son contadores distintos. */
export function claveCompartida(clave: string, regla: ReglaDeLimite): string {
  return `${clave}|${regla.maximo}/${regla.ventanaMs}`.slice(0, 200);
}

export class ContadorCompartido {
  private readonly local = new ContadorDePeticiones();
  private ultimaLimpieza = 0;
  /** Cuántas veces se cayó a la memoria (para el autochequeo y las pruebas). */
  fallos = 0;

  constructor(private readonly base: BaseParaContar | null) {}

  /** `null` si se permite; los segundos de espera si hay que frenar. */
  async consultar(clave: string, regla: ReglaDeLimite, ahora = Date.now()): Promise<number | null> {
    if (!this.base) return this.local.consultar(clave, regla, ahora);
    const k = claveCompartida(clave, regla);
    const ventana = Math.floor(ahora / regla.ventanaMs) * regla.ventanaMs;
    try {
      const filas = (await this.base.$queryRaw`
        INSERT INTO "limite_peticiones" ("clave", "ventana", "n")
        VALUES (${k}, ${ventana}, 1)
        ON CONFLICT ("clave", "ventana") DO UPDATE SET "n" = "limite_peticiones"."n" + 1
        RETURNING "n"`) as { n: number | bigint }[];
      this.limpiar(ahora);
      const n = Number(filas?.[0]?.n ?? 1);
      return n > regla.maximo ? segundosHastaFinDeVentana(ahora, regla.ventanaMs) : null;
    } catch {
      this.fallos += 1;
      return this.local.consultar(clave, regla, ahora);
    }
  }

  private limpiar(ahora: number) {
    if (ahora - this.ultimaLimpieza < 60_000) return;
    this.ultimaLimpieza = ahora;
    // Las ventanas que empezaron hace más de 15 minutos ya no cuentan para nada.
    const corte = ahora - 15 * 60_000;
    if (!this.base) return;
    this.base.$executeRaw`DELETE FROM "limite_peticiones" WHERE "ventana" < ${corte}`.catch(() => null);
  }
}
