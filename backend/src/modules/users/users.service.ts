import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    return this.prisma.user.update({ where: { id }, data, select: userSelect });
  }

  // Baja lógica: desactiva el usuario (no se borra, preserva trazabilidad).
  async deactivate(id: string, currentUserId?: string) {
    await this.findOne(id);
    if (currentUserId && currentUserId === id) {
      throw new BadRequestException('No puedes desactivar tu propio usuario.');
    }
    await this.assertNoDejaSinJefe(id, 'desactivar este usuario');
    return this.prisma.user.update({ where: { id }, data: { active: false }, select: userSelect });
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
