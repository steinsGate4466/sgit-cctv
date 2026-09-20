import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { analizar, aTexto, dentroDe, enPoolDhcp } from '../ipam/red';

/**
 * LA RED DE ESTE EQUIPO, ENTERA — bloque 109.
 *
 * =============================================================================
 *  LO QUE PIDIÓ EL USUARIO, Y POR QUÉ NO SE HACE COMO LO PIDIÓ
 * =============================================================================
 *  «No sólo la IP: también la máscara, el prefijo, /16, /24.»
 *
 *  La primera idea era añadir `prefijo`, `mascara`, `vlan` y `gateway` a la
 *  ficha del activo. Se descartó **después de mirar qué hay ya en la base**:
 *
 *      model Subred { cidr, vlan, gateway, dns1, dns2, dhcpDesde, dhcpHasta }
 *
 *  Todo eso YA está declarado, una vez, por subred. Copiarlo al activo crearía
 *  cuatro campos que pueden decir algo distinto de la subred a la que la IP
 *  pertenece de verdad — y el día que no coincidan, **nadie sabría cuál de los
 *  dos creerse**. En una planta eso no es un detalle: es salir a campo con una
 *  máscara equivocada.
 *
 *  Es la regla fundacional del proyecto: **lo que se puede calcular no se
 *  guarda.** La IP del equipo más las subredes declaradas dan el prefijo, la
 *  máscara, la VLAN y la puerta de enlace sin margen de error.
 *
 *  Y se gana algo que el campo suelto no daba: cuando la IP **no cae en
 *  ninguna subred declarada**, eso se ve. Con un campo de texto, una IP
 *  huérfana traería su máscara escrita a mano y parecería correcta.
 *
 * =============================================================================
 *  NO SE INVENTA UNA MÁSCARA
 * =============================================================================
 *  Si la IP no pertenece a ninguna subred declarada, aquí NO se devuelve «/24
 *  probablemente». Se devuelve que no se sabe, y se dice qué hacer: declarar
 *  esa subred en IPAM. Un /24 supuesto sobre una red que en realidad es /22 es
 *  la clase de dato que hace perder una mañana en planta.
 */
@Injectable()
export class RedDelActivoService {
  constructor(private prisma: PrismaService) {}

  /**
   * De dónde sale la IP, por orden. Un activo puede ser cámara, switch o NVR,
   * y cada uno la guarda en su tabla hija: sin mirarlas todas, media planta
   * saldría «sin IP».
   */
  private ipDe(a: any): { ip: string | null; campo: string | null } {
    if (a.camera?.ipAddress) return { ip: a.camera.ipAddress, campo: 'cámara' };
    if (a.switchDev?.mgmtIp) return { ip: a.switchDev.mgmtIp, campo: 'gestión del switch' };
    if (a.nvr?.nicPrimary) return { ip: a.nvr.nicPrimary, campo: 'NIC principal del NVR' };
    return { ip: null, campo: null };
  }

  async del(assetId: string) {
    const a = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true, assetCode: true, type: true, deletedAt: true,
        camera: { select: { ipAddress: true, vlanId: true } },
        switchDev: { select: { mgmtIp: true } },
        nvr: { select: { nicPrimary: true } },
      },
    });
    if (!a || a.deletedAt) throw new NotFoundException('Activo no encontrado');

    const { ip, campo } = this.ipDe(a);
    if (!ip) {
      return {
        assetCode: a.assetCode,
        ip: null,
        motivo: 'Este equipo no tiene dirección IP registrada.',
      };
    }

    /* Las subredes ACTIVAS. Una subred retirada no debe seguir explicando una
       IP: si alguien la desactivó, es que ya no manda. */
    const subredes = await this.prisma.subred.findMany({
      where: { activa: true },
      select: {
        id: true, cidr: true, nombre: true, vlan: true, gateway: true,
        dns1: true, dns2: true, dhcpDesde: true, dhcpHasta: true, tren: true,
      },
      /* Ordenadas de la MÁS ESPECÍFICA a la más general: con un /24 dentro de
         un /16 declarados los dos, la respuesta correcta es el /24. Ordenar al
         revés daría la máscara del /16 y el equipo no llegaría a su gateway. */
      orderBy: { cidr: 'asc' },
      take: 500,
    });
    const porEspecificidad = [...subredes].sort(
      (x, y) => (Number(y.cidr.split('/')[1]) || 0) - (Number(x.cidr.split('/')[1]) || 0),
    );

    const suya = porEspecificidad.find((s) => dentroDe(ip, s.cidr)) || null;

    if (!suya) {
      return {
        assetCode: a.assetCode,
        ip,
        campo,
        subred: null,
        /* NI UNA MÁSCARA SUPUESTA. Ver el comentario de cabecera. */
        motivo: 'Esta IP no cae en ninguna subred declarada, así que no se puede '
          + 'saber su máscara ni su puerta de enlace. Declara la subred en IPAM y '
          + 'aparecerá aquí sola.',
      };
    }

    const r = analizar(suya.cidr);
    const bits = Number(suya.cidr.split('/')[1]);

    return {
      assetCode: a.assetCode,
      ip,
      campo,
      subred: {
        id: suya.id,
        cidr: suya.cidr,
        nombre: suya.nombre,
        prefijo: `/${bits}`,
        mascara: r ? aTexto(r.mascara) : null,
        red: r ? aTexto(r.red) : null,
        broadcast: r ? aTexto(r.broadcast) : null,
        utiles: r ? r.utiles : null,
        vlan: suya.vlan ?? null,
        gateway: suya.gateway ?? null,
        dns: [suya.dns1, suya.dns2].filter(Boolean),
        tren: suya.tren ?? null,
      },
      /* UNA ESTÁTICA DENTRO DEL POOL DEL DHCP es un choque esperando a pasar:
         el servidor puede entregar esa misma IP a otro equipo la semana que
         viene y los dos se quedan sin red. Se avisa aquí, con el equipo
         delante, y no sólo en la pantalla de IPAM que casi nadie abre. */
      enPoolDhcp: enPoolDhcp(ip, suya.dhcpDesde, suya.dhcpHasta),
      /* La VLAN declarada en la cámara frente a la de su subred. Si no cuadran,
         una de las dos está mal y el equipo no pasa tráfico. */
      vlanDeclarada: a.camera?.vlanId ?? null,
    };
  }
}
