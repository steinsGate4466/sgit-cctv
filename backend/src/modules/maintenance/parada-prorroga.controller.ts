import { Body, Controller, Get, Ip, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ParadaProrrogaService } from './parada-prorroga.service';
import { EventoParadaDto, PedirProrrogaDto, ResolverProrrogaDto } from './dto/parada-prorroga.dto';
import { RequirePermissions, RequireAlguno } from '../../common/decorators/permissions.decorator';
import { AmbitoDe } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * PARADA REAL Y PRÓRROGA — bloques 138 y 135.
 *
 * QUIÉN PUEDE QUÉ:
 *   · declarar la parada ........ `wo.update` (el técnico, con lo que dijo la radio)
 *   · pedir prórroga ............ `wo.update`
 *   · aprobar / rechazar ........ `wo.approve` (el supervisor), y NUNCA la suya
 *   · ver las prórrogas ......... `wo.read` u `om.mirar` (Producción también)
 */
@ApiTags('work-orders')
@ApiBearerAuth()
@Controller('work-orders')
export class ParadaProrrogaController {
  constructor(private readonly svc: ParadaProrrogaService) {}

  /* Va ANTES de las rutas con `:id` por la misma disciplina de siempre: si
     no, ':id' capturaría la palabra «prorrogas». */
  @Get('prorrogas/pendientes')
  @RequirePermissions('wo.approve')
  pendientes() {
    return this.svc.pendientes();
  }

  @AmbitoDe('workOrder')
  @Post(':id/parada')
  @RequirePermissions('wo.update')
  parada(@Param('id') id: string, @Body() dto: EventoParadaDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.svc.declararParada(id, dto.evento, dto.hora, user?.userId ?? null, ip);
  }

  @AmbitoDe('workOrder')
  @Get(':id/prorrogas')
  @RequireAlguno('wo.read', 'om.mirar')
  listar(@Param('id') id: string) {
    return this.svc.listar(id);
  }

  @AmbitoDe('workOrder')
  @Post(':id/prorrogas')
  @RequirePermissions('wo.update')
  pedir(@Param('id') id: string, @Body() dto: PedirProrrogaDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.svc.pedir(id, dto.fechaPedida, dto.motivo, user?.userId ?? null, ip);
  }

  @AmbitoDe('workOrder')
  @Post(':id/prorrogas/:pid/aprobar')
  @RequirePermissions('wo.approve')
  aprobar(@Param('id') id: string, @Param('pid') pid: string, @Body() dto: ResolverProrrogaDto,
    @CurrentUser() user: any, @Ip() ip: string) {
    return this.svc.resolver(id, pid, true, dto.nota, user?.userId ?? null, ip);
  }

  @AmbitoDe('workOrder')
  @Post(':id/prorrogas/:pid/rechazar')
  @RequirePermissions('wo.approve')
  rechazar(@Param('id') id: string, @Param('pid') pid: string, @Body() dto: ResolverProrrogaDto,
    @CurrentUser() user: any, @Ip() ip: string) {
    return this.svc.resolver(id, pid, false, dto.nota, user?.userId ?? null, ip);
  }
}
