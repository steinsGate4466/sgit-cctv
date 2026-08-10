import { Body, Controller, Get, Headers, Ip, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { FrenoGuard, Freno } from '../../common/guards/freno.guard';
import { CUPO_LOGIN } from '../../common/freno';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('auth')
@UseGuards(FrenoGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Freno(CUPO_LOGIN)
  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  @Public()
  @Freno(CUPO_LOGIN)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Ip() ip: string, @Headers('user-agent') ua: string) {
    return this.auth.refresh(dto.refreshToken, ip, ua);
  }

  /**
   * CERRAR SESIÓN DE VERDAD.
   *
   * Hasta ahora "cerrar sesión" sólo borraba el token del navegador: el
   * refresh seguía valiendo hasta caducar. Robado, servía igual. Ahora la
   * sesión se revoca en el servidor y deja de valer al instante.
   */
  @ApiBearerAuth()
  @Post('logout')
  logout(@Body() dto: any, @CurrentUser() user: any, @Ip() ip: string) {
    return this.auth.logout(dto?.refreshToken, user?.userId, ip);
  }

  /** Mis sesiones abiertas: sirve para reconocer una que no es tuya. */
  @ApiBearerAuth()
  @Get('sesiones')
  sesiones(@CurrentUser() user: any) {
    return this.auth.misSesiones(user.userId);
  }

  /** El botón de "me robaron el teléfono". */
  @ApiBearerAuth()
  @Post('sesiones/cerrar-todas')
  cerrarTodas(@CurrentUser() user: any, @Ip() ip: string) {
    return this.auth.cerrarTodas(user.userId, ip);
  }

  // Protegido por el guard global (JWT). Devuelve el usuario del token.
  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: any) {
    // Se completa desde la BASE, no sólo con lo que trae el token: el ámbito
    // de trenes puede haber cambiado hace un minuto y la pantalla tiene que
    // enterarse ya, no cuando el usuario vuelva a entrar mañana.
    return this.auth.perfil(user);
  }
}
