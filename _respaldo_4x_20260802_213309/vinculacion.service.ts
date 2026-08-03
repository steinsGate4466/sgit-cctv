import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramClient } from './telegram.client';

/**
 * VINCULAR UNA PERSONA CON SU CHAT DE TELEGRAM.
 *
 * TELEGRAM PROHÍBE QUE UN BOT ESCRIBA PRIMERO. La persona tiene que
 * escribirle ella, y sólo entonces el bot conoce su chat. No hay forma de
 * saltárselo: no es una limitación del sistema, es de Telegram, y existe para
 * que nadie reciba mensajes de bots que no ha buscado.
 *
 * Así que el flujo es:
 *   1. El usuario pulsa "Vincular Telegram" y el sistema le da un código.
 *   2. Le escribe al bot:  /start ABC123
 *   3. El bot lo lee, encuentra el código y guarda su chat.
 *
 * El código es de un solo uso y se borra al vincular: si se filtra después,
 * ya no vale para nada.
 */
@Injectable()
export class VinculacionService {
  private readonly logger = new Logger('Avisos');
  /** Último mensaje leído. Sin esto se releerían los mismos una y otra vez. */
  private ultimoUpdate = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramClient,
  ) {}

  /** Genera (o reutiliza) el código de vinculación de este usuario. */
  async codigoDe(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true, telegramCodigo: true, telegramVinculadoEn: true },
    });
    if (u?.telegramChatId) {
      return { vinculado: true, desde: u.telegramVinculadoEn, activo: this.telegram.activo() };
    }
    let codigo = u?.telegramCodigo;
    if (!codigo) {
      // Seis caracteres sin letras que se confundan: nada de 0/O ni 1/I/l.
      // Se teclea en el móvil, con prisa, a veces con guantes.
      const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      codigo = Array.from(randomBytes(6)).map((b) => alfabeto[b % alfabeto.length]).join('');
      await this.prisma.user.update({ where: { id: userId }, data: { telegramCodigo: codigo } });
    }
    return {
      vinculado: false,
      codigo,
      activo: this.telegram.activo(),
      instrucciones: this.telegram.activo()
        ? `Busca el bot en Telegram y escríbele:  /start ${codigo}`
        : 'El bot todavía no está configurado. Cuando TI lo autorice, este código servirá para vincularte.',
    };
  }

  /** Desvincula: deja de recibir avisos. */
  async desvincular(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: null, telegramCodigo: null, telegramVinculadoEn: null },
    });
    return { ok: true };
  }

  /**
   * Lee los mensajes nuevos del bot y vincula a quien haya mandado su código.
   * Lo llama el despachador en cada vuelta: así no hace falta un webhook ni
   * exponer ninguna URL.
   */
  async revisarMensajes(): Promise<number> {
    if (!this.telegram.activo()) return 0;
    const mensajes = await this.telegram.recibir(this.ultimoUpdate + 1);
    let vinculados = 0;

    for (const m of mensajes) {
      this.ultimoUpdate = Math.max(this.ultimoUpdate, m.updateId);
      const codigo = (/\/start\s+([A-Z0-9]{4,12})/i.exec(m.texto) || [])[1];
      if (!codigo) continue;

      const u = await this.prisma.user.findFirst({
        where: { telegramCodigo: codigo.toUpperCase() },
        select: { id: true, fullName: true },
      });
      if (!u) continue;

      await this.prisma.user.update({
        where: { id: u.id },
        data: {
          telegramChatId: m.chatId,
          // El código se BORRA al usarse: de un solo uso. Si se filtra
          // después, ya no sirve para engancharse a la cuenta de nadie.
          telegramCodigo: null,
          telegramVinculadoEn: new Date(),
        },
      });
      vinculados++;
      this.logger.log(`Telegram vinculado: ${u.fullName}`);
    }
    return vinculados;
  }
}
