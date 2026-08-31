import {
  Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AssetsService } from './assets.service';
import { HistoryService } from './history.service';
import { SignedCreateAssetDto } from './dto/create-asset-signed.dto';
import { SignedUpdateAssetDto } from './dto/update-asset-signed.dto';
import { UpdateAssetStatusDto } from './dto/update-asset-status.dto';
import { UpdateNetworkDto } from './dto/update-network.dto';
import { QueryAssetDto } from './dto/query-asset.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequireAlguno, RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AmbitoDe } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('assets')
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly history: HistoryService,
  ) {}

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

  /**
   * Lista ligera para desplegables. DEBE declararse ANTES de @Get(':id'):
   * NestJS resuelve por orden y ':id' capturaría la palabra "options".
   */
  /**
   * Avance del mapeo: cuánto se ha levantado y qué falta, ordenado por
   * criticidad. Va ANTES de @Get(':id') para que ':id' no capture la palabra.
   */
  /**
   * Activos con reincidencia detectada. Va ANTES de @Get(':id').
   *
   * PARA QUÉ: que la señal aparezca sola en el tablero. Si hay que buscarla
   * activo por activo, nadie la mira y el problema sigue invisible.
   */
  @Get('reincidentes')
  @RequirePermissions('asset.read')
  reincidentes() {
    return this.history.reincidentes();
  }

  @Get('avance-mapeo')
  @RequirePermissions('asset.read')
  avanceMapeo(@Query('tren') tren?: string, @Query('etapa') etapa?: string) {
    return this.assets.avanceMapeo({ tren, etapa });
  }

  /* DESPLEGABLE DE EQUIPOS — «cualquiera de», no `asset.read`. Bloque 66.
     -------------------------------------------------------------------------
     Lo llaman SEIS pantallas con seis permisos distintos: Cableado
     (`infra.read`), Accesibilidad (`access.read`), Incidencias
     (`incident.read`), Mantenimiento y Preventivo (`wo.read`) e Inventario
     (`inventory.read`).

     Con `asset.read` a secas, quien podía crear una incidencia abría el
     formulario y el desplegable salía VACÍO: no podía elegir el equipo.
     Repartir `asset.read` para arreglarlo habría abierto el módulo de Activos
     entero — el mismo error que dejó a Producción con el plano eléctrico.

     Devuelve código, tipo, estado y ubicación. Ni IP ni credenciales: eso va
     en `findOne` y exige `credential.read`. */
  @Get('options')
  @RequireAlguno(
    'asset.read', 'activos.mirar', 'wo.read', 'wo.update',
    'incident.read', 'incident.create', 'inventory.read',
    'infra.read', 'access.read',
  )
  options() {
    return this.assets.options();
  }

  /* EL QR TIENE QUE ABRIRSE PARA QUIEN ESTÁ EN LA LÍNEA — bloque 68.
     -------------------------------------------------------------------------
     ESTO ESTABA ROTO Y NO LO VIO NADIE, porque no rompe nada: devuelve 403 y
     la pantalla sale vacía.

     `asset.read` es la llave del MÓDULO de activos entero: el inventario de
     los tres trenes, la ficha completa, la exportación. Exigirla aquí dejaba
     fuera a las tres personas que más escanean:

        · Operador de Púlpito  → su ÚNICA función es avisar de una cámara, y
                                 el botón de avisar vive dentro de esta
                                 pantalla. Sin esto, el bloque 51-B entero
                                 estaba muerto para él.
        · Jefe de Tren
        · Jefe de línea        → los dos cargos que están en la línea cuando
                                 algo se cae.

     Los tres tienen `activos.mirar`, que YA les devuelve los equipos de su
     tren en una lista. Poder abrir la ficha de UNO de esos equipos no les da
     nada nuevo: es el mismo dato, de uno en uno.

     Y las dos puertas que de verdad protegen siguen puestas:
       · `@AmbitoDe('asset')` → sólo los equipos de SU tren, 404 si no.
       · `credential.read`    → las contraseñas del equipo se filtran aparte,
                                dentro del servicio. Sin ese permiso no viajan.

     Es el mismo arreglo del bloque 66: una lectura de apoyo llevaba el
     permiso del módulo al que pertenece, y no el que necesita quien la usa. */
  @AmbitoDe('asset')
  @Get(':id')
  @RequireAlguno('asset.read', 'activos.mirar')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const sensitive = (user?.permissions || []).includes('credential.read');
    return this.assets.findOne(id, sensitive);
  }

  /**
   * Cambio de ESTADO — la única edición sin firma.
   *
   * Antes esta ruta era PATCH /assets/:id y aceptaba el activo COMPLETO con
   * solo asset.update: permitía cambiar IP, código o ubicación sin firma,
   * rodeando la protección de PATCH /assets/:id/edit. Ahora es una ruta
   * explícita que solo admite el estado.
   */
  @AmbitoDe('asset')
  @Patch(':id/status')
  @RequirePermissions('asset.update')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAssetStatusDto,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.assets.updateStatus(id, dto, user?.userId, ip);
  }

  // Edición FIRMADA (completa): solo Jefe, Supervisor TI y Técnico de Red (credential.read).
  @AmbitoDe('asset')
  @Patch(':id/edit')
  @RequirePermissions('credential.read')
  editSigned(@Param('id') id: string, @Body() dto: SignedUpdateAssetDto, @Ip() ip: string) {
    return this.assets.updateSigned(id, dto, ip);
  }

  // Editar datos de red sensibles (IP): solo Jefe de Mantenimiento y Técnico de Red.
  @AmbitoDe('asset')
  @Patch(':id/network')
  @RequirePermissions('credential.manage')
  updateNetwork(@Param('id') id: string, @Body() dto: UpdateNetworkDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.assets.updateNetwork(id, dto, ip, user?.userId);
  }

  // Baja de activo (lógica y auditada). Solo Jefe de Mantenimiento (asset.delete).
  @AmbitoDe('asset')
  @Delete(':id')
  @RequirePermissions('asset.delete')
  remove(@Param('id') id: string, @CurrentUser() user: any, @Ip() ip: string) {
    return this.assets.remove(id, user?.userId, ip);
  }

  // ---------- Identificación por QR ----------
  // Hoja de etiquetas para imprimir y pegar en los equipos de planta.
  /* LAS DOS PUERTAS DEL QR VAN CON LOS DOS PERMISOS (bloque 77).
     -------------------------------------------------------------------------
     Cerrado sólo con `asset.read`, un Jefe de Tren NO PODÍA IMPRIMIR LA
     ETIQUETA DE SU PROPIO EQUIPO. Es el agujero del bloque 68 a medio cerrar:
     allí se abrió la FICHA con `@RequireAlguno` y se dejó fuera la etiqueta,
     que es lo que hay que pegar en el aparato para que la ficha se pueda
     escanear. Una sin la otra no sirve de nada.

     Quien tiene `activos.mirar` ya recibe los equipos de su tren en lista:
     imprimir su rótulo no le da ningún dato nuevo. Y `@AmbitoDe('asset')`
     sigue limitando a su tren. */
  @Get('qr/sheet')
  @RequireAlguno('asset.read', 'activos.mirar')
  async qrSheet(@Res() res: Response, @Query('ids') ids?: string) {
    const list = ids ? ids.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const { buffer, filename } = await this.assets.qrSheet(list);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // QR individual (PNG) del activo.
  @AmbitoDe('asset')
  @Get(':id/qr')
  @RequireAlguno('asset.read', 'activos.mirar')
  async qr(@Param('id') id: string, @Res() res: Response) {
    const { buffer } = await this.assets.qrPng(id);
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  }

  // ---------- Fotografías del activo ----------
  @AmbitoDe('asset')
  @Post(':id/photos')
  @RequirePermissions('asset.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  addPhoto(@Param('id') id: string, @UploadedFile() file: any, @Body('kind') kind?: string, @Body('caption') caption?: string) {
    return this.assets.addPhoto(id, file, kind, caption);
  }

  @AmbitoDe('asset')
  @Get(':id/photos')
  @RequirePermissions('asset.read')
  listPhotos(@Param('id') id: string) {
    return this.assets.listPhotos(id);
  }

  // Informe del equipo (PDF). Disponible para quien pueda ver activos (técnico incluido);
  // el informe NO contiene contraseñas, solo ficha, fotos e historial.
  /**
   * HISTORIAL del activo: órdenes con sus causas, incidencias, tramos de cable,
   * accesos en altura, infraestructura compartida y señales de reincidencia.
   *
   * Es la retroalimentación que faltaba: hasta ahora todo esto se guardaba y
   * nadie lo volvía a mirar antes de intervenir.
   */
  @AmbitoDe('asset')
  @Get(':id/historial')
  @RequirePermissions('asset.read')
  historial(@Param('id') id: string) {
    return this.history.delActivo(id);
  }

  @AmbitoDe('asset')
  @Get(':id/report')
  @RequirePermissions('asset.read')
  async report(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.assets.buildReport(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @AmbitoDe('asset', 'photoId')
  @Get('photos/:photoId/file')
  @RequirePermissions('asset.read')
  async photoFile(@Param('photoId') photoId: string, @Res() res: Response) {
    const { buffer, contentType } = await this.assets.getPhotoFile(photoId);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  }

  @AmbitoDe('asset', 'photoId')
  @Delete('photos/:photoId')
  @RequirePermissions('asset.update')
  removePhoto(@Param('photoId') photoId: string) {
    return this.assets.removePhoto(photoId);
  }
}
