import * as fs from 'fs';
import * as path from 'path';
import { CANDADO, ClienteDeCandado, conCandado } from '../src/common/candado-de-instancia';

/* =============================================================================
   BLOQUE 100 · EL CANDADO DE INSTANCIA
   -----------------------------------------------------------------------------
   Estas pruebas fijan DOS cosas distintas:

     · El comportamiento del candado, con un cliente de mentira.
     · Que los tres planificadores lo usan BIEN — leyendo el código, no el
       comportamiento. El fallo típico aquí no es escribir mal el candado: es
       dejar la comprobación de «¿ya se hizo?» FUERA, que se ve igual de bien
       y no arregla nada.
============================================================================= */

const leer = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

/** Un cliente de mentira que dice si el candado se toma o no. */
function clienteFalso(opciones: {
  tomado?: boolean;
  revientaLaTransaccion?: boolean;
  revientaElLock?: boolean;
}): ClienteDeCandado & { transacciones: number } {
  const falso = {
    transacciones: 0,
    async $transaction<T>(trabajo: (tx: any) => Promise<T>): Promise<T> {
      falso.transacciones++;
      if (opciones.revientaLaTransaccion) throw new Error('la base no responde');
      return trabajo({
        async $queryRaw() {
          if (opciones.revientaElLock) throw new Error('SQL roto');
          return [{ tomado: opciones.tomado ?? true }];
        },
      });
    },
  };
  return falso as any;
}

describe('El candado', () => {
  it('ejecuta el trabajo cuando se queda con el candado', async () => {
    let corrio = 0;
    const r = await conCandado(clienteFalso({ tomado: true }), CANDADO.PREVENTIVO, async () => {
      corrio++;
      return 'hecho';
    });
    expect(r.tomado).toBe(true);
    expect(r.valor).toBe('hecho');
    expect(corrio).toBe(1);
  });

  it('NO ejecuta nada si lo tiene otra instancia', async () => {
    /* Éste es el caso que da sentido a todo: la otra réplica está generando
       las órdenes, así que ésta no hace absolutamente nada. */
    let corrio = 0;
    const r = await conCandado(clienteFalso({ tomado: false }), CANDADO.PREVENTIVO, async () => {
      corrio++;
      return 'hecho';
    });
    expect(r.tomado).toBe(false);
    expect(r.motivo).toBe('otra-instancia');
    expect(corrio).toBe(0);
  });

  it('FALLA CERRADO: si la base no responde, NO ejecuta', async () => {
    /* Y es lo contrario que los guards, que fallan ABRIENDO a propósito. Las
       consecuencias son opuestas: un guard cerrado deja a la planta sin
       sistema; un candado abierto duplica órdenes. */
    let corrio = 0;
    const r = await conCandado(
      clienteFalso({ revientaLaTransaccion: true }),
      CANDADO.PREVENTIVO,
      async () => { corrio++; },
    );
    expect(r.tomado).toBe(false);
    expect(r.motivo).toBe('fallo');
    expect(corrio).toBe(0);
  });

  it('tampoco ejecuta si la consulta del candado revienta', async () => {
    let corrio = 0;
    const r = await conCandado(
      clienteFalso({ revientaElLock: true }),
      CANDADO.RESUMEN_DIARIO,
      async () => { corrio++; },
    );
    expect(r.tomado).toBe(false);
    expect(corrio).toBe(0);
  });

  it('un error DENTRO del trabajo no se traga: sale como fallo', async () => {
    /* Silenciarlo sería la mentira del bloque 77: la tarea diría que corrió. */
    const r = await conCandado(clienteFalso({ tomado: true }), CANDADO.AVISOS_SALIENTES, async () => {
      throw new Error('el trabajo se rompió');
    });
    expect(r.tomado).toBe(false);
    expect(r.motivo).toBe('fallo');
    expect((r.error as Error).message).toBe('el trabajo se rompió');
  });

  it('las tres claves son números distintos', () => {
    const valores = Object.values(CANDADO);
    expect(new Set(valores).size).toBe(valores.length);
    expect(valores.every((v) => Number.isInteger(v))).toBe(true);
  });
});

describe('Cómo está montado el candado', () => {
  const fuente = leer('src/common/candado-de-instancia.ts');
  /**
   * SÓLO EL CUERPO DE LA FUNCIÓN, no el archivo entero.
   *
   * La primera versión de estas pruebas miraba todo el archivo y se cayó
   * sola: la cabecera EXPLICA por qué no se usa `pg_advisory_unlock`, así que
   * la palabra está escrita ahí… en el sitio donde se dice que no se usa.
   *
   * Es la firma de este proyecto otra vez: **un patrón más flojo de lo
   * necesario acaba leyendo otra cosa.** Una prueba que se cae señalando un
   * comentario correcto es exactamente lo que enseña a ignorar las pruebas.
   */
  const cuerpo = fuente.slice(fuente.indexOf('export async function conCandado'));

  it('usa el candado de TRANSACCIÓN, no el de sesión', () => {
    /* Con el de SESIÓN y el pool de Prisma, el `unlock` puede salir por otra
       conexión: no suelta nada y la tarea no vuelve a correr NUNCA, sin un
       solo error. Es un fallo cerrado y permanente. */
    expect(cuerpo).toContain('pg_try_advisory_xact_lock');
    expect(cuerpo).not.toContain('pg_advisory_unlock');
  });

  it('lo toma DENTRO de una transacción', () => {
    /* Es lo que obliga a Prisma a usar una sola conexión para el bloque. */
    expect(cuerpo.indexOf('$transaction')).toBeLessThan(cuerpo.indexOf('pg_try_advisory_xact_lock'));
  });

  it('es `try_`, no el que se queda esperando', () => {
    /* El que espera acumula transacciones abiertas cada minuto y se come el
       pool. Aquí la respuesta correcta a «lo hace el otro» es no hacer nada. */
    expect(cuerpo).not.toMatch(/pg_advisory_xact_lock\s*\(/);
  });
});

describe('Los tres planificadores', () => {
  it('el PREVENTIVO comprueba «¿ya corrió hoy?» DENTRO del candado', () => {
    /* Si la comprobación quedara fuera, las dos instancias la harían a la vez,
       las dos verían que no se ha hecho y las dos generarían el plan. Sería el
       fallo original con un candado encima. */
    const f = leer('src/modules/preventive/preventive.scheduler.ts');
    const tick = f.slice(f.indexOf('private async tick'), f.indexOf('private async alreadyRanToday'));
    expect(tick).toContain('conCandado(this.prisma, CANDADO.PREVENTIVO');
    expect(tick.indexOf('conCandado')).toBeLessThan(tick.indexOf('alreadyRanToday()'));
    expect(tick.indexOf('alreadyRanToday()')).toBeLessThan(tick.indexOf('generateDue'));
  });

  it('el RESUMEN anota el día en la BASE, no en memoria', () => {
    /* En memoria fallaba también con UNA instancia: un despliegue después de
       las 7 reiniciaba el proceso y el resumen salía otra vez. */
    const f = leer('src/modules/notificaciones/resumen.scheduler.ts');
    expect(f).toContain('configuracionSistema.upsert');
    expect(f).not.toMatch(/this\.ultimoDiaEnviado\s*=/);
  });

  it('el RESUMEN comprueba el día DENTRO del candado', () => {
    const f = leer('src/modules/notificaciones/resumen.scheduler.ts');
    const enviar = f.slice(f.indexOf('private async enviar'));
    expect(f).toContain('conCandado(this.prisma, CANDADO.RESUMEN_DIARIO');
    expect(enviar).toContain('ultimoDiaEnviado()');
  });

  it('el DESPACHADOR reserva la tanda dentro del candado y ENVÍA fuera', () => {
    /* Tener una transacción abierta durante treinta llamadas a Telegram ata
       una conexión del pool al ritmo de un servidor que no controlamos. */
    const f = leer('src/modules/notificaciones/despachador.service.ts');
    const reservar = f.slice(f.indexOf('private async reservarTanda'), f.indexOf('async vuelta()'));
    expect(reservar).toContain('conCandado(this.prisma, CANDADO.AVISOS_SALIENTES');
    expect(reservar).toContain('findMany');
    expect(reservar).toContain('updateMany');
    // El envío NO puede estar dentro de la reserva.
    expect(reservar).not.toContain('this.telegram.enviar');
  });

  it('la reserva NO gasta un reintento', () => {
    /* Reservar no es intentar. Sumar `intentos` al cogerla se comería uno de
       los cuatro reintentos por el mero hecho de haberla cogido. */
    const f = leer('src/modules/notificaciones/despachador.service.ts');
    const reservar = f.slice(f.indexOf('private async reservarTanda'), f.indexOf('async vuelta()'));
    expect(reservar).not.toMatch(/intentos\s*:/);
  });
});
