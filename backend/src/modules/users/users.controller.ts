import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { FrenoGuard, Freno } from '../../common/guards/freno.guard';
import { CUPO_PIN } from '../../common/freno';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetPinDto, VerifyPinDto } from './dto/pin.dto';
import { RequireAlguno, RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MotivoDto } from './dto/motivo.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /* SELECTOR DE PERSONAS — «cualquiera de». Bloque 66.
     -------------------------------------------------------------------------
     Esto no es «el módulo de Usuarios»: es la lista para elegir a QUIÉN se le
     asigna algo. La usan Campañas de mapeo (repartir zonas), Limpieza
     (quién purga) y Mantenimiento (asignar técnico), abiertas todas con
     permisos distintos.

     Con `user.read` a secas, el desplegable de responsables salía vacío y no
     se podía asignar a nadie. Repartir `user.read` para eso abriría la
     gestión de personas entera.

     Devuelve nombre, correo, rol y estado. Ni contraseñas ni PIN. */
  @Get()
  @RequireAlguno(
    'user.read', 'user.manage', 'asset.read', 'asset.delete',
    'wo.read', 'wo.update', 'wo.approve', 'audit.read',
  )
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

  @Freno(CUPO_PIN)
  @UseGuards(FrenoGuard)
  @Post('pin')
  setPin(@CurrentUser() user: any, @Body() dto: SetPinDto) {
    return this.users.setPin(user.userId, dto);
  }

  // EL AGUJERO MÁS SERIO QUE ENCONTRÓ LA AUDITORÍA DEL 02/08.
  // El PIN es de 4 cifras: 10.000 combinaciones. Sin freno, un programa las
  // prueba todas en segundos y entra como ese técnico. Con este cupo son
  // más de dieciséis horas, y el primer bloqueo salta a los 11 intentos.
  @Freno(CUPO_PIN)
  @UseGuards(FrenoGuard)
  @Post('pin/verify')
  verifyPin(@CurrentUser() user: any, @Body() dto: VerifyPinDto) {
    return this.users.verifyPin(user.userId, dto);
  }

  // OJO: 'roles' debe ir ANTES de ':id' para que no lo capture la ruta con parámetro.
  /* La pantalla de Usuarios se abre con `user.manage` y necesita la lista de
     roles para el desplegable. Con `user.read` a secas quedaba vacía: quien
     administra usuarios no podía elegirles el rol. Bloque 66. */
  @Get('roles')
  @RequireAlguno('user.read', 'user.manage', 'role.manage')
  roles() {
    return this.users.listRoles();
  }

  /* QUIÉN ESTÁ DENTRO AHORA — bloque 82.
     Ruta literal ANTES de `:id`, o Nest leería «sesiones» como identificador
     (regla del proyecto).

     Va con `user.manage` y no con `user.read`: la lista dice desde qué IP y
     qué aparato entra cada persona. Eso es información de seguridad, no de
     directorio. */
  @SinAmbito()
  @Get('sesiones')
  @RequirePermissions('user.manage')
  sesionesActivas() {
    return this.users.sesionesActivas();
  }

  @SinAmbito()
  @Delete('sesiones/:sesionId')
  @RequirePermissions('user.manage')
  cerrarSesion(@Param('sesionId') sesionId: string, @Body() dto: MotivoDto) {
    return this.users.cerrarSesion(sesionId, dto?.motivo);
  }

  /* CORTAR EL ACCESO DE UNA PERSONA, AHORA. Sube su contador y revoca todas
     sus sesiones de golpe. No la desactiva: son dos decisiones distintas. */
  @SinAmbito()
  @Post(':id/cortar-acceso')
  @RequirePermissions('user.manage')
  cortarAcceso(@Param('id') id: string, @Body() dto: MotivoDto) {
    return this.users.cortarAcceso(id, dto?.motivo);
  }

  /* DESBLOQUEAR UNA CUENTA — bloque 104.
     El bloqueo por intentos fallidos son 15 minutos fijos, y sin esto no había
     forma de levantarlo: el técnico esperaba. La segunda llave y la auditoría
     —incluido el intento denegado— viven en el servicio, que es por donde pasa
     cualquier ruta nueva que se olvide del decorador. */
  @Post(':id/desbloquear')
  @RequirePermissions('user.manage')
  @SinAmbito()   // una cuenta bloqueada no pertenece a ningún tren
  desbloquear(
    @Param('id') id: string,
    @Body() dto: MotivoDto,
    @CurrentUser('userId') actorId: string,
  ) {
    return this.users.desbloquearCuenta(id, actorId, dto.motivo);
  }

  @SinAmbito()  // usuarios: configuración del sistema
  /* Qué cuentas están bloqueadas ahora. Va con el MISMO permiso que la
     pantalla que lo enseña: abrir la entrada del menú y dejar el endpoint
     cerrado es el fallo de los bloques 68, 77 y 83. */
  @Get('bloqueadas')
  @RequirePermissions('user.manage')
  @SinAmbito()   // una cuenta bloqueada no pertenece a ningún tren
  bloqueadas() {
    return this.users.cuentasBloqueadas();
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

  @SinAmbito()  // usuarios: configuración del sistema
  @Patch(':id')
  @RequirePermissions('user.manage')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: any) {
    return this.users.update(id, dto, user?.userId);
  }

  @SinAmbito()  // usuarios: configuración del sistema
  @Delete(':id')
  @RequirePermissions('user.manage')
  deactivate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.users.deactivate(id, user?.userId);
  }
}
