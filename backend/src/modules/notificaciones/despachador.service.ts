import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CANDADO, conCandado } from '../../common/candado-de-instancia';
import { TelegramClient } from './telegram.client';
import { VinculacionService } from './vinculacion.service';

/**
 * MANDA LO QUE HAY EN LA BANDEJA DE SALIDA Y REINTENTA.
 *
 * Temporizador propio, sin @nestjs/schedule: es el mismo criterio que ya se
 * usó en el generador de preventivas. Una dependencia menos que actualizar.
 *
 * ESPERA CRECIENTE: 1, 5, 15 y 60 minutos. Si el servidor de Telegram está
 * caído, machacarlo cada minuto no lo arregla y sí puede acabar con el bot
 * bloqueado por exceso de peticiones.
 *
 * A LOS 4 INTENTOS SE MARCA FALLIDA Y SE DEJA VISIBLE en la pantalla de
 * avisos. No se borra: un aviso que no llegó es información, y alguien tiene
 * que poder verlo y reintentarlo a mano.
 */
@Injectable()
export class DespachadorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Avisos');
  private timer: NodeJS.Timeout | null = null;
  private ocupado = false;

  private readonly CADA_MS = 60_000;
  private readonly PRIMERA_MS = 20_000;
  /** Minutos de espera tras cada fallo. Cuatro intentos y se rinde. */
  private readonly ESPERAS_MIN = [1, 5, 15, 60];
  /** Tope por vuelta: 30 mensajes/minuto va muy por debajo del límite de Telegram. */
  private readonly POR_VUELTA = 30;
  /**
   * Cuánto se RESERVA una tanda antes de mandarla (bloque 100).
   *
   * Al reservar se empuja `proximoIntento` a este futuro, así que ninguna otra
   * réplica los ve como pendientes mientras esta los manda. Si esta instancia
   * se cae a mitad del envío, los que quedaron vuelven a la cola pasado este
   * rato en lugar de al minuto siguiente.
   *
   * **Retrasar cinco minutos un aviso es preferible a mandarlo dos veces**: el
   * duplicado es lo que enseña a silenciar el bot, y con el bot silenciado se
   * pierde también lo urgente.
   */
  private readonly RESERVA_MS = 5 * 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramClient,
    private readonly vinculacion: VinculacionService,
  ) {}

  async onModuleInit() {
    // `activo()` es asíncrono desde que el token puede vivir en la base:
    // hay que preguntárselo, no leerlo de una variable.
    if (!(await this.telegram.activo())) {
      // No es un error: es el estado normal hasta que TI autorice. Se dice
      // una vez al arrancar para que quien mire los logs lo sepa.
      // NO se sale: el token se puede pegar en la pantalla en cualquier
      // momento, y entonces el temporizador ya tiene que estar en marcha.
      // Antes, con la variable de entorno, apagado al arrancar significaba
      // apagado hasta el siguiente despliegue.
      this.logger.log('Avisos por Telegram apagados (sin token). Se encienden solos al ponerlo en Avisos.');
    } else {
      this.logger.log('Avisos por Telegram activados.');
    }
    setTimeout(() => this.vuelta(), this.PRIMERA_MS);
    this.timer = setInterval(() => this.vuelta(), this.CADA_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Coge una tanda de avisos y la RESERVA, de forma que ninguna otra réplica
   * la coja (bloque 100).
   *
   * El candado envuelve **leer y reservar juntos**. Si sólo envolviera la
   * lectura, las dos instancias leerían la misma tanda una detrás de otra y
   * mandarían los mismos mensajes: la exclusión tiene que cubrir la decisión
   * entera, no una de sus mitades.
   *
   * **El ENVÍO queda FUERA del candado, y eso es deliberado.** Mandar treinta
   * mensajes a Telegram son treinta llamadas de red; tener una transacción de
   * base de datos abierta mientras tanto ata una conexión del pool al ritmo de
   * un servidor que no controlamos, y si Telegram se queda colgado la
   * transacción muere por tiempo. La reserva ya garantiza que nadie más los
   * toque, así que el candado no tiene que seguir puesto.
   */
  private async reservarTanda() {
    const r = await conCandado(this.prisma, CANDADO.AVISOS_SALIENTES, async () => {
      const pendientes = await this.prisma.notificacionSaliente.findMany({
        where: {
          estado: 'PENDIENTE',
          OR: [{ proximoIntento: null }, { proximoIntento: { lte: new Date() } }],
        },
        orderBy: { creadaEn: 'asc' },
        take: this.POR_VUELTA,
      });
      if (pendientes.length === 0) return [];

      /* Se empuja `proximoIntento` al futuro SIN tocar `intentos`: esto no es
         un intento fallido, es una reserva. Sumarlo gastaría uno de los cuatro
         reintentos por el mero hecho de haberlo cogido. */
      await this.prisma.notificacionSaliente.updateMany({
        where: { id: { in: pendientes.map((p) => p.id) }, estado: 'PENDIENTE' },
        data: { proximoIntento: new Date(Date.now() + this.RESERVA_MS) },
      });
      return pendientes;
    });

    if (r.motivo === 'fallo') {
      this.logger.error(
        `No se pudo reservar la tanda de avisos; se salta esta vuelta: ${
          (r.error as any)?.message || r.error
        }`,
      );
      return [];
    }
    // `tomado: false` sin fallo = la tanda la tiene la otra instancia.
    return r.valor ?? [];
  }

  async vuelta() {
    // Si la vuelta anterior sigue en marcha no se lanza otra. Este freno es
    // DENTRO del proceso; el que cubre las otras réplicas es el candado de
    // `reservarTanda()`. Se conservan los dos: éste ahorra el viaje a la base.
    if (this.ocupado || !(await this.telegram.activo())) return;
    this.ocupado = true;
    try {
      // Antes de enviar se leen los mensajes que le han escrito al bot: es
      // como se vincula la gente. Va aquí y no en un temporizador aparte
      // porque son la misma conversación con Telegram, y así se gasta una
      // petición en lugar de dos.
      //
      // LIMITACIÓN DECLARADA (bloque 100): con dos réplicas, las dos sondean
      // Telegram y Telegram responde 409 a la segunda. No duplica nada —el
      // `.catch` ya lo absorbe— y la vinculación se resuelve en la vuelta
      // siguiente. Meterlo dentro del candado obligaría a tener la
      // transacción abierta durante una llamada de red, que es justo lo que
      // se acaba de evitar.
      await this.vinculacion.revisarMensajes().catch(() => 0);

      const pendientes = await this.reservarTanda();

      for (const n of pendientes) {
        const r = await this.telegram.enviar(n.destino, n.cuerpo, n.silencioso);

        if (r.ok) {
          await this.prisma.notificacionSaliente.update({
            where: { id: n.id },
            data: { estado: 'ENVIADA', enviadaEn: new Date(), intentos: n.intentos + 1, ultimoError: null },
          });
          continue;
        }

        const intentos = n.intentos + 1;
        const seRinde = !r.reintentable || intentos >= this.ESPERAS_MIN.length;
        // Telegram manda su propio tiempo de espera cuando nos pasamos del
        // cupo; su número gana al nuestro.
        const esperaMin = r.esperarSeg
          ? Math.ceil(r.esperarSeg / 60)
          : this.ESPERAS_MIN[Math.min(intentos, this.ESPERAS_MIN.length - 1)];

        await this.prisma.notificacionSaliente.update({
          where: { id: n.id },
          data: {
            intentos,
            estado: seRinde ? 'FALLIDA' : 'PENDIENTE',
            ultimoError: (r.error || 'error desconocido').slice(0, 300),
            proximoIntento: seRinde ? null : new Date(Date.now() + esperaMin * 60_000),
          },
        });
      }
    } catch (e: any) {
      this.logger.error(`Vuelta de avisos fallida: ${e?.message}`);
    } finally {
      this.ocupado = false;
    }
  }
}
