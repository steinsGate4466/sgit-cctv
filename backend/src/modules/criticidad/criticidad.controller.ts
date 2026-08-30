import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CriticidadService } from './criticidad.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions, RequireAlguno } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AmbitoDe, SinAmbito } from '../../common/ambito.decorator';

/* =============================================================================
   CRITICIDAD A/B/C — quién puede qué (bloque 76)
   -----------------------------------------------------------------------------
     MIRAR      `asset.read` O `activos.mirar`
                Las DOS, y por la lección del bloque 68: cerrar esto sólo con
                `asset.read` dejaría al Jefe de Tren sin poder ver cada cuánto
                se revisa su propio equipo. Ya pasó con el QR — el permiso se
                quitó por un verificador y nadie miró qué dejaba de funcionar.

     DECLARAR   `asset.update`
                Lo declara quien conoce el equipo: el técnico que está delante.
                No hace falta ser jefe para decir que esa cámara mira el paso
                de grúa.

     LOS NÚMEROS DE LA PLANTA   `wo.approve`
                Mover un corte reordena el trabajo de la planta ENTERA. Eso no
                es una edición: es una decisión de mantenimiento, y la firma
                quien responde por él.
============================================================================= */
@ApiTags('criticidad')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('criticidad')
export class CriticidadController {
  constructor(private readonly criticidad: CriticidadService) {}

  /** El reparto de la planta y la tabla. Pantalla de Gestión. */
  @Get()
  @RequireAlguno('asset.read', 'activos.mirar')
  resumen(
    @Query('letra') letra?: string,
    @Query('tipo') tipo?: string,
    @Query('q') q?: string,
  ) {
    return this.criticidad.resumen({ letra, tipo, q });
  }

  /** Los cortes y los días vigentes. Ruta literal ANTES que `:id` (regla del proyecto). */
  @Get('parametros')
  @RequireAlguno('asset.read', 'activos.mirar')
  // Sin ámbito: son los números de la planta entera, no de ningún equipo.
  @SinAmbito()
  parametros() {
    return this.criticidad.parametros();
  }

  @Put('parametros')
  @RequirePermissions('wo.approve')
  // Sin ámbito: son los números de la planta entera, no de ningún equipo.
  @SinAmbito()
  guardarParametros(@Body() dto: any, @CurrentUser() user: any) {
    return this.criticidad.guardarParametros(dto, user?.userId);
  }

  /** El riesgo para personas de una ZONA: clasifica de golpe todo lo que cuelga. */
  @Put('zona/:id')
  @RequirePermissions('location.manage')
  @AmbitoDe('location')
  declararZona(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.criticidad.declararZona(id, dto, user?.userId);
  }

  /** Cada cuánto toca revisar este equipo, juntando la letra con el ambiente. */
  @Get(':id/intervalo')
  @RequireAlguno('asset.read', 'activos.mirar')
  @AmbitoDe('asset')
  intervalo(@Param('id') id: string) {
    return this.criticidad.intervaloDeUnActivo(id);
  }

  /** La criticidad de UN equipo, con el porqué. Es lo que pinta la ficha. */
  @Get(':id')
  @RequireAlguno('asset.read', 'activos.mirar')
  @AmbitoDe('asset')
  deUnActivo(@Param('id') id: string) {
    return this.criticidad.deUnActivo(id);
  }

  @Post(':id')
  @RequirePermissions('asset.update')
  @AmbitoDe('asset')
  declarar(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.criticidad.declarar(id, dto, user?.userId);
  }
}
