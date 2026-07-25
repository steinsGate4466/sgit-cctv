import {
  Body, Controller, Get, Ip, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AccessService } from './access.service';
import {
  CreateAccessRequestDto, DecideAccessRequestDto, QueryAccessRequestDto, UpdateAccessRequestDto,
} from './dto/access.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('access')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('access-requests')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get()
  @RequirePermissions('access.read')
  findAll(@Query() q: QueryAccessRequestDto) {
    return this.access.findAll(q);
  }

  @Get('summary')
  @RequirePermissions('access.read')
  summary() {
    return this.access.summary();
  }

  // Foto de sustento (previsualización).
  @Get('photos/:photoId/file')
  @RequirePermissions('access.read')
  async photoFile(@Param('photoId') photoId: string, @Res() res: Response) {
    const { buffer, contentType } = await this.access.getPhotoFile(photoId);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  }

  @Get(':id')
  @RequirePermissions('access.read')
  findOne(@Param('id') id: string) {
    return this.access.findOne(id);
  }

  // Documento sustentado en PDF (para presentar la solicitud de manlift).
  @Get(':id/report')
  @RequirePermissions('access.read')
  async report(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.access.buildReport(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // El técnico levanta la solicitud desde campo.
  @Post()
  @RequirePermissions('access.request')
  create(@Body() dto: CreateAccessRequestDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.access.create(dto, user?.userId, ip);
  }

  @Patch(':id')
  @RequirePermissions('access.request')
  update(@Param('id') id: string, @Body() dto: UpdateAccessRequestDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.access.update(id, dto, user?.userId, ip);
  }

  @Post(':id/photos')
  @RequirePermissions('access.request')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  addPhoto(@Param('id') id: string, @UploadedFile() file: any, @Body('caption') caption?: string) {
    return this.access.addPhoto(id, file, caption);
  }

  @Get(':id/photos')
  @RequirePermissions('access.read')
  listPhotos(@Param('id') id: string) {
    return this.access.listPhotos(id);
  }

  // Aprobar / rechazar: SOLO el Jefe de Mantenimiento (access.approve), con firma.
  @Post(':id/decide')
  @RequirePermissions('access.approve')
  decide(@Param('id') id: string, @Body() dto: DecideAccessRequestDto, @Ip() ip: string) {
    return this.access.decide(id, dto, ip);
  }
}
