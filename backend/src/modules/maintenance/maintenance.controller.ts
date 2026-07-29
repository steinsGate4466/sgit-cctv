import {
  Body, Controller, Get, Ip, Param, Patch, Post, Query,
  Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MaintenanceService } from './maintenance.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { QueryWorkOrderDto } from './dto/query-work-order.dto';
import { CloseWorkOrderDto } from './dto/close-work-order.dto';
import { OpenWorkOrderDto } from './dto/open-work-order.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('maintenance')
@ApiBearerAuth()
@Controller('work-orders')
export class MaintenanceController {
  constructor(private readonly wo: MaintenanceService) {}

  // Generar OM: SOLO Jefe de Mantenimiento (permiso wo.create).
  @Post()
  @RequirePermissions('wo.create')
  create(@Body() dto: CreateWorkOrderDto) {
    return this.wo.create(dto);
  }

  @Get()
  @RequirePermissions('wo.read')
  findAll(@Query() q: QueryWorkOrderDto) {
    return this.wo.findAll(q);
  }

  // Descargar imagen de evidencia (para previsualización).
  @Get('evidence/:evidenceId/file')
  @RequirePermissions('wo.read')
  async evidenceFile(@Param('evidenceId') evidenceId: string, @Res() res: Response) {
    const { buffer, contentType } = await this.wo.getEvidenceFile(evidenceId);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  }

  @Get(':id')
  @RequirePermissions('wo.read')
  findOne(@Param('id') id: string) {
    return this.wo.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('wo.update')
  update(@Param('id') id: string, @Body() dto: UpdateWorkOrderDto) {
    return this.wo.update(id, dto);
  }

  /**
   * APERTURA en campo — firmada.
   *
   * Permiso wo.update (no wo.approve): el que abre y ejecuta es el técnico,
   * no el Jefe. El cierre sí queda reservado al Jefe.
   */
  @Post(':id/open')
  @RequirePermissions('wo.update')
  open(@Param('id') id: string, @Body() dto: OpenWorkOrderDto, @Ip() ip: string) {
    return this.wo.openSigned(id, dto, ip);
  }

  // Cierre firmado: SOLO Jefe de Mantenimiento (permiso wo.approve).
  @Post(':id/close')
  @RequirePermissions('wo.approve')
  close(@Param('id') id: string, @Body() dto: CloseWorkOrderDto, @Ip() ip: string) {
    return this.wo.closeSigned(id, dto, ip);
  }

  // Subir fotografía de la intervención (el técnico documenta el trabajo).
  @Post(':id/evidence')
  @RequirePermissions('wo.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  addEvidence(@Param('id') id: string, @UploadedFile() file: any, @Body('caption') caption?: string) {
    return this.wo.addEvidence(id, file, caption);
  }

  // Listar evidencias (metadatos) de una OM.
  @Get(':id/evidence')
  @RequirePermissions('wo.read')
  listEvidence(@Param('id') id: string) {
    return this.wo.listEvidence(id);
  }

  // Informe PDF de la OM bajo demanda (con las fotos incrustadas).
  @Get(':id/report')
  @RequirePermissions('wo.read')
  async report(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.wo.buildReport(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
