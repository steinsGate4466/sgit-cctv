import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetPinDto, VerifyPinDto } from './dto/pin.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('user.read')
  findAll() {
    return this.users.findAll();
  }

  // ==========================================================================
  //  PIN DE CAMPO — rutas SIN @RequirePermissions a propósito.
  //
  //  Son del PROPIO usuario sobre su propio PIN: cualquiera con sesión válida
  //  puede gestionar el suyo. El identificador sale del token, nunca de la URL,
  //  así que no hay forma de tocar el PIN de otra persona.
  //  Van ANTES de @Get(':id') para que ':id' no capture la palabra "pin".
  // ==========================================================================

  @Get('pin')
  pinStatus(@CurrentUser() user: any) {
    return this.users.pinStatus(user.userId);
  }

  @Post('pin')
  setPin(@CurrentUser() user: any, @Body() dto: SetPinDto) {
    return this.users.setPin(user.userId, dto);
  }

  @Post('pin/verify')
  verifyPin(@CurrentUser() user: any, @Body() dto: VerifyPinDto) {
    return this.users.verifyPin(user.userId, dto);
  }

  // OJO: 'roles' debe ir ANTES de ':id' para que no lo capture la ruta con parámetro.
  @Get('roles')
  @RequirePermissions('user.read')
  roles() {
    return this.users.listRoles();
  }

  @Get(':id')
  @RequirePermissions('user.read')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @RequirePermissions('user.manage')
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('user.manage')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: any) {
    return this.users.update(id, dto, user?.userId);
  }

  @Delete(':id')
  @RequirePermissions('user.manage')
  deactivate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.users.deactivate(id, user?.userId);
  }
}
