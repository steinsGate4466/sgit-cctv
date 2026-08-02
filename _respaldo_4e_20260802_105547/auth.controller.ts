import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
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
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  // Protegido por el guard global (JWT). Devuelve el usuario del token.
  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: any) {
    return user;
  }
}
