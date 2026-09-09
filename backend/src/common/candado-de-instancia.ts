/* =============================================================================
   BLOQUE 100 · EL CANDADO DE INSTANCIA
   -----------------------------------------------------------------------------
   DE DÓNDE SALE. Se midió el proyecto contra el modelo de negocio de la planta
   y salió esto: hay TRES tareas programadas con `setInterval`, y las tres
   tienen guarda contra la ejecución doble… DENTRO DEL PROCESO.

       preventive.scheduler   `alreadyRanToday()`   consulta la auditoría
       despachador.service    `this.ocupado`        un booleano en memoria
       resumen.scheduler      `ultimoDiaEnviado`    un texto en memoria

   Con UNA instancia las tres funcionan. Con DOS réplicas en Railway ninguna
   sirve, porque cada proceso tiene su propia copia:

     · El PREVENTIVO haría la comprobación a la vez en las dos, las dos verían
       «hoy no se ha ejecutado», y las dos generarían el plan entero.
       **Órdenes duplicadas**: dos cuadrillas al mismo poste, y el reparto
       correctivo/preventivo que va al comité contando el doble.
     · El DESPACHADOR mandaría cada aviso de Telegram DOS VECES. Su propio
       comentario ya lo decía —«dos a la vez mandarían el mismo aviso dos
       veces»— y sólo se protegía de sí mismo.
     · El RESUMEN mandaría dos resúmenes cada mañana.

   Y hay un detalle que lo empeora en vez de suavizarlo: **las dos réplicas
   arrancan a la vez en un despliegue**, así que los dos primeros disparos
   (`FIRST_CHECK_MS`) caen con milisegundos de diferencia. El momento de máximo
   riesgo es justo el despliegue.

   -----------------------------------------------------------------------------
   POR QUÉ UN CANDADO DE POSTGRESQL Y NO OTRA COSA

   Porque la base de datos es lo ÚNICO que las dos instancias comparten. Un
   fichero, una variable o una marca en memoria no las ve la otra — que es
   exactamente el fallo que se está cerrando.

   -----------------------------------------------------------------------------
   POR QUÉ `xact` Y NO EL CANDADO DE SESIÓN — esto es lo importante

   PostgreSQL ofrece dos familias:

       pg_try_advisory_lock(k)        se suelta con pg_advisory_unlock(k)
                                      O al cerrarse la CONEXIÓN
       pg_try_advisory_xact_lock(k)   se suelta SOLO, al terminar la
                                      transacción — commit, rollback o caída

   **Prisma tiene un POOL de conexiones.** Dos `$queryRaw` seguidos pueden
   viajar por conexiones distintas. Con el candado de sesión, el `unlock`
   podría salir por otra conexión que NO lo tiene: no suelta nada, y el
   candado se queda tomado hasta que esa conexión muera.

   Eso es un fallo CERRADO y permanente: la tarea no vuelve a ejecutarse nunca
   y nadie se entera, porque no hay error — sencillamente no pasa nada. Es la
   misma familia que el selector de CSS muerto del bloque 89.

   `pg_try_advisory_xact_lock` no puede quedarse tomado: aunque se mate el
   proceso de un tirón, PostgreSQL cierra la transacción y lo suelta. Y va
   dentro de `$transaction`, que es lo que OBLIGA a Prisma a usar UNA sola
   conexión para todo el bloque.

   -----------------------------------------------------------------------------
   POR QUÉ `try_` Y NO EL QUE ESPERA

   `pg_advisory_xact_lock` se queda esperando a que el otro suelte. Con un
   temporizador cada minuto, eso acumula transacciones abiertas y se come el
   pool de conexiones. Aquí la respuesta correcta a «lo está haciendo el otro»
   es **no hacer nada y volver en el siguiente ciclo**, no ponerse en la cola.

   -----------------------------------------------------------------------------
   ESTE FALLA CERRADO, Y ES LO CONTRARIO QUE LOS GUARDS

   Los guards de este proyecto fallan ABRIENDO a propósito (bloques 12.3 y 82):
   son defensa en profundidad y un fallo de base de datos no puede dejar a la
   planta sin sistema.

   **Aquí es al revés.** Si no se puede tomar el candado, no se ejecuta. Las
   consecuencias son opuestas:

       un guard que falla cerrado   →  la planta se queda sin sistema
       un candado que falla abierto →  órdenes y avisos duplicados

   Y además no se pierde nada: si la base no responde, la tarea tampoco podría
   hacer su trabajo. Se salta el ciclo y se reintenta en el siguiente.

   -----------------------------------------------------------------------------
   LAS CLAVES SON NÚMEROS FIJOS, ESCRITOS AQUÍ

   Los candados consultivos de PostgreSQL comparten un único espacio de
   nombres para toda la base. Derivar la clave del nombre de la tarea con un
   hash haría que dos textos distintos pudieran chocar — y un choque aquí
   significa que dos tareas SIN relación se bloquean entre sí, con un síntoma
   («esta tarea a veces no corre») que no lleva a ninguna parte.

   Se declaran a mano, en un sitio, y se ven todas de un vistazo.
============================================================================= */

/** Cuánto puede tener la transacción del candado abierta antes de rendirse. */
const ESPERA_MAXIMA_MS = 5 * 60_000;
/** Cuánto espera Prisma a que el pool le dé una conexión para la transacción. */
const ESPERA_DE_CONEXION_MS = 10_000;

/**
 * Las claves de candado en uso. **Números fijos y únicos.**
 *
 * Antes de añadir una, comprobar que no esté ya. Y no reutilizar el número de
 * una tarea retirada: si quedara un despliegue viejo corriendo, se bloquearían
 * entre sí dos cosas que no tienen nada que ver.
 */
export const CANDADO = {
  /** Generación diaria de OM preventivas. */
  PREVENTIVO: 100_001,
  /** Resumen de cada mañana por Telegram. */
  RESUMEN_DIARIO: 100_002,
  /** Reserva de la tanda de avisos salientes. */
  AVISOS_SALIENTES: 100_003,
} as const;

export type ClaveDeCandado = (typeof CANDADO)[keyof typeof CANDADO];

/** Lo mínimo que hace falta de Prisma. Tipado así para poder probarlo. */
export interface EjecutorSql {
  $queryRaw(sql: TemplateStringsArray, ...valores: unknown[]): Promise<unknown>;
}

/** Lo mínimo que hace falta del cliente. */
export interface ClienteDeCandado {
  $transaction<T>(
    trabajo: (tx: EjecutorSql) => Promise<T>,
    opciones?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
}

/** Qué pasó al intentar ejecutar. */
export interface ResultadoDeCandado<T> {
  /** `true` sólo si ESTA instancia se quedó con el candado y corrió el trabajo. */
  tomado: boolean;
  /** Lo que devolvió el trabajo. Sólo tiene valor si `tomado`. */
  valor?: T;
  /**
   * Por qué no se tomó. `'otra-instancia'` es normal y no se registra como
   * error; `'fallo'` sí, porque significa que la base no contestó.
   */
  motivo?: 'otra-instancia' | 'fallo';
  /** El error, cuando `motivo` es `'fallo'`. */
  error?: unknown;
}

/**
 * Ejecuta `trabajo` **sólo si ninguna otra instancia lo está ejecutando**.
 *
 * Uso:
 *
 * ```ts
 * const r = await conCandado(this.prisma, CANDADO.PREVENTIVO, async () => {
 *   if (await this.yaCorrioHoy()) return null;
 *   return this.preventive.generateDue(...);
 * });
 * if (!r.tomado) return;   // lo está haciendo la otra réplica
 * ```
 *
 * IMPORTANTE — **todo lo que haya que hacer una sola vez tiene que estar
 * DENTRO de `trabajo`, incluida la comprobación de «¿ya se hizo?»**. Dejar la
 * comprobación fuera y sólo meter la escritura dentro no arregla nada: las dos
 * instancias comprobarían a la vez, las dos verían que no se ha hecho, y
 * entrarían una detrás de otra. Es el fallo original con un candado encima.
 *
 * El candado se suelta al salir de esta función, pase lo que pase.
 */
export async function conCandado<T>(
  prisma: ClienteDeCandado,
  clave: ClaveDeCandado,
  trabajo: () => Promise<T>,
): Promise<ResultadoDeCandado<T>> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const filas = (await tx.$queryRaw`
          SELECT pg_try_advisory_xact_lock(${clave}::bigint) AS tomado
        `) as { tomado: boolean }[] | undefined;

        /* Si la consulta no devuelve lo esperado NO se ejecuta. No poder
           demostrar que se tiene el candado es lo mismo que no tenerlo. */
        if (!filas?.[0]?.tomado) {
          return { tomado: false, motivo: 'otra-instancia' as const };
        }

        return { tomado: true, valor: await trabajo() };
      },
      { maxWait: ESPERA_DE_CONEXION_MS, timeout: ESPERA_MAXIMA_MS },
    );
  } catch (error) {
    /* Falla CERRADO: no se ejecuta. Ver la cabecera — un candado que falla
       abriendo duplica órdenes, que es justo lo que se viene a cerrar. */
    return { tomado: false, motivo: 'fallo', error };
  }
}
