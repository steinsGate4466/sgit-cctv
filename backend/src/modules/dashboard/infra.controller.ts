import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InfraService } from './infra.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Tablero de INFRAESTRUCTURA.
 *
 * Va en su propio controlador y se registra ANTES de DashboardController: sus
 * rutas empiezan por 'infra/', así que no chocan con 'train/:train', pero el
 * orden explícito documenta la intención y evita sorpresas si mañana alguien
 * añade un @Get(':algo') al tablero ejecutivo.
 */
@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboard/infra')
export class InfraController {
  constructor(private readonly infra: InfraService) {}

  /** Los trenes REALES del árbol, cada uno con su estado de infraestructura. */
  @Get('trenes')
  @RequirePermissions('dashboard.read')
  trenes(@CurrentUser() user: any) {
    return this.infra.resumenTrenes(user?.userId);
  }

  /**
   * Activos que no cuelgan de ningún tren. Ruta ANTES de 'tren/:idOrCode' por
   * disciplina: lo específico primero, siempre.
   */
  @Get('sin-ubicar')
  @RequirePermissions('dashboard.read')
  sinUbicar(@CurrentUser() user: any) {
    // Lo que no cuelga de ningún tren sólo lo ve quien lo ve todo. Un jefe
    // de línea no puede saber si eso es suyo, así que no se le enseña.
    return this.infra.sinUbicar(user?.userId);
  }

  /**
   * Todo lo de un tren agrupado por zona (bloque 49). Acepta id, código o
   * sigla, porque el selector de la pantalla trabaja con siglas (T1, OFI).
   *
   * Va con `om.mirar` y no con `dashboard.read`: es la pantalla de Producción,
   * y un jefe de tren no tiene por qué cargar con el permiso del tablero
   * ejecutivo para ver su propio tren.
   */
  @SinAmbito()  // el servicio recorta por ámbito y responde 404 si no alcanza
  @Get('tren/:idOrCode/zonas')
  @RequirePermissions('om.mirar')
  porZonas(@Param('idOrCode') idOrCode: string, @CurrentUser() user: any) {
    return this.infra.porZonas(idOrCode, user?.userId);
  }

  /** Tablero completo de un tren. Acepta el id o el código de la ubicación. */
  @SinAmbito()  // el tablero ya filtra por ámbito en el servicio
  @Get('tren/:idOrCode')
  @RequirePermissions('dashboard.read')
  detalle(@Param('idOrCode') idOrCode: string, @CurrentUser() user: any) {
    return this.infra.detalleTren(idOrCode, user?.userId);
  }
}
