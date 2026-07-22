import {
  Body, Controller, Get, Ip, Param, Patch, Post, Query,
  Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { QueryIncidentDto } from './dto/query-incident.dto';
import { ResolveIncidentDto } from './dto/resolve-incident.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('incidents')
@ApiBearerAuth()
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post()
  @RequirePermissions('incident.create')
  create(@Body() dto: CreateIncidentDto) {
    return this.incidents.create(dto);
  }

  @Get()
  @RequirePermissions('incident.read')
  findAll(@Query() q: QueryIncidentDto) {
    return this.incidents.findAll(q);
  }

  // Descargar imagen de evidencia (previsualización).
  @Get('evidence/:evidenceId/file')
  @RequirePermissions('incident.read')
  async evidenceFile(@Param('evidenceId') evidenceId: string, @Res() res: Response) {
    const { buffer, contentType } = await this.incidents.getEvidenceFile(evidenceId);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  }

  @Get(':id')
  @RequirePermissions('incident.read')
  findOne(@Param('id') id: string) {
    return this.incidents.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('incident.update')
  update(@Param('id') id: string, @Body() dto: UpdateIncidentDto) {
    return this.incidents.update(id, dto);
  }

  // Resolver con firma + retroalimentación (correo + contraseña del que cierra).
  @Post(':id/resolve')
  @RequirePermissions('incident.update')
  resolve(@Param('id') id: string, @Body() dto: ResolveIncidentDto, @Ip() ip: string) {
    return this.incidents.resolveSigned(id, dto, ip);
  }

  // Subir fotografía de campo.
  @Post(':id/evidence')
  @RequirePermissions('incident.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  addEvidence(@Param('id') id: string, @UploadedFile() file: any, @Body('caption') caption?: string) {
    return this.incidents.addEvidence(id, file, caption);
  }

  @Get(':id/evidence')
  @RequirePermissions('incident.read')
  listEvidence(@Param('id') id: string) {
    return this.incidents.listEvidence(id);
  }

  // Informe PDF de la incidencia (con fotos).
  @Get(':id/report')
  @RequirePermissions('incident.read')
  async report(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.incidents.buildReport(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
