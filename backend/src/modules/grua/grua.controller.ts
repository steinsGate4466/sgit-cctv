import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GruaService } from './grua.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CrearInspeccionGruaDto } from './dto/inspeccion-grua.dto';

@ApiTags('gruas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('gruas')
export class GruaController {
  constructor(private readonly gruas: GruaService) {}

  @Get()
  @RequirePermissions('wo.read')
  lista(@CurrentUser() u: any, @Query('tren') tren?: string, @Query('grua') grua?: string) {
    return this.gruas.lista(u?.userId, tren, grua);
  }

  /** Literales ANTES que `:id`, o Nest los leería como identificadores. */
  @Get('resumen')
  @RequirePermissions('wo.read')
  resumen(@CurrentUser() u: any) {
    return this.gruas.porGrua(u?.userId);
  }

  @Get('historial/:assetId')
  @RequirePermissions('wo.read')
  historial(@Param('assetId') assetId: string) {
    return this.gruas.historial(assetId);
  }

  @Get(':id')
  @RequirePermissions('wo.read')
  detalle(@Param('id') id: string) {
    return this.gruas.detalle(id);
  }

  @Post()
  @RequirePermissions('wo.update')
  crear(@Body() dto: CrearInspeccionGruaDto, @CurrentUser() u: any) {
    return this.gruas.crear(dto, u?.userId);
  }
}
