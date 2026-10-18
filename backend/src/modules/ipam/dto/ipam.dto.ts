/* =============================================================================
   DTO DE IPAM — bloque 174
   -----------------------------------------------------------------------------
   Cierra la deuda del bloque 85 en este módulo: los dos `@Body() dto: any`
   dejan de entrar sin validar. Cada clase declara TODAS las claves que manda
   la pantalla (`pages/Ipam.tsx`) y todas las que lee `ipam.service.ts`. Con
   `forbidNonWhitelisted`, una clave olvidada aquí es un formulario que deja
   de guardar (bloque 90, Roles).

   Las direcciones (CIDR, gateway, DNS, pool DHCP) se dejan como texto: su
   formato lo comprueba el servicio con su mensaje de planta.
============================================================================= */
import { Entero, Id, Texto, UnoDe } from '../../../common/validacion';
import { PropositoSubred, TipoAsignacion } from '../../../generated/prisma/client';

/** POST /ipam/subredes */
export class CrearSubredDto {
  @Texto(50) cidr?: string;
  @Texto(200) nombre?: string;
  @UnoDe(Object.values(PropositoSubred)) proposito?: string;
  @Entero() vlan?: number | string | null;
  @Texto(50) gateway?: string;
  @Texto(50) dns1?: string;
  @Texto(50) dns2?: string;
  /** Lo normaliza `aTrenDePlanta` («Tren 2», «T2», «TREN_2»…). */
  @Texto(60) tren?: string;
  @Id() locationId?: string;
  @Texto(50) dhcpDesde?: string;
  @Texto(50) dhcpHasta?: string;
  @Texto(2000) descripcion?: string;
}

/** POST /ipam/reservas */
export class ReservarIpDto {
  @Texto(50) ip?: string;
  @UnoDe(Object.values(TipoAsignacion)) tipo?: string;
  @Id() assetId?: string;
  @Texto(200) hostname?: string;
  @Texto(50) mac?: string;
  @Texto(2000) descripcion?: string;
  @Texto(2000) notas?: string;
}
