import { Body, Controller, Get, Ip, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from '../documents/documents.service';
import { DocumentoDelTrabajoDto } from '../documents/dto/documento-del-trabajo.dto';
import { MAX_BYTES_DOC } from '../documents/archivos-documento';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InstalacionService } from './instalacion.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequireAlguno, RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AmbitoDe, SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CrearInstalacionDto, DecidirInstalacionDto, EvaluarInstalacionDto, InstaladaDto, SolicitarInstalacionDto,
} from './dto/instalacion.dto';

@ApiTags('instalaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instalaciones')
export class InstalacionController {
  constructor(
    private readonly inst: InstalacionService,
    // Bloque 155: el expediente de la instalación usa el mismo almacén de documentos.
    private readonly docs: DocumentsService,
  ) {}

  // Literales antes que :id.
  @Get('perfiles')
  @RequirePermissions('asset.read')
  perfiles() {
    return this.inst.perfiles();
  }

  /* Bloque 137 · la puerta de Producción: pedir y ver LO SUYO.
     `om.mirar` es la llave de Producción; `asset.read` la de quien ya usa la
     pantalla completa. El tren se comprueba dentro, con la ubicación. */
  @SinAmbito()
  @Post('solicitud')
  @RequireAlguno('asset.read', 'om.mirar')
  solicitar(@Body() dto: SolicitarInstalacionDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.inst.solicitar(dto, u?.userId ?? null, ip);
  }

  @SinAmbito()
  @Get('mias')
  @RequireAlguno('asset.read', 'om.mirar')
  mias(@CurrentUser() u: any) {
    return this.inst.mias(u?.userId ?? null);
  }

  @Get('resumen')
  @RequirePermissions('asset.read')
  resumen() {
    return this.inst.resumen();
  }

  @Get()
  @RequirePermissions('asset.read')
  listar(@Query() q: any) {
    return this.inst.listar(q || {});
  }

  @AmbitoDe('instalacion')
  @Get(':id')
  @RequirePermissions('asset.read')
  detalle(@Param('id') id: string) {
    return this.inst.detalle(id);
  }

  /** Pedir. Con `asset.read` basta: quien ve la infraestructura puede pedir una cámara. */
  @Post()
  @RequirePermissions('asset.read')
  crear(@Body() dto: CrearInstalacionDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.inst.crear(dto, u?.userId, ip);
  }

  /* ===========================================================================
     BLOQUE 155 · EL EXPEDIENTE DE LA INSTALACIÓN
     Planos, actas y protocolos de ESTA instalación, guardados en ella. Lo lee
     quien ve la infraestructura; lo sube quien trabaja en ella (el mismo
     permiso que guarda la visita). El documento es el mismo de «Documentos»:
     misma revisión del archivo, mismo versionado, misma auditoría.
     =========================================================================== */
  @AmbitoDe('instalacion')
  @Get(':id/documentos')
  @RequirePermissions('asset.read')
  documentos(@Param('id') id: string) {
    return this.docs.lista({ instalacionId: id });
  }

  @AmbitoDe('instalacion')
  @Post(':id/documentos')
  @RequirePermissions('asset.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES_DOC } }))
  subirDocumento(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body() dto: DocumentoDelTrabajoDto,
    @CurrentUser() u: any,
    @Ip() ip: string,
  ) {
    return this.docs.subir(file, { ...dto, instalacionId: id }, u?.userId, ip);
  }

  /** Guardar la visita. Lo hace quien va al sitio. */
  @AmbitoDe('instalacion')
  @Patch(':id/evaluar')
  @RequirePermissions('asset.update')
  evaluar(@Param('id') id: string, @Body() dto: EvaluarInstalacionDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.inst.evaluar(id, dto, u?.userId, ip);
  }

  /** Aprobar o rechazar: del Jefe, como el cierre de OM. */
  @AmbitoDe('instalacion')
  @Patch(':id/decidir')
  @RequirePermissions('wo.approve')
  decidir(@Param('id') id: string, @Body() dto: DecidirInstalacionDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.inst.decidir(id, dto, u?.userId, ip);
  }

  @AmbitoDe('instalacion')
  @Post(':id/orden')
  @RequirePermissions('wo.create')
  generarOrden(@Param('id') id: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.inst.generarOrden(id, u?.userId, ip);
  }

  /** Cerrar el ciclo: nace el activo. Exige poder crear activos. */
  @AmbitoDe('instalacion')
  @Post(':id/instalada')
  @RequirePermissions('asset.create')
  instalada(@Param('id') id: string, @Body() dto: InstaladaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.inst.marcarInstalada(id, dto, u?.userId, ip);
  }

  @AmbitoDe('instalacion')
  @Patch(':id/cancelar')
  @RequirePermissions('asset.update')
  cancelar(@Param('id') id: string, @Body() dto: DecidirInstalacionDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.inst.cancelar(id, dto.motivo || '', u?.userId, ip);
  }
}
