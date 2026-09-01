import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IndicadoresService } from './indicadores.service';
import { libroDeIndicadores } from './excel-indicadores';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Ritmo } from '../../common/guards/ritmo.guard';
import { RITMO_PESADO } from '../../common/ritmo';

@ApiTags('indicadores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('indicadores')
export class IndicadoresController {
  constructor(private readonly ind: IndicadoresService) {}

  @Get()
  @RequirePermissions('dashboard.read')
  tablero(@Query('dias') dias?: string, @Query('tren') tren?: string) {
    const d = Number(dias);
    return this.ind.tablero(d > 0 && d <= 730 ? d : 90, tren || undefined);
  }

  @Get('tendencia')
  @RequirePermissions('dashboard.read')
  tendencia(@Query('meses') meses?: string) {
    const m = Number(meses);
    return this.ind.tendencia(m > 0 && m <= 24 ? m : 6);
  }

  /* ===========================================================================
     LOS INDICADORES EN EXCEL — bloque 84
     ---------------------------------------------------------------------------
     Petición del usuario: «que se pueda descargar ese apartado en Excel».

     RUTA LITERAL, y va DESPUÉS de `@Get()` pero no hay `:id` en este
     controlador, así que no hay ambigüedad — se deja escrito igualmente para
     que si algún día se añade uno, la regla del proyecto ya esté a la vista.

     MISMO PERMISO QUE LA PANTALLA (`dashboard.read`): el archivo enseña
     exactamente lo que la pantalla ya enseña. Pedir uno distinto daría el caso
     absurdo de ver un número y no poder llevártelo — o al revés, que es peor.

     RITMO PESADO: el libro se arma ENTERO en memoria, igual que el de
     Exportar. Es el mismo motivo del hallazgo S-03 y la misma cura.
  =========================================================================== */
  @Get('excel')
  @Ritmo(RITMO_PESADO)
  @RequirePermissions('dashboard.read')
  async excel(
    @Res() res: Response,
    @Query('dias') dias?: string,
    @Query('tren') tren?: string,
  ) {
    const d = Number(dias);
    /* Se pide el MISMO tablero que la pantalla, con los mismos parámetros. El
       Excel no recalcula nada por su cuenta: si tuviera su propio cálculo, un
       día el número de la pantalla y el del archivo dejarían de coincidir y el
       ingeniero llevaría al comité el que no toca sin saberlo. */
    const t = await this.ind.tablero(d > 0 && d <= 730 ? d : 90, tren || undefined);
    const buffer = await libroDeIndicadores(t);
    const nombre = `sgit_indicadores_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }
}
