import {
  Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { disposicion } from '../../common/descarga';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequireAlguno, RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MAX_BYTES_DOC } from '../documents/archivos-documento';
import { ModelosService } from './modelos.service';
import { CrearModeloDto, DatosFichaDto, EditarFichaDto, EditarModeloDto, LeerFichaDto } from './dto/modelos.dto';

/* =============================================================================
   CATÁLOGO DE MODELOS Y FICHAS TÉCNICAS — bloque 184
   QUIÉN PUEDE QUÉ, por capacidad:
     MIRAR      asset.read     — el catálogo es inventario técnico
     DECLARAR   asset.update   — el técnico, con el PDF del fabricante
     VERIFICAR  wo.approve     — otra persona, con el PDF delante
   Ninguna ruta lleva ámbito de tren: un modelo y su ficha son de la planta
   entera (la misma cámara existe en los tres trenes).
============================================================================= */
@ApiTags('modelos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('modelos')
export class ModelosController {
  constructor(private readonly svc: ModelosService) {}

  @Get()
  @RequirePermissions('asset.read')
  lista(@Query('tipo') tipo?: string, @Query('q') q?: string) {
    return this.svc.lista(tipo, q);
  }

  // Las rutas LITERALES van antes que las que llevan :id (bloque 3).
  @Get('pendientes')
  @RequirePermissions('asset.read')
  pendientes() { return this.svc.pendientes(); }

  /** Para el desplegable de la ficha de una cámara: lo usa quien la edita. */
  @Get('fichas')
  @RequireAlguno('asset.read', 'asset.update')
  fichas() { return this.svc.fichasParaElegir(); }

  /** El asistente: propone valores a partir del texto de la ficha. No guarda nada. */
  @Post('leer-ficha')
  @RequirePermissions('asset.update')
  leer(@Body() dto: LeerFichaDto) { return this.svc.leerFicha(dto.texto); }

  /**
   * Las MISMAS comprobaciones que al guardar, sin guardar: el formulario avisa
   * del error de dedo mientras se escribe, no después de subir el PDF. Una
   * sola regla en un solo sitio (`vision.ts`): si el formulario tuviera la
   * suya, un día dejaría pasar lo que el servidor rechaza.
   */
  @Post('revisar-ficha')
  @RequirePermissions('asset.update')
  revisar(@Body() dto: DatosFichaDto) { return this.svc.revisarFicha(dto); }

  @Post()
  @RequirePermissions('asset.update')
  crear(@Body() dto: CrearModeloDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.svc.crearModelo(dto, u?.userId ?? null, ip);
  }

  @SinAmbito()  // la ficha es del modelo, no de un tren
  @Get('fichas/:id/pdf')
  @RequirePermissions('asset.read')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, nombre } = await this.svc.pdfDeFicha(id);
    res.set({
      // Como descarga y con tipo genérico, igual que Documentos: aunque el
      // archivo trajera algo raro, el navegador no lo ejecuta en este dominio.
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': disposicion(nombre),
      'Content-Length': String(buffer.length),
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(buffer);
  }

  @SinAmbito()  // la ficha es del modelo, no de un tren
  @Patch('fichas/:id')
  @RequirePermissions('asset.update')
  editarFicha(@Param('id') id: string, @Body() dto: EditarFichaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.svc.editarFicha(id, dto, u?.userId ?? null, ip);
  }

  @SinAmbito()  // la ficha es del modelo, no de un tren
  @Post('fichas/:id/verificar')
  @RequirePermissions('wo.approve')
  verificarFicha(@Param('id') id: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.svc.verificarFicha(id, u?.userId ?? null, ip);
  }

  @SinAmbito()  // la ficha es del modelo, no de un tren
  @Delete('fichas/:id')
  @RequirePermissions('asset.update')
  borrarFicha(@Param('id') id: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.svc.borrarFicha(id, u?.userId ?? null, u?.permissions ?? [], ip);
  }

  @SinAmbito()  // el modelo es de la planta entera
  @Patch(':id')
  @RequirePermissions('asset.update')
  editar(@Param('id') id: string, @Body() dto: EditarModeloDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.svc.editarModelo(id, dto, u?.userId ?? null, ip);
  }

  @SinAmbito()  // el modelo es de la planta entera
  @Post(':id/verificar')
  @RequirePermissions('wo.approve')
  verificar(@Param('id') id: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.svc.verificarModelo(id, u?.userId ?? null, ip);
  }

  /** Nueva ficha óptica: los números + el PDF del fabricante, obligatorio. */
  @SinAmbito()  // el modelo es de la planta entera
  @Post(':id/fichas')
  @RequirePermissions('asset.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES_DOC } }))
  crearFicha(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body() dto: DatosFichaDto,
    @CurrentUser() u: any,
    @Ip() ip: string,
  ) {
    return this.svc.crearFicha(id, file, dto, u?.userId ?? null, ip);
  }
}
