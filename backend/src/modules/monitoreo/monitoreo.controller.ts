import { Body, Controller, Get, Headers, Ip, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MonitoreoService } from './monitoreo.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Freno, FrenoGuard } from '../../common/guards/freno.guard';
import { CUPO_LOGIN } from '../../common/freno';

/**
 * Dos puertas distintas, y conviene verlas separadas:
 *
 *  · /monitoreo/agente/*  → entra el AGENTE de planta. Sin sesión de usuario
 *    (un agente no es una persona) pero con su token. Marcado @Public sólo
 *    para saltarse el guard de JWT: la autenticación la hace el servicio con
 *    el token del agente, y va con freno de intentos.
 *
 *  · el resto            → entran PERSONAS, con sesión y permiso.
 */
@ApiTags('monitoreo')
@Controller('monitoreo')
export class MonitoreoController {
  constructor(private readonly mon: MonitoreoService) {}

  // ------------------------------------------------------- puerta del agente

  @Public()
  @Freno(CUPO_LOGIN)
  @UseGuards(FrenoGuard)
  @Get('agente/lista')
  lista(@Headers('x-agent-token') token: string) {
    return this.mon.listaParaSondear(token);
  }

  @Public()
  @Freno(CUPO_LOGIN)
  @UseGuards(FrenoGuard)
  @Post('agente/reporte')
  reporte(@Headers('x-agent-token') token: string, @Ip() ip: string, @Body() lote: any) {
    return this.mon.recibirReporte(token, ip, lote);
  }

  // ------------------------------------------------------ puerta de personas

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('resumen')
  @RequirePermissions('monitor.read')
  resumen() {
    return this.mon.resumen();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('agentes')
  @RequirePermissions('monitor.manage')
  agentes() {
    return this.mon.listarAgentes();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Post('agentes')
  @RequirePermissions('monitor.manage')
  crearAgente(@Body() dto: any) {
    return this.mon.crearAgente(dto?.nombre);
  }
}
