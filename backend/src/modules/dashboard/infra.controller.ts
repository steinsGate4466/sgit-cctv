import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InfraService } from './infra.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Tablero de INFRAESTRUCTURA.
 *
 * Va en su propio controlador y se registra ANTES de DashboardController: sus
 * rutas empiezan por 'infra/', así que no chocan con 'train/:train', pero el
 * orden explícito documenta la intención y evita sorpresas si mañana alguien
 * añade un @Get(':algo') al tablero ejecutivo.
 */
@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboard/infra')
export class InfraController {
  constructor(private readonly infra: InfraService) {}

  /* LOS TRENES DEL ÁRBOL — SIN PERMISO DE MÓDULO. Bloque 66.
     -------------------------------------------------------------------------
     EL FALLO QUE ESTO CIERRA, y salió mirando la pantalla.

     Esto exigía `dashboard.read`. Y lo llaman CUATRO pantallas de Producción
     —Por tren, Vista general, Mis cámaras, Mis activos— que se abren con
     `om.mirar` o `activos.mirar`.

     Ni el Jefe de Tren ni el Operador de Púlpito tienen `dashboard.read`. Así
     que la lista de trenes les llegaba con 403, las pestañas salían vacías,
     no había tren seleccionado y «Mis cámaras» decía «este tren todavía no
     tiene cámaras cargadas». El usuario concluyó, con razón, que la pantalla
     estaba rota.

     POR QUÉ SE QUITA EL PERMISO Y NO SE REPARTE `dashboard.read`

     Porque `dashboard.read` abre el tablero de indicadores entero. Concederlo
     para que alguien vea tres nombres de tren es abrir de más por un problema
     de fontanería.

     Y PORQUE ESTO NO ES INFORMACIÓN: devuelve el código, el nombre y la sigla
     de los trenes. Están escritos en carteles por toda la planta. Lo que sí
     es información —qué hay dentro de cada tren— va en otros endpoints, cada
     uno con su permiso y su ámbito.

     LA REGLA QUE QUEDA: una lista de apoyo para rellenar una pestaña o un
     desplegable NO lleva el permiso del módulo al que pertenece. Si lo lleva,
     acaba cerrándole la pantalla a quien tiene derecho a usarla.

     Sigue exigiendo sesión válida: el `JwtAuthGuard` de la clase no se toca. */
  @Get('trenes')
  trenes(@CurrentUser() user: any) {
    return this.infra.resumenTrenes(user?.userId);
  }

  /**
   * Activos que no cuelgan de ningún tren. Ruta ANTES de 'tren/:idOrCode' por
   * disciplina: lo específico primero, siempre.
   */
  @Get('sin-ubicar')
  @RequirePermissions('dashboard.read')
  sinUbicar(@CurrentUser() user: any) {
    // Lo que no cuelga de ningún tren sólo lo ve quien lo ve todo. Un jefe
    // de línea no puede saber si eso es suyo, así que no se le enseña.
    return this.infra.sinUbicar(user?.userId);
  }

  /**
   * Todo lo de un tren agrupado por zona (bloque 49). Acepta id, código o
   * sigla, porque el selector de la pantalla trabaja con siglas (T1, OFI).
   *
   * Va con `om.mirar` y no con `dashboard.read`: es la pantalla de Producción,
   * y un jefe de tren no tiene por qué cargar con el permiso del tablero
   * ejecutivo para ver su propio tren.
   */
  @SinAmbito()  // el servicio recorta por ámbito y responde 404 si no alcanza
  @Get('tren/:idOrCode/zonas')
  @RequirePermissions('om.mirar')
  porZonas(@Param('idOrCode') idOrCode: string, @CurrentUser() user: any) {
    return this.infra.porZonas(idOrCode, user?.userId);
  }

  /** Qué tan completos están los datos de la planta (bloque 50). */
  @SinAmbito()  // la calidad de los datos es un problema de planta, no de un tren
  @Get('salud-de-datos')
  @RequirePermissions('asset.update')
  salud() {
    return this.infra.salud();
  }

  /** Tablero completo de un tren. Acepta el id o el código de la ubicación. */
  @SinAmbito()  // el tablero ya filtra por ámbito en el servicio
  @Get('tren/:idOrCode')
  @RequirePermissions('dashboard.read')
  detalle(@Param('idOrCode') idOrCode: string, @CurrentUser() user: any) {
    return this.infra.detalleTren(idOrCode, user?.userId);
  }
}
