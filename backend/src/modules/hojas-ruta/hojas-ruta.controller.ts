import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HojasRutaService } from './hojas-ruta.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SinAmbito } from '../../common/ambito.decorator';

/* =============================================================================
   HOJAS DE RUTA — bloque 75
   -----------------------------------------------------------------------------
   QUIÉN PUEDE QUÉ, y no se afloja:

     LEER    `wo.read`     — el técnico tiene que poder consultar los pasos
                             antes de subir, y descargarlos.
     ESCRIBIR `wo.approve` — SÓLO el Jefe de Mantenimiento.

   Por qué el cierre y no `wo.update`: una hoja de ruta es el procedimiento
   que van a seguir CUATROCIENTAS intervenciones. Quitar un paso de seguridad
   de aquí no afecta a una orden: afecta a todas las que se hagan de ahora en
   adelante. Eso lo firma quien responde por el mantenimiento, no quien
   ejecuta una orden.
============================================================================= */
@ApiTags('hojas-de-ruta')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('hojas-de-ruta')
export class HojasRutaController {
  constructor(private readonly hojas: HojasRutaService) {}

  @Get()
  @RequirePermissions('wo.read')
  listar() {
    return this.hojas.listar();
  }

  /** Los pasos con los que nace una hoja nueva. VA ANTES de `:id`, o Nest
   *  leería «plantilla» como un identificador (regla del proyecto). */
  @Get('plantilla')
  @RequirePermissions('wo.read')
  plantilla() {
    return this.hojas.plantillaNueva();
  }

  /** El Excel de TODAS, con el formato de carga a SAP. */
  @Get('excel')
  @RequirePermissions('wo.read')
  async excelTodas(@Res() res: Response) {
    const { buffer, filename } = await this.hojas.excel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /** El Excel de UNA. También antes de `:id` a secas. */
  /* SIN ÁMBITO: una hoja de ruta es POR TIPO DE EQUIPO, no por tren. La misma
     hoja de «Cámara» sirve para las cuatrocientas cámaras de la planta, así
     que no pertenece a ningún tren y no hay nada que acotar. Faltaba desde el
     bloque 75 y lo cazó `verificar:ambito` una vez corregido su propio falso
     positivo (bloque 94). */
  @Get(':id/excel')
  @RequirePermissions('wo.read')
  @SinAmbito()
  async excelUna(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.hojas.excel(id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':id')
  @RequirePermissions('wo.read')
  /* SIN ÁMBITO, por el mismo motivo: la hoja es del TIPO de equipo. */
  @SinAmbito()
  unaSola(@Param('id') id: string) {
    return this.hojas.unaSola(id);
  }

  /** Crear o reemplazar. Sólo el Jefe de Mantenimiento — ver la cabecera. */
  @Post()
  @RequirePermissions('wo.approve')
  guardar(@Body() dto: any, @CurrentUser() user: any) {
    return this.hojas.guardar(dto, user?.userId);
  }

  /** Carga las cinco del ingeniero. No pisa las que ya existan. */
  @Post('cargar-las-del-ingeniero')
  @RequirePermissions('wo.approve')
  cargar() {
    return this.hojas.cargarLasDelIngeniero();
  }
}
