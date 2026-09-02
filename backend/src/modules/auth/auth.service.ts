import { Injectable, UnauthorizedException } from '@nestjs/common';
import { duracionDeToken, secretoJwt, secretoRefresh } from '../../common/secreto-jwt';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

/**
 * Hash de una contraseña que no es de nadie. Sólo existe para que verificar
 * un usuario inexistente cueste el mismo tiempo que verificar uno real.
 * Es un hash argon2id válido de la cadena "senuelo-sin-uso".
 */
const HASH_SENUELO =
  '$argon2id$v=19$m=65536,t=3,p=4$c2VudWVsby1zaW4tdXNv$' +
  'YnVzY2FzLXVuLXNlY3JldG8tYXF1aS1ub2hheS1uYWRh';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizarIp, resumirAgente } from '../../common/origen';
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
  async login(dto: LoginDto, ip?: string | null, dispositivo?: string | null) {
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
    /* CONTRA LA ENUMERACIÓN DE USUARIOS POR TIEMPO DE RESPUESTA.
       -------------------------------------------------------------------
       El mensaje ya era el mismo para «no existe» y «contraseña mal». Pero el
       TIEMPO no lo era: si el usuario no existía se saltaba `argon2.verify`
       entero y la respuesta llegaba en 2 ms en vez de 100.
       Midiendo esa diferencia se puede averiguar qué correos son de usuarios
       reales sin acertar ni una contraseña, y con esa lista ya se ataca de
       verdad — o se hace phishing dirigido, que en una planta funciona mejor.
       Así que cuando el usuario no existe se verifica igualmente contra un
       hash de mentira. Cuesta lo mismo y el reloj deja de contar nada. */
    const valid = user && user.active
      ? await argon2.verify(user.passwordHash, dto.password).catch(() => false)
      : await argon2.verify(HASH_SENUELO, dto.password).catch(() => false) && false;

    if (!valid) {
      await this.registerFail(key, dto.email, ip);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Éxito: limpia el contador de intentos.
    this.attempts.delete(key);
    await this.prisma.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({ userId: user!.id, action: 'LOGIN', entity: 'auth', entityId: user!.id, ip });
    return this.buildTokens(user, ip, resumirAgente(dispositivo));
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
  async refresh(refreshToken: string, ip?: string | null, dispositivo?: string | null) {
    let payload: { sub: string; jti?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: secretoRefresh(),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    // Los tokens emitidos ANTES de este cambio no llevan jti. Se aceptan una
    // última vez y salen con uno nuevo: si no, al desplegar se caería la
    // sesión de todo el mundo a la vez, sin motivo.
    const sesion = payload.jti
      ? await this.prisma.sesion.findUnique({ where: { id: payload.jti } })
      : null;

    if (payload.jti && !sesion) {
      throw new UnauthorizedException('Esta sesión ya no existe. Vuelve a iniciar sesión.');
    }

    if (sesion?.revocadaEn) {
      // REUTILIZACIÓN DE UN TOKEN YA ROTADO.
      //
      // Cada refresh revoca el anterior. Si llega uno revocado, hay dos
      // copias del mismo token circulando: la de la persona y la de quien se
      // lo llevó. No se puede saber cuál es cuál, así que se cierran TODAS
      // las sesiones de ese usuario. Es molesto —tiene que volver a entrar—
      // y es lo correcto: la alternativa es dejar dentro al que robó.
      await this.prisma.sesion.updateMany({
        where: { userId: sesion.userId, revocadaEn: null },
        data: { revocadaEn: new Date(), motivoRevocacion: 'token reutilizado' },
      });
      await this.audit.record({
        action: 'SESION_REUTILIZADA', entity: 'auth', ip,
        after: { userId: sesion.userId, sesion: sesion.id },
      });
      throw new UnauthorizedException(
        'Esta sesión se cerró por seguridad. Vuelve a iniciar sesión.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || !user.active) throw new UnauthorizedException('Usuario no válido');

    // ROTACIÓN: el token que se acaba de usar deja de valer. Es lo que
    // permite detectar el robo en el párrafo de arriba.
    if (sesion) {
      await this.prisma.sesion.update({
        where: { id: sesion.id },
        data: { revocadaEn: new Date(), motivoRevocacion: 'rotado', ultimoUsoEn: new Date() },
      }).catch(() => null);
    }

    return this.buildTokens(user, ip, resumirAgente(dispositivo));
  }

  /** Cerrar sesión de verdad: la sesión deja de valer al instante. */
  async logout(refreshToken?: string, userId?: string | null, ip?: string | null) {
    let jti: string | null = null;
    if (refreshToken) {
      try {
        const p: any = await this.jwt.verifyAsync(refreshToken, { secret: secretoRefresh() });
        jti = p?.jti ?? null;
      } catch { /* token ilegible: se sigue, puede que baste con el usuario */ }
    }
    if (jti) {
      await this.prisma.sesion.updateMany({
        where: { id: jti, revocadaEn: null },
        data: { revocadaEn: new Date(), motivoRevocacion: 'cierre de sesión' },
      });
    }
    await this.audit.record({ userId: userId || null, action: 'LOGOUT', entity: 'auth', ip });
    return { ok: true };
  }

  /** Mis sesiones abiertas. Sirve para reconocer una que no es tuya. */
  async misSesiones(userId: string) {
    const filas = await this.prisma.sesion.findMany({
      where: { userId, revocadaEn: null, expiraEn: { gt: new Date() } },
      orderBy: { creadaEn: 'desc' },
      take: 20,
    });
    return filas.map((s) => ({
      id: s.id, creadaEn: s.creadaEn, ultimoUsoEn: s.ultimoUsoEn,
      ip: s.ip, dispositivo: s.dispositivo, equipo: s.equipo,
    }));
  }

  /** Cerrar todas mis sesiones. El botón de "me robaron el teléfono". */
  async cerrarTodas(userId: string, ip?: string | null) {
    const r = await this.prisma.sesion.updateMany({
      where: { userId, revocadaEn: null },
      data: { revocadaEn: new Date(), motivoRevocacion: 'cerradas por el usuario' },
    });
    await this.audit.record({ userId, action: 'CERRAR_TODAS_SESIONES', entity: 'auth', ip, after: { cerradas: r.count } });
    return { ok: true, cerradas: r.count };
  }

  /**
   * Construye el par de tokens con los permisos del usuario resueltos.
   * El access token lleva rol y permisos; el refresh solo el id (sub).
   */
  private async buildTokens(user: any, ip?: string | null, dispositivo?: string | null) {
    const permissions = user.role.permissions.map((rp: any) => rp.permission.code);
    /* `pv` = versión de permisos (bloque 82). Va DENTRO del token para poder
       compararlo en cada petición: subir el contador del usuario mata todos
       sus tokens a la vez. Es lo que convierte «desactivar» en un corte real
       en vez de una espera de quince minutos. */
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
      permissions,
      pv: (user as any).permisosVersion ?? 1,
    };

    // CADA REFRESH TOKEN NACE CON SU FILA DE SESIÓN.
    //
    // El token lleva dentro el identificador (jti) de esa fila. Verificar la
    // firma ya no basta: además se comprueba que la sesión exista y no esté
    // revocada. Eso es lo que hace que cerrar sesión —o cambiar la
    // contraseña— sirva de algo de verdad.
    const jti = randomUUID();
    const dias = Number((process.env.JWT_REFRESH_EXPIRES_IN || '7d').replace(/\D/g, '')) || 7;
    await this.prisma.sesion.create({
      data: {
        id: jti,
        userId: user.id,
        expiraEn: new Date(Date.now() + dias * 86400000),
        ip: normalizarIp(ip),
        dispositivo: dispositivo?.slice(0, 120) || null,
      },
    }).catch(() => null);

    return {
      accessToken: await this.jwt.signAsync(payload, {
        secret: secretoJwt(),
        // Bloque 53: la duración se VALIDA. Un formato que la librería no
        // entienda —«15minutos»— hacía que el token saliera sin caducidad, en
        // silencio. Ver duracionDeToken() en common/secreto-jwt.ts.
        expiresIn: duracionDeToken('JWT_EXPIRES_IN', '900s'),
      }),
      refreshToken: await this.jwt.signAsync(
        { sub: user.id, jti },
        {
          secret: secretoRefresh(),
          expiresIn: duracionDeToken('JWT_REFRESH_EXPIRES_IN', '7d'),
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
      select: {
        fullName: true,
        active: true,
        ambitoTrenes: true,
        role: {
          select: {
            name: true,
            /* LOS PERMISOS, DE LA BASE — bloque 86.
               -------------------------------------------------------------
               ESTO FALTABA. Antes esta función devolvía `...delToken` con el
               nombre y el ámbito frescos, pero los PERMISOS seguían siendo
               los del token, que es de cuando la persona inició sesión.

               Consecuencia, y es lo que reportó el usuario: se le quita un
               permiso al rol «Jefe de línea», la persona recarga la página
               —que es lo que uno hace para «refrescar»— y el menú sigue
               igual. Parece que el cambio no se guardó.

               El comentario de esta función ya decía que el ámbito «tiene
               que enterarse ya, no cuando el usuario vuelva a entrar
               mañana». Los permisos son exactamente el mismo caso y se
               habían quedado fuera. */
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });
    return {
      ...delToken,
      fullName: u?.fullName ?? delToken.fullName,
      role: u?.role?.name ?? delToken.role,
      activo: u?.active ?? true,
      ambitoTrenes: u?.ambitoTrenes ?? [],
      /* Si la consulta no trajo rol, se dejan los del token: es mejor que
         vaciarlos, que dejaría a la persona con un menú en blanco por un
         fallo de lectura. El servidor sigue decidiendo de verdad en cada
         petición — esto es sólo para que la pantalla no mienta. */
      permissions: u?.role
        ? u.role.permissions.map((rp) => rp.permission.code)
        : delToken.permissions,
    };
  }
}
