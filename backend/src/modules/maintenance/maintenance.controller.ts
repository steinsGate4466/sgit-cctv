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
import { ProgressWorkOrderDto } from './dto/progress-work-order.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AmbitoDe } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

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
  findAll(@Query() q: QueryWorkOrderDto, @CurrentUser() user: any) {
    return this.wo.findAll(q, user?.userId);
  }

  // Descargar imagen de evidencia (para previsualización).
  // ---- Asignar y detallar (4A) ----

  /**
   * ASIGNAR. Cuatro campos y fuera.
   * Pide 'wo.create' como el alta de siempre: es el mismo acto, más corto.
   */
  @Post('asignar')
  @RequirePermissions('wo.create')
  asignar(@Body() body: any, @CurrentUser() user: any, @Ip() ip: string) {
    return this.wo.asignar(body, user?.userId, ip);
  }

  /** Convertir una incidencia en orden, con lo que la incidencia ya sabe. */
  @AmbitoDe('workOrder', 'incidentId')
  @Post('desde-incidencia/:incidentId')
  @RequirePermissions('wo.create')
  desdeIncidencia(
    @Param('incidentId') incidentId: string,
    @Body() body: any,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.wo.desdeIncidencia(incidentId, body, user?.userId, ip);
  }

  /**
   * DETALLAR. Lo hace el técnico de red, que es quien tiene el contexto.
   * Pide 'wo.update' y no 'wo.create': no está creando trabajo, lo está
   * completando.
   */
  @AmbitoDe('workOrder')
  @Patch(':id/detallar')
  @RequirePermissions('wo.update')
  detallar(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any, @Ip() ip: string) {
    return this.wo.detallar(id, body, user?.userId, ip);
  }

  /** Cuánto suele tardar este trabajo en este equipo, según lo ya ejecutado. */
  @AmbitoDe('workOrder')
  @Get(':id/duracion-tipica')
  @RequirePermissions('wo.read')
  async duracionTipica(@Param('id') id: string) {
    const wo = await this.wo.findOne(id);
    return this.wo.duracionTipica(wo.assetId, wo.type);
  }

  @AmbitoDe('workOrder', 'evidenceId')
  @Get('evidence/:evidenceId/file')
  @RequirePermissions('wo.read')
  async evidenceFile(@Param('evidenceId') evidenceId: string, @Res() res: Response) {
    const { buffer, contentType } = await this.wo.getEvidenceFile(evidenceId);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  }

  @AmbitoDe('workOrder')
  @Get(':id')
  @RequirePermissions('wo.read')
  findOne(@Param('id') id: string) {
    return this.wo.findOne(id);
  }

  @AmbitoDe('workOrder')
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
  @AmbitoDe('workOrder')
  @Post(':id/open')
  @RequirePermissions('wo.update')
  open(@Param('id') id: string, @Body() dto: OpenWorkOrderDto, @Ip() ip: string) {
    return this.wo.openSigned(id, dto, ip);
  }

  /**
   * Reporte de AVANCE. No cierra la orden: la deja en proceso con el
   * porcentaje y el motivo. Sin firma —es un parte, no una decisión—.
   */
  @AmbitoDe('workOrder')
  @Post(':id/progress')
  @RequirePermissions('wo.update')
  progress(
    @Param('id') id: string,
    @Body() dto: ProgressWorkOrderDto,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.wo.addProgress(id, dto, user?.userId, ip);
  }

  /** Historial de avance, para que el Jefe vea la secuencia completa. */
  @AmbitoDe('workOrder')
  @Get(':id/progress')
  @RequirePermissions('wo.read')
  progressList(@Param('id') id: string) {
    return this.wo.listProgress(id);
  }

  // Cierre firmado: SOLO Jefe de Mantenimiento (permiso wo.approve).
  @AmbitoDe('workOrder')
  @Post(':id/close')
  @RequirePermissions('wo.approve')
  close(@Param('id') id: string, @Body() dto: CloseWorkOrderDto, @Ip() ip: string) {
    return this.wo.closeSigned(id, dto, ip);
  }

  // Subir fotografía de la intervención (el técnico documenta el trabajo).
  @AmbitoDe('workOrder')
  @Post(':id/evidence')
  @RequirePermissions('wo.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  addEvidence(@Param('id') id: string, @UploadedFile() file: any, @Body('caption') caption?: string) {
    return this.wo.addEvidence(id, file, caption);
  }

  // Listar evidencias (metadatos) de una OM.
  @AmbitoDe('workOrder')
  @Get(':id/evidence')
  @RequirePermissions('wo.read')
  listEvidence(@Param('id') id: string) {
    return this.wo.listEvidence(id);
  }

  /* Informe PDF de la OM bajo demanda (con las fotos incrustadas).

     Exige `wo.report`, NO `wo.read`. El permiso existía, estaba descrito en la
     pantalla de Roles y concedido a todo el mundo… y no lo pedía nadie: se
     podía desmarcar en un rol y la persona seguía descargando los PDF con las
     firmas y las fotos dentro. Lo encontró `verificar-roles.js`.

     Se puede cambiar sin dejar a nadie fuera porque la migración concedió
     `wo.report` exactamente a quien ya tenía `wo.read`. */
  @AmbitoDe('workOrder')
  @Get(':id/report')
  @RequirePermissions('wo.report')
  async report(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.wo.buildReport(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
