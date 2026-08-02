import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { VinculacionService } from './vinculacion.service';
import { DespachadorService } from './despachador.service';
import { TelegramClient } from './telegram.client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('avisos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('avisos')
export class NotificacionesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vinculacion: VinculacionService,
    private readonly despachador: DespachadorService,
    private readonly telegram: TelegramClient,
  ) {}

  /** Mi propia vinculación. Sin permiso especial: cada uno gestiona la suya. */
  @Get('mi-telegram')
  mio(@CurrentUser() user: any) {
    return this.vinculacion.codigoDe(user.userId);
  }

  @Post('mi-telegram/desvincular')
  desvincular(@CurrentUser() user: any) {
    return this.vinculacion.desvincular(user.userId);
  }

  /** Estado del canal y cuántos avisos hay en cada situación. */
  @Get('estado')
  @RequirePermissions('notify.read')
  async estado() {
    const [pendientes, enviadas, fallidas, vinculados] = await Promise.all([
      this.prisma.notificacionSaliente.count({ where: { estado: 'PENDIENTE' } }),
      this.prisma.notificacionSaliente.count({ where: { estado: 'ENVIADA' } }),
      this.prisma.notificacionSaliente.count({ where: { estado: 'FALLIDA' } }),
      this.prisma.user.count({ where: { telegramChatId: { not: null }, active: true } }),
    ]);
    return {
      // Si el canal está apagado se dice, en lugar de enseñar ceros que
      // parecerían "todo enviado".
      canalActivo: this.telegram.activo(),
      pendientes, enviadas, fallidas, vinculados,
    };
  }

  @Get()
  @RequirePermissions('notify.read')
  listar(@Query('estado') estado?: string) {
    return this.prisma.notificacionSaliente.findMany({
      where: estado ? { estado: estado as any } : undefined,
      orderBy: { creadaEn: 'desc' },
      take: 100,
    });
  }

  /** Reintentar un aviso que se dio por fallido. */
  @Post(':id/reintentar')
  @RequirePermissions('notify.manage')
  async reintentar(@Param('id') id: string) {
    await this.prisma.notificacionSaliente.update({
      where: { id },
      data: { estado: 'PENDIENTE', intentos: 0, proximoIntento: new Date(), ultimoError: null },
    });
    // Se dispara una vuelta ya, sin esperar al minuto siguiente: quien pulsa
    // "reintentar" quiere ver el resultado ahora.
    this.despachador.vuelta().catch(() => undefined);
    return { ok: true };
  }

  /** Prueba de canal: manda un mensaje a quien lo pide. */
  @Post('probar')
  @RequirePermissions('notify.manage')
  async probar(@CurrentUser() user: any, @Body() _b: any) {
    const u = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { telegramChatId: true },
    });
    if (!u?.telegramChatId) {
      return { ok: false, motivo: 'Todavía no has vinculado tu Telegram.' };
    }
    const r = await this.telegram.enviar(
      u.telegramChatId,
      'Prueba de SGIT-CCTV. Si lees esto, los avisos te van a llegar.',
    );
    return { ok: r.ok, motivo: r.error };
  }
}
