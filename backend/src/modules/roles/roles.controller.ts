import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles-admin')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  // 'catalogo' y 'plantillas' van ANTES que ':id': si no, ':id' captura la
  // palabra "catalogo" y devuelve un 404 desconcertante.
  @Get('catalogo')
  @RequirePermissions('role.manage')
  catalogo() {
    return this.roles.catalogo();
  }

  @Get()
  @RequirePermissions('role.manage')
  listar() {
    return this.roles.listar();
  }

  @Post()
  @RequirePermissions('role.manage')
  crear(@Body() dto: any) {
    return this.roles.crear(dto);
  }

  @Patch(':id')
  @RequirePermissions('role.manage')
  actualizar(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    // Se pasa el ID de USUARIO y el servicio busca su rol en la base: así se
    // impide que se quede fuera de la administración a sí mismo, aunque su
    // sesión venga de antes de un cambio de rol.
    return this.roles.actualizar(id, dto, user?.userId);
  }

  @Delete(':id')
  @RequirePermissions('role.manage')
  borrar(@Param('id') id: string) {
    return this.roles.borrar(id);
  }

  @Patch('usuario/:userId/ambito')
  @RequirePermissions('user.manage')
  ambito(@Param('userId') userId: string, @Body() dto: any) {
    return this.roles.fijarAmbito(userId, dto?.trenes);
  }
}
