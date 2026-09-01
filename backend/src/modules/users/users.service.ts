import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccesoVigenteGuard } from '../../common/guards/acceso-vigente.guard';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { SetPinDto, VerifyPinDto } from './dto/pin.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { revisarPassword } from '../../common/politica-password';

// Proyección segura: nunca expone passwordHash.
const userSelect = {
  id: true,
  email: true,
  fullName: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  // A qué trenes mira. Vacío = todos. Se devuelve para que la pantalla de
  // Usuarios pueda enseñarlo sin una segunda llamada.
  ambitoTrenes: true,
  /* `exigeAmbito` viaja con el rol (bloque 42) porque cambia lo que significa
     un ámbito vacío, y por tanto lo que la pantalla de Usuarios debe DECIR.
     Con un rol normal, sin trenes marcados se ve toda la planta. Con un rol
     sectorizado, sin trenes marcados no se ve NADA. Si el diálogo dijera lo
     primero en los dos casos, alguien guardaría sin marcar creyendo que da
     acceso completo y estaría dejando a esa persona fuera. */
  role: { select: { id: true, name: true, exigeAmbito: true } },
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'asc' } });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  // Crea un usuario con contraseña hasheada (argon2) y rol válido.
  async create(dto: CreateUserDto) {
    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) throw new BadRequestException('Rol no válido');
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('El email ya está registrado');

    /* POLÍTICA DE CONTRASEÑA (bloque 26). Se comprueba aquí y no en el DTO
       porque hace falta el correo y el nombre: `cristhian2026` es fácil de
       adivinar justo para quien conoce a Cristhian, que es quien tiene acceso
       a la planta. Se devuelven TODOS los motivos de golpe: si se diera uno
       por vez, crear una cuenta serían cinco intentos. */
    this.exigirPasswordDecente(dto.password, [dto.email, dto.fullName]);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        passwordHash: await argon2.hash(dto.password),
        roleId: dto.roleId,
      },
      select: userSelect,
    });
  }

  /**
   * Verifica que la operación no deje al sistema sin ningún Jefe de Mantenimiento activo.
   * Sin ese rol nadie podría cerrar OM, aprobar accesos ni gestionar usuarios: el sistema
   * quedaría bloqueado y sin forma de recuperarse desde la propia aplicación.
   */
  private async assertNoDejaSinJefe(userId: string, motivo: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }, include: { role: { select: { name: true } } },
    });
    if (!user || user.role.name !== 'Jefe de Mantenimiento' || !user.active) return;
    const otros = await this.prisma.user.count({
      where: { active: true, id: { not: userId }, role: { name: 'Jefe de Mantenimiento' } },
    });
    if (otros === 0) {
      throw new BadRequestException(
        `No se puede ${motivo}: es el único Jefe de Mantenimiento activo. ` +
        'Asigna ese rol a otro usuario primero.',
      );
    }
  }

  // Actualiza datos, rol, estado y (opcional) contraseña.
  async update(id: string, dto: UpdateUserDto, currentUserId?: string) {
    await this.findOne(id);
    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
      if (!role) throw new BadRequestException('Rol no válido');
      // Cambiar de rol al único Jefe activo dejaría el sistema sin administrador.
      if (role.name !== 'Jefe de Mantenimiento') {
        await this.assertNoDejaSinJefe(id, 'cambiar el rol de este usuario');
      }
    }
    // Nadie puede desactivarse a sí mismo (se quedaría fuera del sistema al instante).
    if (dto.active === false) {
      if (currentUserId && currentUserId === id) {
        throw new BadRequestException('No puedes desactivar tu propio usuario.');
      }
      await this.assertNoDejaSinJefe(id, 'desactivar este usuario');
    }
    const data: any = { fullName: dto.fullName, roleId: dto.roleId, active: dto.active };
    if (dto.password) {
      // Al cambiar la contraseña rige la misma política que al crearla. Sin
      // esto se cumplía la regla el primer día y se saltaba para siempre con
      // una edición.
      const yo = await this.prisma.user.findUnique({
        where: { id }, select: { email: true, fullName: true },
      });
      this.exigirPasswordDecente(dto.password, [yo?.email, dto.fullName ?? yo?.fullName]);
      data.passwordHash = await argon2.hash(dto.password);
    }
    /* SUBIR EL CONTADOR MATA TODOS SUS TOKENS (bloque 82).
       -----------------------------------------------------------------------
       Sólo si cambió lo que la persona PUEDE HACER: el rol, si está activa, o
       su contraseña. Corregirle el nombre no le tumba la sesión — hacerlo
       sería sacar a alguien del sistema en mitad de una orden, sin motivo, y a
       la tercera vez el software se percibe como inestable.

       Antes de esto, quitarle un rol a alguien no le quitaba nada: su token
       seguía llevando los permisos viejos hasta quince minutos. */
    const cambiaLoQuePuedeHacer =
      dto.roleId !== undefined || dto.active !== undefined || !!dto.password;
    if (cambiaLoQuePuedeHacer) data.permisosVersion = { increment: 1 };

    const r = await this.prisma.user.update({ where: { id }, data, select: userSelect });
    /* Y se borra de la caché del guard para que el corte se note EN EL ACTO,
       no dentro de quince segundos. */
    if (cambiaLoQuePuedeHacer) AccesoVigenteGuard.olvidar(id);
    return r;
  }

  /**
   * CORTAR EL ACCESO DE ALGUIEN, AHORA.
   *
   * Es lo que pidió el usuario: «cómo quitar accesos de inmediato». Hace las
   * TRES cosas que hacen falta, y las tres juntas — hacer sólo una deja media
   * puerta abierta:
   *
   *   1. Sube el contador  → sus tokens de acceso dejan de valer.
   *   2. Revoca sus sesiones → no puede renovar con el token de refresco.
   *   3. Lo borra de la caché → el corte es inmediato, no en quince segundos.
   *
   * NO desactiva al usuario a propósito. Son dos decisiones distintas: cortar
   * una sesión sospechosa es urgente y reversible; dar de baja a una persona
   * es administrativo. Juntarlas obligaría a elegir entre no cortar o cortar
   * de más.
   */
  async cortarAcceso(id: string, motivo?: string) {
    await this.findOne(id);
    const [, sesiones] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { permisosVersion: { increment: 1 } } as any,
        select: { id: true },
      }),
      this.prisma.sesion.updateMany({
        where: { userId: id, revocadaEn: null },
        data: {
          revocadaEn: new Date(),
          motivoRevocacion: motivo?.trim() || 'acceso cortado por el administrador',
        },
      }),
    ]);
    AccesoVigenteGuard.olvidar(id);
    return { ok: true, sesionesCerradas: sesiones.count };
  }

  // Baja lógica: desactiva el usuario (no se borra, preserva trazabilidad).
  async deactivate(id: string, currentUserId?: string) {
    await this.findOne(id);
    if (currentUserId && currentUserId === id) {
      throw new BadRequestException('No puedes desactivar tu propio usuario.');
    }
    await this.assertNoDejaSinJefe(id, 'desactivar este usuario');
    /* Desactivar SÍ sube el contador y cierra sus sesiones: si no, la persona
       seguiría dentro hasta quince minutos después de darla de baja. Ése era
       el agujero. */
    const r = await this.prisma.user.update({
      where: { id },
      data: { active: false, permisosVersion: { increment: 1 } } as any,
      select: userSelect,
    });
    await this.prisma.sesion.updateMany({
      where: { userId: id, revocadaEn: null },
      data: { revocadaEn: new Date(), motivoRevocacion: 'usuario desactivado' },
    });
    AccesoVigenteGuard.olvidar(id);
    return r;
  }

  /**
   * QUIÉN ESTÁ DENTRO AHORA MISMO — bloque 82.
   *
   * Es la otra mitad de lo que pidió el usuario: «identificar usuarios que
   * están ahí». Sin esta lista, cortar el acceso es disparar a ciegas — hay
   * que poder ver primero quién está, desde dónde y desde cuándo.
   *
   * QUÉ SE ENSEÑA, Y POR QUÉ CADA COSA:
   *   · nombre y rol      → a quién llamar
   *   · IP y equipo       → reconocer una sesión que no cuadra. Un turno de
   *                         noche desde una IP de oficina es la señal.
   *   · dispositivo       → «Chrome en Windows» dice más que un identificador
   *   · desde cuándo      → una sesión de hace seis días no es de hoy
   *   · último uso        → distingue «está trabajando» de «se dejó abierto»
   *
   * NO se enseña el identificador de sesión completo: no hace falta para
   * decidir y es lo que se usaría para suplantarla.
   */
  async sesionesActivas() {
    const ahora = new Date();
    const filas = await this.prisma.sesion.findMany({
      where: { revocadaEn: null, expiraEn: { gt: ahora } },
      orderBy: [{ ultimoUsoEn: 'desc' }, { creadaEn: 'desc' }],
      take: 200,
      select: {
        id: true, creadaEn: true, ultimoUsoEn: true, expiraEn: true,
        ip: true, dispositivo: true, equipo: true,
        user: { select: { id: true, fullName: true, email: true, active: true, role: { select: { name: true } } } },
      },
    });

    return filas.map((f) => ({
      id: f.id,
      userId: f.user.id,
      persona: f.user.fullName,
      email: f.user.email,
      rol: f.user.role?.name ?? null,
      /* Una sesión VIVA de un usuario DESACTIVADO es exactamente lo que hay
         que ver de un vistazo: significa que se dio de baja a alguien y su
         sesión sigue en pie. La pantalla lo pinta en rojo. */
      usuarioActivo: f.user.active,
      ip: f.ip,
      equipo: f.equipo,
      dispositivo: f.dispositivo,
      desde: f.creadaEn,
      ultimoUso: f.ultimoUsoEn,
      /* «Activa ahora» = usada en los últimos 10 minutos. Es lo que separa a
         quien está trabajando de quien se dejó la pestaña abierta el martes,
         y sin esa distinción la lista no sirve para decidir a quién cortar. */
      activaAhora: !!f.ultimoUsoEn && (ahora.getTime() - f.ultimoUsoEn.getTime()) < 600_000,
    }));
  }

  /** Cerrar UNA sesión concreta, sin tocar las demás de esa persona. */
  async cerrarSesion(sesionId: string, motivo?: string) {
    const r = await this.prisma.sesion.updateMany({
      where: { id: sesionId, revocadaEn: null },
      data: {
        revocadaEn: new Date(),
        motivoRevocacion: motivo?.trim() || 'cerrada por el administrador',
      },
    });
    /* NO se sube el contador aquí a propósito: cerrar UNA sesión no cambia lo
       que la persona puede hacer, y subirlo tumbaría también las otras — que
       es justo lo contrario de lo que se pidió. Para eso está `cortarAcceso`. */
    return { ok: true, cerradas: r.count };
  }

  // Roles disponibles con sus permisos (para asignar al crear/editar usuarios).
  listRoles() {
    return this.prisma.role.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ==========================================================================
  //  PIN DE CAMPO
  //
  //  Reanudar una orden en campo con guantes puestos y una contraseña larga es
  //  inviable: lo que ocurre en la práctica es que la gente comparte claves o
  //  deja la sesión abierta. El PIN resuelve eso SIN debilitar la firma: la
  //  apertura y el cierre de una orden siguen exigiendo contraseña completa.
  // ==========================================================================

  /**
   * Define o cambia el PIN. Exige la contraseña actual: sin eso, cualquiera con
   * una sesión abierta podría ponerle un PIN al usuario y usarlo después.
   */
  async setPin(userId: string, dto: SetPinDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new NotFoundException('Usuario no encontrado');

    const ok = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    if (!ok) throw new BadRequestException('La contraseña actual no es correcta.');

    // Un PIN de dígitos repetidos o consecutivos no protege nada.
    if (/^(\d)\1+$/.test(dto.pin)) {
      throw new BadRequestException('El PIN no puede ser el mismo dígito repetido.');
    }
    if ('0123456789'.includes(dto.pin) || '9876543210'.includes(dto.pin)) {
      throw new BadRequestException('El PIN no puede ser una secuencia consecutiva.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { pinHash: await argon2.hash(dto.pin), pinUpdatedAt: new Date() },
    });

    // Se devuelve el correo para que la capa superior avise al dueño: si
    // alguien le cambia el PIN, tiene que enterarse en el momento.
    return { ok: true, email: user.email, actualizadoEn: new Date() };
  }

  /** Verifica el PIN para reanudar en campo. NO sustituye a la firma. */
  async verifyPin(userId: string, dto: VerifyPinDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active || !user.pinHash) {
      throw new BadRequestException('No tienes un PIN configurado.');
    }
    const ok = await argon2.verify(user.pinHash, dto.pin).catch(() => false);
    if (!ok) throw new BadRequestException('PIN incorrecto.');
    return { ok: true };
  }

  /** Si el usuario ya tiene PIN, para que la interfaz sepa qué ofrecer. */
  async pinStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pinHash: true, pinUpdatedAt: true },
    });
    return { tienePin: !!user?.pinHash, actualizadoEn: user?.pinUpdatedAt || null };
  }
  /** Aplica la política y traduce el resultado a un error legible. */
  private exigirPasswordDecente(password: string, datos: (string | null | undefined)[]) {
    const r = revisarPassword(password, datos);
    if (!r.valida) {
      throw new BadRequestException(
        'La contraseña no cumple la política:\n· ' + r.motivos.join('\n· '),
      );
    }
  }

}
