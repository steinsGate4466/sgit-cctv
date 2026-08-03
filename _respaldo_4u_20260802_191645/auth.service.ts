import { Injectable, UnauthorizedException } from '@nestjs/common';
import { secretoJwt } from '../../common/secreto-jwt';
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

  // Anti fuerza bruta en el SERVIDOR (no solo en el cliente): registra los intentos
  // fallidos por correo y bloquea temporalmente tras varios fallos.
  private attempts = new Map<string, { fails: number; lockedUntil: number }>();
  private readonly MAX_FAILS = 5;
  private readonly LOCK_MS = 15 * 60 * 1000; // 15 minutos

  /**
   * Valida credenciales (email + password con argon2) y emite el par de tokens.
   * Qué recibe: LoginDto. Qué devuelve: { accessToken, refreshToken, user }.
   * Incluye bloqueo por intentos fallidos para frenar fuerza bruta.
   */
  async login(dto: LoginDto, ip?: string | null) {
    const key = dto.email.trim().toLowerCase();
    const now = Date.now();

    // 1) ¿Está bloqueado ahora mismo?
    const rec = this.attempts.get(key);
    if (rec && rec.lockedUntil > now) {
      const mins = Math.ceil((rec.lockedUntil - now) / 60000);
      await this.audit.record({
        action: 'LOGIN_BLOQUEADO', entity: 'auth', ip,
        after: { email: dto.email, minutosRestantes: mins },
      });
      throw new UnauthorizedException(
        `Cuenta bloqueada temporalmente por varios intentos fallidos. Inténtalo en ${mins} min.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    const valid = user && user.active
      ? await argon2.verify(user.passwordHash, dto.password).catch(() => false)
      : false;

    if (!valid) {
      await this.registerFail(key, dto.email, ip);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Éxito: limpia el contador de intentos.
    this.attempts.delete(key);
    await this.prisma.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({ userId: user!.id, action: 'LOGIN', entity: 'auth', entityId: user!.id, ip });
    return this.buildTokens(user);
  }

  /** Registra un intento fallido y bloquea la cuenta si se supera el máximo. */
  private async registerFail(key: string, email: string, ip?: string | null) {
    const now = Date.now();
    const rec = this.attempts.get(key) || { fails: 0, lockedUntil: 0 };
    rec.fails += 1;
    let locked = false;
    if (rec.fails >= this.MAX_FAILS) {
      rec.lockedUntil = now + this.LOCK_MS;
      rec.fails = 0;
      locked = true;
    }
    this.attempts.set(key, rec);
    await this.audit.record({
      action: locked ? 'LOGIN_BLOQUEADO' : 'LOGIN_FALLIDO', entity: 'auth', ip,
      after: { email, intento: 'contraseña/usuario incorrecto', bloqueado: locked },
    });
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
        secret: secretoJwt(),
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

  /**
   * Perfil completo de quien pregunta. Añade al contenido del token los
   * datos que pueden cambiar mientras la sesión sigue abierta: el ámbito de
   * trenes y si la cuenta se ha desactivado.
   */
  async perfil(delToken: any) {
    if (!delToken?.userId) return delToken;
    const u = await this.prisma.user.findUnique({
      where: { id: delToken.userId },
      select: { fullName: true, active: true, ambitoTrenes: true, role: { select: { name: true } } },
    });
    return {
      ...delToken,
      fullName: u?.fullName ?? delToken.fullName,
      role: u?.role?.name ?? delToken.role,
      activo: u?.active ?? true,
      ambitoTrenes: u?.ambitoTrenes ?? [],
    };
  }
}
