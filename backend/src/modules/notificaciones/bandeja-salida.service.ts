import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Aviso, mensajeCompleto } from './plantillas';

/**
 * GUARDA EL AVISO. NUNCA HACE FALLAR LO QUE LO DISPARÓ.
 *
 * Esta es LA regla del bloque: cerrar una orden no puede fallar porque
 * Telegram esté caído. Si el envío fuera parte de la transacción de cierre,
 * un corte de internet dejaría al técnico sin poder cerrar su orden a las
 * once de la noche, en planta, con el teléfono en la mano.
 *
 * Así que aquí NO SE ENVÍA NADA. Se guarda una fila y se vuelve. El
 * despachador se encarga después.
 *
 * Y por si acaso, todo va envuelto en try/catch: si guardar el aviso fallara
 * —tabla bloqueada, lo que sea—, se registra en el log y la operación
 * principal sigue su curso. Perder un aviso es malo; impedir que se cierre
 * una orden es peor.
 */
@Injectable()
export class BandejaSalidaService {
  private readonly logger = new Logger('Avisos');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Encola un aviso para cada destinatario que TENGA CHAT VINCULADO.
   *
   * Si nadie ha vinculado su Telegram, no se guarda nada. Ése es el
   * interruptor natural del bloque: mientras no haya nadie escuchando, no se
   * acumulan filas que nunca se van a enviar.
   */
  async encolar(
    evento: string,
    aviso: Aviso | null,
    destinatarios: { telegramChatId?: string | null }[],
    referenciaId?: string | null,
  ): Promise<number> {
    if (!aviso) return 0;   // las plantillas devuelven null cuando no hay nada que contar
    try {
      const chats = [...new Set(
        destinatarios.map((d) => d.telegramChatId).filter((c): c is string => !!c),
      )];
      if (chats.length === 0) return 0;

      const texto = mensajeCompleto(aviso);
      await this.prisma.notificacionSaliente.createMany({
        data: chats.map((destino) => ({
          canal: 'TELEGRAM' as const,
          destino,
          asunto: aviso.asunto,
          cuerpo: texto,
          evento,
          referenciaId: referenciaId ?? null,
          silencioso: aviso.silencioso,
          proximoIntento: new Date(),
        })),
      });
      return chats.length;
    } catch (e: any) {
      // Se registra y se sigue. La operación que disparó el aviso NO se toca.
      this.logger.error(`No se pudo encolar el aviso "${evento}": ${e?.message}`);
      return 0;
    }
  }

  /**
   * UNA SOLA PERSONA, POR SU IDENTIFICADOR (bloque 51-B).
   *
   * Para avisar a quien levantó el reporte de que su cámara ya se ve. No es
   * ni el ingeniero ni el técnico de turno: es alguien de Producción, y no
   * tiene ningún permiso de mantenimiento que permita encontrarlo por rol.
   *
   * Devuelve vacío si no vinculó Telegram. Eso NO es un error: la mayoría de
   * Producción no lo tendrá vinculado, y el reporte funciona igual — el
   * resultado también se ve en la pantalla.
   */
  async aUnaPersona(userId?: string | null) {
    if (!userId) return [];
    const u = await this.prisma.user.findFirst({
      where: { active: true, telegramChatId: { not: null }, id: userId },
      select: { telegramChatId: true },
    });
    return u ? [u] : [];
  }

  /** Quién debe enterarse de qué. Una sola consulta, y aquí se decide. */
  async destinatarios(tipo: 'INGENIERO' | 'TECNICO' | 'AMBOS', tecnicoId?: string | null) {
    // Un usuario recibe si TIENE CHAT VINCULADO y el permiso que corresponde.
    // Se filtra por permiso y no por nombre de rol: los roles los crea el
    // ingeniero desde la pantalla (4C) y mañana pueden llamarse de otro modo.
    const base = { active: true, telegramChatId: { not: null } };

    if (tipo === 'TECNICO') {
      if (!tecnicoId) return [];
      const u = await this.prisma.user.findFirst({
        where: { ...base, id: tecnicoId },
        select: { telegramChatId: true },
      });
      return u ? [u] : [];
    }

    const ingenieros = await this.prisma.user.findMany({
      where: {
        ...base,
        role: { permissions: { some: { permission: { code: 'wo.approve' } } } },
      },
      select: { telegramChatId: true },
    });

    if (tipo === 'INGENIERO') return ingenieros;

    const tecnico = tecnicoId
      ? await this.prisma.user.findFirst({ where: { ...base, id: tecnicoId }, select: { telegramChatId: true } })
      : null;
    return tecnico ? [...ingenieros, tecnico] : ingenieros;
  }
}
