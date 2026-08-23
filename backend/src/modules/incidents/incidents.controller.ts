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
import { AmbitoDe } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

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

  /**
   * ===========================================================================
   *  REPORTAR UNA CÁMARA CAÍDA — bloque 51-B. La puerta de Producción.
   * ===========================================================================
   *  TRES campos y ya: qué cámara (va en la ruta), la zona si la sabe, y una
   *  foto del púlpito si puede. Ningún campo técnico.
   *
   *  POR QUÉ EL ACTIVO VA EN LA RUTA Y NO EN EL CUERPO
   *  Para que el guard de ámbito lo vea. El guard lee los parámetros de RUTA;
   *  si el identificador viajara en el cuerpo, el guard no comprobaría nada y
   *  el Jefe de Producción del Tren 2 podría reportar activos del Tren 1
   *  copiando un identificador. Fallar abriendo, en silencio.
   *
   *  Va con `incident.create` y nada más. Producción NO necesita —ni debe
   *  tener— permisos de mantenimiento para avisar de que no ve.
   */
  @AmbitoDe('asset', 'assetId')
  @Post('reporte/:assetId')
  @RequirePermissions('incident.create')
  @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: 12 * 1024 * 1024 } }))
  reportar(
    @Param('assetId') assetId: string,
    @CurrentUser() user: any,
    @UploadedFile() foto?: any,
    @Body('zona') zona?: string,
  ) {
    return this.incidents.reportarDesdeProduccion(assetId, user?.userId, zona, foto);
  }

  @Get()
  @RequirePermissions('incident.read')
  findAll(@Query() q: QueryIncidentDto) {
    return this.incidents.findAll(q);
  }

  // Descargar imagen de evidencia (previsualización).
  @AmbitoDe('incident', 'evidenceId')
  @Get('evidence/:evidenceId/file')
  @RequirePermissions('incident.read')
  async evidenceFile(@Param('evidenceId') evidenceId: string, @Res() res: Response) {
    const { buffer, contentType } = await this.incidents.getEvidenceFile(evidenceId);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  }

  @AmbitoDe('incident')
  @Get(':id')
  @RequirePermissions('incident.read')
  findOne(@Param('id') id: string) {
    return this.incidents.findOne(id);
  }

  @AmbitoDe('incident')
  @Patch(':id')
  @RequirePermissions('incident.update')
  update(@Param('id') id: string, @Body() dto: UpdateIncidentDto) {
    return this.incidents.update(id, dto);
  }

  // Resolver/cerrar con firma. SOLO el Jefe de Mantenimiento (incident.close).
  // El técnico registra y avanza estados, pero el cierre lo firma el Jefe.
  @AmbitoDe('incident')
  @Post(':id/resolve')
  @RequirePermissions('incident.close')
  resolve(@Param('id') id: string, @Body() dto: ResolveIncidentDto, @Ip() ip: string) {
    return this.incidents.resolveSigned(id, dto, ip);
  }

  // Subir fotografía de campo.
  @AmbitoDe('incident')
  @Post(':id/evidence')
  @RequirePermissions('incident.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  addEvidence(@Param('id') id: string, @UploadedFile() file: any, @Body('caption') caption?: string) {
    return this.incidents.addEvidence(id, file, caption);
  }

  @AmbitoDe('incident')
  @Get(':id/evidence')
  @RequirePermissions('incident.read')
  listEvidence(@Param('id') id: string) {
    return this.incidents.listEvidence(id);
  }

  // Informe PDF de la incidencia (con fotos).
  @AmbitoDe('incident')
  @Get(':id/report')
  @RequirePermissions('incident.read')
  async report(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.incidents.buildReport(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
