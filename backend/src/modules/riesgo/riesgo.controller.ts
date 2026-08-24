import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RiesgoService } from './riesgo.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';

/** Dónde estamos expuestos a quedarnos sin arreglo (bloque 32). */
@ApiTags('riesgo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('riesgo')
export class RiesgoController {
  constructor(private readonly r: RiesgoService) {}

  @SinAmbito()  // el riesgo de almacén es de la planta entera, no de un tren
  @Get('repuestos')
  @RequirePermissions('inventory.read')
  repuestos() { return this.r.repuestos(); }

  @SinAmbito()  // la obsolescencia es del MODELO, y los modelos no son de un tren
  @Get('obsolescencia')
  @RequirePermissions('infra.read')
  equipos(@Query('anos') anos?: string) {
    const n = Number(anos);
    return this.r.equipos(Number.isFinite(n) && n > 0 ? n : 8);
  }
}
