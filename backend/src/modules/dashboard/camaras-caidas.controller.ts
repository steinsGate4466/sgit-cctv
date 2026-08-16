import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CamarasCaidasService } from './camaras-caidas.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * EL PANEL DEL JEFE DE TREN — bloque 39.
 *
 * =============================================================================
 *  POR QUÉ `om.mirar` Y NO `wo.read`
 * =============================================================================
 *  El jefe de tren necesita ver la orden que se está haciendo sobre SUS
 *  cámaras: el avance, la última nota, qué material falta. Nada más.
 *
 *  Darle `wo.read` para eso le abriría el módulo de Mantenimiento ENTERO: el
 *  listado de las trescientas órdenes de la planta, los filtros, las de otros
 *  trenes. Y le metería en el menú pantallas que no va a usar nunca — que es
 *  la forma más rápida de que deje de entrar al sistema.
 *
 *  `om.mirar` es una llave estrecha: sólo estas rutas, sólo lectura, sólo su
 *  ámbito. Si alguien se la concede por error, lo peor que puede pasar es que
 *  MIRE.
 *
 * =============================================================================
 *  NO HAY NI UNA OPERACIÓN DE ESCRITURA AQUÍ, Y ES A PROPÓSITO
 * =============================================================================
 *  Producción observa, no interviene. El trabajo de campo es de Mantenimiento
 *  y esa frontera es la que hace que las dos áreas puedan compartir pantalla
 *  sin pisarse. Este controlador tiene un solo verbo: GET.
 *
 * =============================================================================
 *  EL ÁMBITO NO SE COMPRUEBA AQUÍ
 * =============================================================================
 *  Va `@SinAmbito()` porque el guard genérico no sabe leer un código de tren
 *  de la ruta. El filtro lo hace el SERVICIO, que sí lo sabe: cruza el tren
 *  pedido contra el ámbito del usuario y devuelve vacío si no le corresponde.
 *  Escribir T1 en la dirección siendo del Tren 2 no enseña nada.
 */
@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboard/tren')
export class CamarasCaidasController {
  constructor(private readonly svc: CamarasCaidasService) {}

  /**
   * Qué cámara falla en este tren y qué se está haciendo con ella.
   *
   * Los materiales sólo viajan si el usuario puede ver el inventario. No se
   * devuelven y se esconden en la pantalla: NO SE DEVUELVEN. Esconder algo que
   * ya salió del servidor es esconderlo de la vista, no del que sabe abrir las
   * herramientas del navegador.
   */
  @SinAmbito()
  @Get(':code/camaras')
  @RequirePermissions('om.mirar')
  camaras(@Param('code') code: string, @CurrentUser() user: any) {
    const puedeVerMateriales = (user?.permissions ?? []).includes('inventory.read');
    return this.svc.porTren(code, user?.userId, puedeVerMateriales);
  }
}
