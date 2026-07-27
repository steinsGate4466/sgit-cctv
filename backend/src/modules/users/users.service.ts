import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Proyección segura: nunca expone passwordHash.
const userSelect = {
  id: true,
  email: true,
  fullName: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
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
    if (dto.password) data.passwordHash = await argon2.hash(dto.password);
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
}
