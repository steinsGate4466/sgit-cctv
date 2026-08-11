import {
  Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CabinetsService } from './cabinets.service';
import { CreateCabinetDto, UpdateCabinetDto } from './dto/cabinet.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AmbitoDe } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('cabinets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cabinets')
export class CabinetsController {
  constructor(private readonly cabinets: CabinetsService) {}

  @Get()
  @RequirePermissions('asset.read')
  list(@Query('tren') tren?: string, @Query('etapa') etapa?: string) {
    return this.cabinets.list({ tren, etapa });
  }

  // Foto del gabinete (previsualización).
  // 'qr/sheet' y 'ficha/:id' van ANTES de ':id': si no, ':id' captura la
  // palabra "qr" y devuelve "gabinete no encontrado". Es la misma disciplina
  // que ya se sigue en Activos y en Usuarios.
  @Get('qr/sheet')
  @RequirePermissions('asset.read')
  async qrSheet(@Query('ids') ids: string, @Res() res: Response) {
    const lista = (ids || '').split(',').map((x) => x.trim()).filter(Boolean);
    const { buffer, filename } = await this.cabinets.qrSheet(lista);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @AmbitoDe('cabinet')
  @Get(':id/qr')
  @RequirePermissions('asset.read')
  async qr(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.cabinets.qrPng(id);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }

  /** Lo que se ve al escanear la etiqueta del gabinete. */
  @AmbitoDe('cabinet')
  @Get(':id/ficha')
  @RequirePermissions('asset.read')
  ficha(@Param('id') id: string) {
    return this.cabinets.fichaRapida(id);
  }

  @AmbitoDe('cabinet')
  @Get(':id/photo')
  @RequirePermissions('asset.read')
  async photo(@Param('id') id: string, @Res() res: Response) {
    const { buffer, contentType } = await this.cabinets.getPhoto(id);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  }

  @AmbitoDe('cabinet')
  @Get(':id')
  @RequirePermissions('asset.read')
  findOne(@Param('id') id: string) {
    return this.cabinets.findOne(id);
  }

  @Post()
  @RequirePermissions('asset.update')
  create(@Body() dto: CreateCabinetDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.cabinets.create(dto, user?.userId, ip);
  }

  @AmbitoDe('cabinet')
  @Patch(':id')
  @RequirePermissions('asset.update')
  update(@Param('id') id: string, @Body() dto: UpdateCabinetDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.cabinets.update(id, dto, user?.userId, ip);
  }

  @AmbitoDe('cabinet')
  @Delete(':id')
  @RequirePermissions('asset.update')
  remove(@Param('id') id: string) {
    return this.cabinets.remove(id);
  }

  @AmbitoDe('cabinet')
  @Post(':id/photo')
  @RequirePermissions('asset.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  uploadPhoto(@Param('id') id: string, @UploadedFile() file: any) {
    return this.cabinets.uploadPhoto(id, file);
  }
}
