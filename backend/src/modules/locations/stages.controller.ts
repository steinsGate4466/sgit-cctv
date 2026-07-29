import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StagesService } from './stages.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

/**
 * Etapas del proceso de laminación — parte del módulo de Ubicaciones.
 *
 * Lectura: cualquiera con location.read.
 * Escritura: location.manage (Jefe de Mantenimiento y Supervisor TI).
 */
@ApiTags('locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('locations/stages')
export class StagesController {
  constructor(private readonly stages: StagesService) {}

  @Get()
  @RequirePermissions('location.read')
  findAll() {
    return this.stages.findAll();
  }

  /** Ambientes disponibles y el intervalo preventivo que implica cada uno. */
  @Get('ambientes')
  @RequirePermissions('location.read')
  ambientes() {
    return this.stages.ambientes();
  }

  /** Trenes donde se pueden instanciar etapas. */
  @Get('trenes')
  @RequirePermissions('location.read')
  trenes() {
    return this.stages.trenes();
  }

  @Post()
  @RequirePermissions('location.manage')
  create(@Body() dto: any) {
    return this.stages.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('location.manage')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.stages.update(id, dto);
  }

  /** Cuelga la etapa de un tren concreto (crea la ubicación de tipo ETAPA). */
  @Post(':id/trenes/:trenId')
  @RequirePermissions('location.manage')
  instanciar(@Param('id') id: string, @Param('trenId') trenId: string) {
    return this.stages.instanciarEnTren(id, trenId);
  }

  /** Desactiva (no borra: conservaría el historial de mantenimiento). */
  @Delete(':id')
  @RequirePermissions('location.manage')
  deactivate(@Param('id') id: string) {
    return this.stages.deactivate(id);
  }
}
