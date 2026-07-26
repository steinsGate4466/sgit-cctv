import {
  Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AssetsService } from './assets.service';
import { SignedCreateAssetDto } from './dto/create-asset-signed.dto';
import { SignedUpdateAssetDto } from './dto/update-asset-signed.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { UpdateNetworkDto } from './dto/update-network.dto';
import { QueryAssetDto } from './dto/query-asset.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  // Alta FIRMADA: exige re-autenticación (firma) y queda auditada (CREATE_ASSET).
  @Post()
  @RequirePermissions('asset.create')
  create(@Body() dto: SignedCreateAssetDto, @Ip() ip: string) {
    return this.assets.createSigned(dto, ip);
  }

  @Get()
  @RequirePermissions('asset.read')
  findAll(@Query() q: QueryAssetDto, @CurrentUser() user: any) {
    const sensitive = (user?.permissions || []).includes('credential.read');
    return this.assets.findAll(q, sensitive);
  }

  @Get(':id')
  @RequirePermissions('asset.read')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const sensitive = (user?.permissions || []).includes('credential.read');
    return this.assets.findOne(id, sensitive);
  }

  @Patch(':id')
  @RequirePermissions('asset.update')
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assets.update(id, dto);
  }

  // Edición FIRMADA (completa): solo Jefe, Supervisor TI y Técnico de Red (credential.read).
  @Patch(':id/edit')
  @RequirePermissions('credential.read')
  editSigned(@Param('id') id: string, @Body() dto: SignedUpdateAssetDto, @Ip() ip: string) {
    return this.assets.updateSigned(id, dto, ip);
  }

  // Editar datos de red sensibles (IP): solo Jefe de Mantenimiento y Técnico de Red.
  @Patch(':id/network')
  @RequirePermissions('credential.manage')
  updateNetwork(@Param('id') id: string, @Body() dto: UpdateNetworkDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.assets.updateNetwork(id, dto, ip, user?.userId);
  }

  @Delete(':id')
  @RequirePermissions('asset.delete')
  remove(@Param('id') id: string) {
    return this.assets.remove(id);
  }

  // ---------- Identificación por QR ----------
  // Hoja de etiquetas para imprimir y pegar en los equipos de planta.
  @Get('qr/sheet')
  @RequirePermissions('asset.read')
  async qrSheet(@Res() res: Response, @Query('ids') ids?: string) {
    const list = ids ? ids.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const { buffer, filename } = await this.assets.qrSheet(list);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // QR individual (PNG) del activo.
  @Get(':id/qr')
  @RequirePermissions('asset.read')
  async qr(@Param('id') id: string, @Res() res: Response) {
    const { buffer } = await this.assets.qrPng(id);
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  }

  // ---------- Fotografías del activo ----------
  @Post(':id/photos')
  @RequirePermissions('asset.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  addPhoto(@Param('id') id: string, @UploadedFile() file: any, @Body('kind') kind?: string, @Body('caption') caption?: string) {
    return this.assets.addPhoto(id, file, kind, caption);
  }

  @Get(':id/photos')
  @RequirePermissions('asset.read')
  listPhotos(@Param('id') id: string) {
    return this.assets.listPhotos(id);
  }

  // Informe del equipo (PDF). Disponible para quien pueda ver activos (técnico incluido);
  // el informe NO contiene contraseñas, solo ficha, fotos e historial.
  @Get(':id/report')
  @RequirePermissions('asset.read')
  async report(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.assets.buildReport(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('photos/:photoId/file')
  @RequirePermissions('asset.read')
  async photoFile(@Param('photoId') photoId: string, @Res() res: Response) {
    const { buffer, contentType } = await this.assets.getPhotoFile(photoId);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  }

  @Delete('photos/:photoId')
  @RequirePermissions('asset.update')
  removePhoto(@Param('photoId') photoId: string) {
    return this.assets.removePhoto(photoId);
  }
}
