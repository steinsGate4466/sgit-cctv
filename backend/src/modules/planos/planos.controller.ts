import {
  Body, Controller, Delete, Get, Ip, Param, Patch, Post, Put, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PlanosService } from './planos.service';
import { CalibrarPlanoDto, ColocarEquipoDto, CrearPlanoDto, ZonaDto } from './dto/planos.dto';
import { RequireAlguno, RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * PLANO VIVO — bloque 151.
 *
 * QUIÉN PUEDE QUÉ, sin permisos nuevos:
 *   · MIRAR el mapa ....... quien ve equipos: `asset.read`, `activos.mirar`
 *                            u `om.mirar` (Producción). Cada uno, su zona.
 *   · GESTIONAR planos .... `location.manage`: quien mantiene el árbol de la
 *                            planta. Subir, calibrar, colocar y publicar.
 *
 * El ámbito se comprueba en el servicio contra la UBICACIÓN del plano (el
 * guard de ámbito no conoce los planos), por eso las rutas van @SinAmbito.
 */
const MIRAR = ['asset.read', 'activos.mirar', 'om.mirar'];
const gestiona = (u: any) => (u?.permissions || []).includes('location.manage');
const veRed = (u: any) => (u?.permissions || []).includes('asset.read');

@ApiTags('planos')
@ApiBearerAuth()
@Controller('planos')
export class PlanosController {
  constructor(private readonly planos: PlanosService) {}

  @SinAmbito()
  @Get()
  @RequireAlguno(...MIRAR)
  listar(@CurrentUser() u: any) {
    return this.planos.listar(u?.userId ?? null, gestiona(u));
  }

  /** Bloque 165 · la planta de un vistazo: todos los planos publicados y cómo está cada uno. */
  @SinAmbito()
  @Get('planta')
  @RequireAlguno(...MIRAR)
  planta(@CurrentUser() u: any) {
    return this.planos.planta(u?.userId ?? null);
  }

  @SinAmbito()
  @Post()
  @RequirePermissions('location.manage')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 25 * 1024 * 1024 } }))
  crear(@UploadedFile() archivo: any, @Body() dto: CrearPlanoDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.planos.crear(archivo, dto, u?.userId ?? null, ip);
  }

  @SinAmbito()
  @Get(':id/imagen')
  @RequireAlguno(...MIRAR)
  async imagen(@Param('id') id: string, @CurrentUser() u: any, @Res() res: Response) {
    const { buffer, mime } = await this.planos.imagen(id, u?.userId ?? null, gestiona(u));
    res.set({
      'Content-Type': mime,
      'Content-Length': String(buffer.length),
      'X-Content-Type-Options': 'nosniff',
      // Un SVG abierto suelto no puede ejecutar nada ni cargar nada de fuera.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      'Cache-Control': 'private, max-age=300',
    });
    res.end(buffer);
  }

  @SinAmbito()
  @Get(':id/vista')
  @RequireAlguno(...MIRAR)
  vista(@Param('id') id: string, @CurrentUser() u: any) {
    return this.planos.vista(id, u?.userId ?? null, gestiona(u), veRed(u));
  }

  @SinAmbito()
  @Get(':id/sin-colocar')
  @RequirePermissions('location.manage')
  sinColocar(@Param('id') id: string) {
    return this.planos.sinColocar(id);
  }

  @SinAmbito()
  @Patch(':id/calibrar')
  @RequirePermissions('location.manage')
  calibrar(@Param('id') id: string, @Body() dto: CalibrarPlanoDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.planos.calibrarPlano(id, dto, u?.userId ?? null, ip);
  }

  @SinAmbito()
  @Put(':id/posiciones/:assetId')
  @RequirePermissions('location.manage')
  colocar(@Param('id') id: string, @Param('assetId') assetId: string, @Body() dto: ColocarEquipoDto,
    @CurrentUser() u: any, @Ip() ip: string) {
    return this.planos.colocar(id, assetId, dto, u?.userId ?? null, ip);
  }

  @SinAmbito()
  @Delete(':id/posiciones/:assetId')
  @RequirePermissions('location.manage')
  quitar(@Param('id') id: string, @Param('assetId') assetId: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.planos.quitar(id, assetId, u?.userId ?? null, ip);
  }

  /** Bloque 165 · dibujar (o volver a dibujar) la zona de una ubicación sobre el plano. */
  @SinAmbito()
  @Put(':id/zonas/:locationId')
  @RequirePermissions('location.manage')
  guardarZona(@Param('id') id: string, @Param('locationId') locationId: string, @Body() dto: ZonaDto,
    @CurrentUser() u: any, @Ip() ip: string) {
    return this.planos.guardarZona(id, locationId, dto.puntos, u?.userId ?? null, ip);
  }

  @SinAmbito()
  @Delete(':id/zonas/:locationId')
  @RequirePermissions('location.manage')
  borrarZona(@Param('id') id: string, @Param('locationId') locationId: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.planos.borrarZona(id, locationId, u?.userId ?? null, ip);
  }

  @SinAmbito()
  @Post(':id/publicar')
  @RequirePermissions('location.manage')
  publicar(@Param('id') id: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.planos.publicar(id, u?.userId ?? null, ip);
  }
}
