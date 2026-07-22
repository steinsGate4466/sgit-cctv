import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { decryptSecret } from '../../common/crypto/crypto.util';
import { CreateAssetDto } from './dto/create-asset.dto';
import { SignedCreateAssetDto } from './dto/create-asset-signed.dto';
import { SignedUpdateAssetDto } from './dto/update-asset-signed.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { UpdateNetworkDto } from './dto/update-network.dto';
import { QueryAssetDto } from './dto/query-asset.dto';

@Injectable()
export class AssetsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * Alta FIRMADA de activo: re-verifica las credenciales del firmante (argon2) y deja
   * traza de auditoría (CREATE_ASSET) con el firmante. Registrar un activo es crítico
   * porque contiene información sensible (IP, red, accesos).
   */
  async createSigned(dto: SignedCreateAssetDto, ip?: string | null) {
    const signer = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = signer && signer.active
      ? await argon2.verify(signer.passwordHash, dto.password).catch(() => false)
      : false;
    if (!valid) {
      // Registra el intento fallido (no se agregó) y NO cierra sesión (error 400, no 401).
      await this.audit.record({
        userId: signer?.id || null,
        action: 'FIRMA_FALLIDA',
        entity: 'assets',
        ip,
        after: { intento: dto.email, motivo: 'contraseña incorrecta', accion: 'registrar activo' },
      });
      throw new BadRequestException('Firma inválida: contraseña incorrecta');
    }

    const { email, password, ...data } = dto;
    const asset = await this.prisma.asset.create({ data: data as CreateAssetDto });
    await this.audit.record({
      userId: signer!.id,
      action: 'CREATE_ASSET',
      entity: 'assets',
      entityId: asset.id,
      ip,
      after: { assetCode: asset.assetCode, type: asset.type, firmadoPor: signer!.email },
    });
    return asset;
  }

  async findAll(q: QueryAssetDto, sensitive = false) {
    const rows = await this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        type: q.type,
        status: q.status,
        locationId: q.locationId,
        ...(q.search
          ? { OR: [{ assetCode: { contains: q.search, mode: 'insensitive' } }, { model: { contains: q.search, mode: 'insensitive' } }] }
          : {}),
      },
      include: sensitive
        ? {
            location: true,
            camera: { select: { ipAddress: true } },
            switchDev: { select: { mgmtIp: true } },
            nvr: { select: { nicPrimary: true } },
            credentials: { take: 1, orderBy: { createdAt: 'desc' } },
          }
        : { location: true },
      orderBy: { assetCode: 'asc' },
    });
    if (!sensitive) return rows;
    // IP y contraseña (descifrada) solo para roles con credential.read
    // (Jefe de Mantenimiento, Supervisor TI, Técnico de Red).
    return rows.map((a: any) => {
      const { credentials, camera, switchDev, nvr, ...rest } = a;
      let password: string | null = null;
      const c = credentials?.[0];
      if (c) { try { password = decryptSecret(c.secretEnc); } catch { password = null; } }
      return {
        ...rest,
        ip: a.ipAddress || camera?.ipAddress || switchDev?.mgmtIp || nvr?.nicPrimary || null,
        password,
        credentialId: c?.id || null,
      };
    });
  }

  /**
   * Detalle de activo. Los datos de RED sensibles (IP, MAC, IP de gestión, NICs del NVR)
   * solo se devuelven si `sensitive` es true (usuario con permiso credential.read:
   * Jefe de Mantenimiento, Supervisor TI, Técnico de Red). Al resto se le ocultan.
   */
  async findOne(id: string, sensitive = false) {
    const asset: any = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        location: true, camera: true, nvr: true, switchDev: true, wireless: true,
        workOrders: {
          orderBy: { createdAt: 'desc' }, take: 8,
          select: { code: true, type: true, status: true, scheduledDate: true, executedDate: true },
        },
      },
    });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');

    if (!sensitive) {
      if (asset.camera) { asset.camera.ipAddress = null; asset.camera.macAddress = null; }
      if (asset.switchDev) { asset.switchDev.mgmtIp = null; }
      if (asset.nvr) { asset.nvr.nicPrimary = null; asset.nvr.nicSecondary = null; }
    }
    return asset;
  }

  update(id: string, dto: UpdateAssetDto) {
    return this.prisma.asset.update({ where: { id }, data: dto });
  }

  /**
   * Edición FIRMADA de activo: re-verifica credenciales del firmante y audita UPDATE_ASSET.
   * Un fallo de firma se audita (FIRMA_FALLIDA) y devuelve 400 (no cierra sesión).
   */
  async updateSigned(id: string, dto: SignedUpdateAssetDto, ip?: string | null) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');
    const signer = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = signer && signer.active
      ? await argon2.verify(signer.passwordHash, dto.password).catch(() => false)
      : false;
    if (!valid) {
      await this.audit.record({
        userId: signer?.id || null, action: 'FIRMA_FALLIDA', entity: 'assets', entityId: id, ip,
        after: { intento: dto.email, motivo: 'contraseña incorrecta', accion: 'editar activo' },
      });
      throw new BadRequestException('Firma inválida: contraseña incorrecta');
    }
    const { email, password, ...data } = dto;
    const updated = await this.prisma.asset.update({ where: { id }, data: data as any });
    await this.audit.record({
      userId: signer!.id, action: 'UPDATE_ASSET', entity: 'assets', entityId: id, ip,
      after: { assetCode: updated.assetCode, firmadoPor: signer!.email },
    });
    return updated;
  }

  /**
   * Actualiza datos de RED sensibles (IP). Solo credential.manage (Jefe y Técnico de Red).
   * Queda auditado — pensado para proyectos de estandarización de red.
   */
  async updateNetwork(id: string, dto: UpdateNetworkDto, ip?: string | null, userId?: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');
    const updated = await this.prisma.asset.update({ where: { id }, data: { ipAddress: dto.ipAddress } });
    await this.audit.record({
      userId: userId || null,
      action: 'UPDATE_NETWORK',
      entity: 'assets',
      entityId: id,
      ip,
      after: { assetCode: asset.assetCode, ipAddress: dto.ipAddress },
    });
    return { id: updated.id, ipAddress: updated.ipAddress };
  }

  remove(id: string) {
    return this.prisma.asset.update({ where: { id }, data: { deletedAt: new Date(), status: 'BAJA' } });
  }
}
