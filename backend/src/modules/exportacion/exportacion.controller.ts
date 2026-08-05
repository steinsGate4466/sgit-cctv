import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ExportacionService } from './exportacion.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Ritmo } from '../../common/guards/ritmo.guard';
import { RITMO_PESADO } from '../../common/ritmo';

@ApiTags('exportacion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('exportacion')
export class ExportacionController {
  constructor(private readonly exportacion: ExportacionService) {}

  @Get()
  @RequirePermissions('dashboard.read')
  catalogo() {
    return this.exportacion.catalogo();
  }

  /**
   * 'todo' ANTES de ':clave': lo literal primero o Nest leería "todo" como
   * una clave. Mismo orden y mismo motivo que en grabadores y en network.
   *
   * El libro completo lleva TODA la información de la planta en un archivo,
   * así que pide el permiso de auditoría: quien puede ver la actividad de
   * todos puede llevarse la foto completa. Los temas sueltos piden el
   * permiso de lectura de su propia pantalla — el Excel enseña exactamente
   * lo que esa pantalla ya enseña.
   */
  @Get('todo')
  // 12.2 — el libro completo se arma ENTERO en memoria. 5 por minuto es de
  // sobra para una persona y corta en seco el bucle que tumbaria el servidor.
  @Ritmo(RITMO_PESADO)
  @RequirePermissions('audit.read')
  async todo(@Res() res: Response) {
    const { nombre, buffer } = await this.exportacion.exportarTodo();
    this.responder(res, nombre, buffer);
  }

  @Get('activos')     @Ritmo(RITMO_PESADO) @RequirePermissions('asset.read')     async activos(@Res() res: Response)     { await this.una('activos', res); }
  @Get('gabinetes')   @Ritmo(RITMO_PESADO) @RequirePermissions('asset.read')     async gabinetes(@Res() res: Response)   { await this.una('gabinetes', res); }
  @Get('ubicaciones') @Ritmo(RITMO_PESADO) @RequirePermissions('location.read')  async ubicaciones(@Res() res: Response) { await this.una('ubicaciones', res); }
  @Get('ordenes')     @Ritmo(RITMO_PESADO) @RequirePermissions('wo.read')        async ordenes(@Res() res: Response)     { await this.una('ordenes', res); }
  @Get('incidencias') @Ritmo(RITMO_PESADO) @RequirePermissions('incident.read')  async incidencias(@Res() res: Response) { await this.una('incidencias', res); }
  @Get('repuestos')   @Ritmo(RITMO_PESADO) @RequirePermissions('inventory.read') async repuestos(@Res() res: Response)   { await this.una('repuestos', res); }
  @Get('red')         @Ritmo(RITMO_PESADO) @RequirePermissions('asset.read')     async red(@Res() res: Response)         { await this.una('red', res); }

  private async una(clave: string, res: Response) {
    const { nombre, buffer } = await this.exportacion.exportarUna(clave);
    this.responder(res, nombre, buffer);
  }

  private responder(res: Response, nombre: string, buffer: Buffer) {
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }
}
