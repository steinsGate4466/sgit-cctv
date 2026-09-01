import { Body, Controller, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ParadasService } from './paradas.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions, RequireAlguno } from '../../common/decorators/permissions.decorator';
import { AmbitoDe } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CrearParadaDto, EstadoParadaDto, LigarOrdenDto, MoverParadaDto } from './dto/parada.dto';

@ApiTags('paradas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('paradas')
export class ParadasController {
  constructor(private readonly paradas: ParadasService) {}

  /* ===========================================================================
     LAS CUATRO LECTURAS SE ABREN A `om.mirar` — bloque 83
     ---------------------------------------------------------------------------
     Las paradas las apunta Producción: se enteran por radio, por WhatsApp o de
     boca (bloque 16). Cerrarlas con `wo.read` dejó a quien SE ENTERA sin poder
     ni consultarlas — y «¿cuándo puedo tocar la línea?» es la pregunta con la
     que se abre la mañana en los dos lados.

     LAS CUATRO JUNTAS, y ésa es la lección del bloque 77: la pantalla llama a
     `/paradas`, `/paradas/proximas`, `/paradas/fiabilidad` y `/paradas/:id`.
     Abrir tres de cuatro deja un bloque en blanco que parece un fallo del
     software. Media puerta es peor que ninguna.

     `fiabilidad` NO es un indicador de mantenimiento: mide cuánto se MUEVEN
     las ventanas respecto a lo anunciado. Es la desviación de Producción sobre
     su propio aviso, así que si es de alguien, es suya.

     ESCRIBIR NO SE MUEVE: apuntar, mover y cambiar el estado siguen pidiendo
     `wo.update`, que Producción no tiene.
  =========================================================================== */

  // Rutas literales SIEMPRE antes que :id, o `/paradas/proximas` entra por
  // `/paradas/:id` con id="proximas" y devuelve un 404 que no se entiende.
  @Get('proximas')
  @RequireAlguno('wo.read', 'om.mirar')
  proximas(@Query('tren') tren?: string) {
    return this.paradas.proximas(tren);
  }

  @Get('fiabilidad')
  @RequireAlguno('wo.read', 'om.mirar')
  fiabilidad(@Query('dias') dias?: string) {
    return this.paradas.fiabilidad(Number(dias) > 0 ? Number(dias) : 90);
  }

  @Get()
  @RequireAlguno('wo.read', 'om.mirar')
  listar(@Query() q: any) {
    return this.paradas.listar(q || {});
  }

  @AmbitoDe('ventanaParada')
  @Get(':id')
  @RequireAlguno('wo.read', 'om.mirar')
  detalle(@Param('id') id: string) {
    return this.paradas.detalle(id);
  }

  /** Apuntar una parada. Cualquiera que gestione OM puede: quien se entera, apunta. */
  @Post()
  @RequirePermissions('wo.update')
  crear(@Body() dto: CrearParadaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.paradas.crear(dto, u?.userId, ip);
  }

  @AmbitoDe('ventanaParada')
  @Patch(':id/mover')
  @RequirePermissions('wo.update')
  mover(@Param('id') id: string, @Body() dto: MoverParadaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.paradas.mover(id, dto, u?.userId, ip);
  }

  @AmbitoDe('ventanaParada')
  @Patch(':id/estado')
  @RequirePermissions('wo.update')
  estado(@Param('id') id: string, @Body() dto: EstadoParadaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.paradas.cambiarEstado(id, dto, u?.userId, ip);
  }

  @AmbitoDe('ventanaParada')
  @Post(':id/orden')
  @RequirePermissions('wo.update')
  ligar(@Param('id') id: string, @Body() dto: LigarOrdenDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.paradas.ligarOrden(id, dto.workOrderId, dto.ligar !== false, u?.userId, ip);
  }
}
