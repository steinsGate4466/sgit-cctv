import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ActualizarRolDto, AmbitoDeTrenesDto, CrearRolDto } from './dto/rol.dto';

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
  crear(@Body() dto: CrearRolDto) {
    return this.roles.crear(dto);
  }

  @SinAmbito()  // roles: configuración del sistema
  @Patch(':id')
  @RequirePermissions('role.manage')
  actualizar(@Param('id') id: string, @Body() dto: ActualizarRolDto, @CurrentUser() user: any) {
    // Se pasa el ID de USUARIO y el servicio busca su rol en la base: así se
    // impide que se quede fuera de la administración a sí mismo, aunque su
    // sesión venga de antes de un cambio de rol.
    return this.roles.actualizar(id, dto, user?.userId);
  }

  @SinAmbito()  // roles: configuración del sistema
  @Delete(':id')
  @RequirePermissions('role.manage')
  borrar(@Param('id') id: string) {
    return this.roles.borrar(id);
  }

  @SinAmbito()  // roles: configuración del sistema
  @Patch('usuario/:userId/ambito')
  @RequirePermissions('user.manage')
  ambito(@Param('userId') userId: string, @Body() dto: AmbitoDeTrenesDto) {
    return this.roles.fijarAmbito(userId, dto?.trenes);
  }
}
