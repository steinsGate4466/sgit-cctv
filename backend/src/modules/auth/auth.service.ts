import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';

/**
 * AuthService — autenticación y emisión de tokens JWT.
 * F1-A: se añade rotación de tokens vía refresh (stateless).
 */
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  /**
   * Valida credenciales (email + password con argon2) y emite el par de tokens.
   * Qué recibe: LoginDto. Qué devuelve: { accessToken, refreshToken, user }.
   */
  async login(dto: LoginDto, ip?: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || !user.active) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    // Trazabilidad: registrar el inicio de sesión.
    await this.audit.record({ userId: user.id, action: 'LOGIN', entity: 'auth', entityId: user.id, ip });
    return this.buildTokens(user);
  }

  /**
   * Rota los tokens a partir de un refresh token válido.
   * Qué recibe: el refresh token (string). Qué devuelve: un nuevo par de tokens.
   * Por qué existe: permitir renovar el access token (corto) sin re-login, y
   * recalcular permisos actualizados desde la BD en cada rotación.
   */
  async refresh(refreshToken: string) {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'change_me_refresh',
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || !user.active) throw new UnauthorizedException('Usuario no válido');

    return this.buildTokens(user);
  }

  /**
   * Construye el par de tokens con los permisos del usuario resueltos.
   * El access token lleva rol y permisos; el refresh solo el id (sub).
   */
  private async buildTokens(user: any) {
    const permissions = user.role.permissions.map((rp: any) => rp.permission.code);
    const payload = { sub: user.id, email: user.email, role: user.role.name, permissions };
    return {
      accessToken: await this.jwt.signAsync(payload, {
        secret: process.env.JWT_SECRET || 'change_me_in_prod',
        expiresIn: process.env.JWT_EXPIRES_IN || '900s',
      }),
      refreshToken: await this.jwt.signAsync(
        { sub: user.id },
        {
          secret: process.env.JWT_REFRESH_SECRET || 'change_me_refresh',
          expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
        },
      ),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role.name,
        permissions,
      },
    };
  }
}
