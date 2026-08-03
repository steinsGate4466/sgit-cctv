import { Module } from '@nestjs/common';
import { TelegramClient } from './telegram.client';
import { BandejaSalidaService } from './bandeja-salida.service';
import { DespachadorService } from './despachador.service';
import { VinculacionService } from './vinculacion.service';
import { ResumenScheduler } from './resumen.scheduler';
import { ConfiguracionService } from './configuracion.service';
import { NotificacionesController } from './notificaciones.controller';

/**
 * AVISOS SALIENTES (bloque 4F) — montado y apagado.
 *
 * Sin TELEGRAM_BOT_TOKEN no se envía nada y el sistema funciona exactamente
 * igual que hoy. El día que TI autorice: se crea el bot con @BotFather, se
 * pone el token en Railway, y cada persona se vincula desde su pantalla.
 * Ni un despliegue de código.
 *
 * El módulo se exporta para que Mantenimiento pueda encolar avisos sin saber
 * nada de Telegram.
 */
@Module({
  controllers: [NotificacionesController],
  providers: [ConfiguracionService, TelegramClient, BandejaSalidaService, DespachadorService, VinculacionService, ResumenScheduler],
  exports: [BandejaSalidaService],
})
export class NotificacionesModule {}
