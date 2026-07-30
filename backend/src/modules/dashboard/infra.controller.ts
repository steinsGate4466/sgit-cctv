import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InfraService } from './infra.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

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
  trenes() {
    return this.infra.resumenTrenes();
  }

  /**
   * Activos que no cuelgan de ningún tren. Ruta ANTES de 'tren/:idOrCode' por
   * disciplina: lo específico primero, siempre.
   */
  @Get('sin-ubicar')
  @RequirePermissions('dashboard.read')
  sinUbicar() {
    return this.infra.sinUbicar();
  }

  /** Tablero completo de un tren. Acepta el id o el código de la ubicación. */
  @Get('tren/:idOrCode')
  @RequirePermissions('dashboard.read')
  detalle(@Param('idOrCode') idOrCode: string) {
    return this.infra.detalleTren(idOrCode);
  }
}
