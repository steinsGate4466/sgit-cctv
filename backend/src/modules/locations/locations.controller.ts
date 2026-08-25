import {
  Body, Controller, Get, Param, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { LocationsService } from './locations.service';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequireAlguno, RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AmbitoDe } from '../../common/ambito.decorator';

@ApiTags('locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  /* ÁRBOL DE UBICACIONES — «cualquiera de». Bloque 66. Mismo caso que
     `/assets/options`: es la lista para rellenar el campo «dónde está», y la
     usan siete pantallas abiertas con permisos distintos. Con `location.read`
     a secas el desplegable salía vacío en Activos, Instalaciones, Gabinetes,
     Electricidad, Campañas, Documentos y Mantenimiento. */
  @Get()
  @RequireAlguno(
    'location.read', 'location.manage', 'asset.read', 'asset.create',
    'asset.update', 'activos.mirar', 'infra.read', 'wo.read',
    'document.read',
  )
  findAll() {
    return this.locations.findAll();
  }

  /* Mismo caso que la lista: es el árbol para elegir «dónde está». Bloque 66. */
  @Get('tree')
  @RequireAlguno(
    'location.read', 'location.manage', 'asset.read', 'asset.create',
    'asset.update', 'activos.mirar', 'infra.read', 'wo.read', 'document.read',
  )
  tree() {
    return this.locations.tree();
  }

  // Registrar ubicaciones poco a poco (técnico/operación con asset.update).
  @Post()
  @RequirePermissions('asset.update')
  create(@Body() dto: CreateLocationDto) {
    return this.locations.create(dto);
  }

  @AmbitoDe('location')
  @Patch(':id')
  @RequirePermissions('asset.update')
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.locations.update(id, dto);
  }

  // Foto de referencia de la ubicación.
  @AmbitoDe('location')
  @Get(':id/photo')
  @RequirePermissions('location.read')
  async photo(@Param('id') id: string, @Res() res: Response) {
    const { buffer, contentType } = await this.locations.getPhoto(id);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  }

  @AmbitoDe('location')
  @Post(':id/photo')
  @RequirePermissions('asset.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  uploadPhoto(@Param('id') id: string, @UploadedFile() file: any) {
    return this.locations.uploadPhoto(id, file);
  }
}
