import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CablesService } from './cables.service';
import { CreateCableDto, UpdateCableDto, QueryCableDto } from './dto/cable.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AmbitoDe } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Tramos de cable.
 *
 * Ruta bajo /assets/cables. Este controlador se registra ANTES que
 * AssetsController: si fuera después, la ruta @Get(':id') de activos
 * capturaría la palabra "cables" y devolvería "activo no encontrado".
 */
@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('assets/cables')
export class CablesController {
  constructor(private readonly cables: CablesService) {}

  @Get()
  @RequirePermissions('asset.read')
  findAll(@Query() q: QueryCableDto) {
    return this.cables.findAll(q);
  }

  /** Resumen para el tablero: total, fuera de norma, sin medir, dañados. */
  @Get('resumen')
  @RequirePermissions('asset.read')
  resumen() {
    return this.cables.resumen();
  }

  @Post()
  @RequirePermissions('asset.update')
  create(@Body() dto: CreateCableDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.cables.create(dto, user?.userId, ip);
  }

  @AmbitoDe('assetCable')
  @Patch(':id')
  @RequirePermissions('asset.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCableDto,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.cables.update(id, dto, user?.userId, ip);
  }

  /** Marca el tramo como retirado. No se borra: sigue explicando fallas pasadas. */
  @AmbitoDe('assetCable')
  @Delete(':id')
  @RequirePermissions('asset.update')
  retirar(@Param('id') id: string, @CurrentUser() user: any, @Ip() ip: string) {
    return this.cables.retirar(id, user?.userId, ip);
  }
}
