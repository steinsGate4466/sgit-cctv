import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { encryptSecret, decryptSecret } from '../../common/crypto/crypto.util';

// Proyección segura: nunca expone secretEnc.
const safeSelect = { id: true, assetId: true, username: true, type: true, createdAt: true };

@Injectable()
export class CredentialsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // Crea una credencial cifrando el secreto (AES-256-GCM).
  async create(dto: CreateCredentialDto) {
    const asset = await this.prisma.asset.findUnique({ where: { id: dto.assetId } });
    if (!asset) throw new NotFoundException('Activo no encontrado');
    return this.prisma.credential.create({
      data: {
        assetId: dto.assetId,
        username: dto.username,
        type: dto.type,
        secretEnc: encryptSecret(dto.secret),
      },
      select: safeSelect,
    });
  }

  // Lista credenciales de un activo SIN el secreto.
  findByAsset(assetId: string) {
    return this.prisma.credential.findMany({ where: { assetId }, select: safeSelect });
  }

  // Revela el secreto descifrado. Cada revelación se AUDITA (acción REVEAL).
  async reveal(id: string, userId?: string | null, ip?: string | null) {
    const cred = await this.prisma.credential.findUnique({ where: { id } });
    if (!cred) throw new NotFoundException('Credencial no encontrada');
    await this.audit.record({
      userId: userId ?? null,
      action: 'REVEAL',
      entity: 'credentials',
      entityId: id,
      ip: ip ?? null,
    });
    return {
      id: cred.id,
      assetId: cred.assetId,
      username: cred.username,
      type: cred.type,
      secret: decryptSecret(cred.secretEnc),
    };
  }

  async remove(id: string) {
    const cred = await this.prisma.credential.findUnique({ where: { id } });
    if (!cred) throw new NotFoundException('Credencial no encontrada');
    await this.prisma.credential.delete({ where: { id } });
    return { deleted: true, id };
  }
}
