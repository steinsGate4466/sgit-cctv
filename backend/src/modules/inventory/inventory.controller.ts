import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateSpareDto } from './dto/create-spare.dto';
import { UpdateSpareDto } from './dto/update-spare.dto';
import { QuerySpareDto } from './dto/query-spare.dto';
import { MovementDto } from './dto/movement.dto';
import { CheckDto } from './dto/check.dto';
import { LinkAssetDto } from './dto/link-asset.dto';
import { RequireAlguno, RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inv: InventoryService) {}

  // Panel de inventario (campo vs repuestos, faltantes, sin comprobar).
  // ==========================================================================
  //  IMPORTACIÓN DEL CATÁLOGO DESDE SAP  (formato CSV)
  //
  //  Se acepta CSV y no .xlsx a propósito: leer Excel exige una librería, y las
  //  de Excel han acumulado vulnerabilidades. En Excel "Guardar como CSV" es un
  //  clic; a cambio, cero dependencias nuevas en el servidor.
  //
  //  Las rutas van ANTES de @Get(':id') para que ':id' no capture la palabra.
  // ==========================================================================

  /** Muestra QUÉ HARÍA la importación, sin escribir nada. */
  @Post('catalogo/previsualizar')
  @RequirePermissions('inventory.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  previsualizarCatalogo(@UploadedFile() file: any) {
    return this.inv.previsualizarCatalogo(file?.buffer?.toString('utf8') || '');
  }

  /** Aplica la importación. El código SAP es la identidad del repuesto. */
  @Post('catalogo/importar')
  @RequirePermissions('inventory.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  importarCatalogo(@UploadedFile() file: any, @CurrentUser() user: any) {
    return this.inv.importarCatalogo(file?.buffer?.toString('utf8') || '', user?.userId);
  }

  // ---- Vía EXCEL (3G) ----
  //
  //  El .xlsx lo lee el NAVEGADOR y aquí llega la rejilla ya tipada. Dos
  //  motivos, los dos importantes:
  //
  //  1. SEGURIDAD. Las librerías de Excel han acumulado vulnerabilidades. En
  //     el navegador, un archivo preparado solo afecta a la pestaña de quien
  //     lo abrió; en el servidor afectaría a la planta entera. El servidor no
  //     ve un archivo de Excel en ningún momento.
  //  2. PRECISIÓN. Un CSV es texto y hay que adivinar si "0.125" son 125 o
  //     0,125. Una celda de hoja de cálculo YA es un número. No se adivina.

  @Post('catalogo/previsualizar-grilla')
  @RequirePermissions('inventory.manage')
  previsualizarGrilla(@Body() body: { encabezados?: any[]; filas?: any[][] }) {
    return this.inv.previsualizarGrilla(body?.encabezados || [], body?.filas || []);
  }

  @Post('catalogo/importar-grilla')
  @RequirePermissions('inventory.manage')
  importarGrilla(@Body() body: { encabezados?: any[]; filas?: any[][] }, @CurrentUser() user: any) {
    return this.inv.importarGrilla(body?.encabezados || [], body?.filas || [], user?.userId);
  }

  /** ¿Alcanza el almacén para una campaña de reemplazo? */
  @Post('cobertura')
  @RequirePermissions('inventory.read')
  cobertura(@Body() body: { items: { sapCode: string; cantidad: number }[] }) {
    return this.inv.coberturaCampana(body?.items || []);
  }

  // ==========================================================================
  //  CATÁLOGO DE HERRAMIENTAS
  //  Antes de @Get(':id') para que ':id' no capture la palabra "tools".
  // ==========================================================================

  @Get('tools')
  @RequirePermissions('inventory.read')
  herramientas(@Query('todas') todas?: string) {
    return this.inv.herramientas(todas !== 'true');
  }

  /** Herramientas que más faltan: convierte la encuesta en decisión de compra. */
  @Get('tools/faltantes')
  @RequirePermissions('inventory.read')
  herramientasQueFaltan() {
    return this.inv.herramientasQueFaltan();
  }

  @Post('tools')
  @RequirePermissions('inventory.manage')
  crearHerramienta(@Body() dto: any) {
    return this.inv.crearHerramienta(dto);
  }

  @SinAmbito()  // almacén: es uno solo para toda la planta
  @Patch('tools/:toolId')
  @RequirePermissions('inventory.manage')
  actualizarHerramienta(@Param('toolId') toolId: string, @Body() dto: any) {
    return this.inv.actualizarHerramienta(toolId, dto);
  }

  @SinAmbito()  // almacén: es uno solo para toda la planta
  @Delete('tools/:toolId')
  @RequirePermissions('inventory.manage')
  desactivarHerramienta(@Param('toolId') toolId: string) {
    return this.inv.desactivarHerramienta(toolId);
  }

  /* LAS DOS LECTURAS QUE ABREN LA PANTALLA (bloque 80).
     -------------------------------------------------------------------------
     El usuario pidió que Producción pueda «verificar almacén». La entrada del
     menú se abrió con `om.mirar`, y si el endpoint no se abre también, la
     pantalla carga y sale VACÍA con un 403 — que es exactamente el fallo del
     bloque 68 con el QR.

     Se abre SÓLO la lectura: `inventory.manage` sigue guardando todo lo que
     mueve stock. Quien supervisa las órdenes de su tren necesita saber si hay
     repuesto ANTES de pedir el trabajo; no necesita poder retirarlo. */
  @Get('summary')
  @RequireAlguno('inventory.read', 'om.mirar')
  summary() { return this.inv.summary(); }

  @Get()
  @RequireAlguno('inventory.read', 'om.mirar')
  findAll(@Query() q: QuerySpareDto) { return this.inv.findAll(q); }

  // Repuestos compatibles con un activo (por vínculo o modelo).
  @SinAmbito()  // almacén: es uno solo para toda la planta
  @Get('for-asset/:assetId')
  @RequirePermissions('inventory.read')
  forAsset(@Param('assetId') assetId: string) { return this.inv.sparesForAsset(assetId); }

  @SinAmbito()  // almacén: es uno solo para toda la planta
  @Get(':id')
  @RequirePermissions('inventory.read')
  findOne(@Param('id') id: string) { return this.inv.findOne(id); }

  @Post()
  @RequirePermissions('inventory.manage')
  create(@Body() dto: CreateSpareDto) { return this.inv.create(dto); }

  @SinAmbito()  // almacén: es uno solo para toda la planta
  @Patch(':id')
  @RequirePermissions('inventory.manage')
  update(@Param('id') id: string, @Body() dto: UpdateSpareDto) { return this.inv.update(id, dto); }

  @SinAmbito()  // almacén: es uno solo para toda la planta
  @Delete(':id')
  @RequirePermissions('inventory.manage')
  remove(@Param('id') id: string) { return this.inv.remove(id); }

  @SinAmbito()  // almacén: es uno solo para toda la planta
  @Post(':id/link')
  @RequirePermissions('inventory.manage')
  link(@Param('id') id: string, @Body() dto: LinkAssetDto) { return this.inv.linkAsset(id, dto); }

  @SinAmbito()  // almacén: es uno solo para toda la planta
  @Delete(':id/link/:assetId')
  @RequirePermissions('inventory.manage')
  unlink(@Param('id') id: string, @Param('assetId') assetId: string) { return this.inv.unlinkAsset(id, assetId); }

  // Movimiento de stock (ingreso/retiro/ajuste) — retiro por código SAP.
  @SinAmbito()  // almacén: es uno solo para toda la planta
  @Post(':id/movement')
  @RequirePermissions('inventory.check')
  movement(@Param('id') id: string, @Body() dto: MovementDto, @CurrentUser() user: any) {
    return this.inv.registerMovement(id, dto, user?.userId);
  }

  // Comprobación física (control diario del almacén).
  @SinAmbito()  // almacén: es uno solo para toda la planta
  @Post(':id/check')
  @RequirePermissions('inventory.check')
  check(@Param('id') id: string, @Body() dto: CheckDto, @CurrentUser() user: any) {
    return this.inv.registerCheck(id, dto, user?.userId);
  }
}
