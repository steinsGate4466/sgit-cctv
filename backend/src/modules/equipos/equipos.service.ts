import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrearEquipoDto, EditarEquipoDto } from './dto/equipo.dto';

/**
 * REGISTRO DE EQUIPOS CONOCIDOS
 * =============================================================================
 * Traduce una IP suelta en un sitio de la planta: "10.20.3.14" → "PC Púlpito
 * Tren 2". Sin esto, la auditoría contesta "desde 10.20.3.14", que no le dice
 * nada a nadie a los tres meses.
 *
 * LA MAC SE ESCRIBE A MANO. No es una limitación de este software: un servidor
 * web no puede ver la MAC del cliente, punto. Sale de la reserva DHCP o de la
 * tabla MAC del switch y la escribe el técnico de redes.
 *
 * SE CACHEA EN MEMORIA, y esa es la decisión importante: la auditoría escribe
 * en CADA petición del sistema. Consultar esta tabla cada vez añadiría una
 * consulta a todo lo que pasa. El registro cambia dos veces al mes; un minuto
 * de desfase no le hace daño a nadie.
 */
@Injectable()
export class EquiposService {
  constructor(private prisma: PrismaService) {}

  private cache = new Map<string, string>();
  private cacheHasta = 0;
  private static readonly VIDA_CACHE_MS = 60_000;

  /** Un solo formato guardado: 00:1A:2B:3C:4D:5E. */
  private normalizarMac(mac?: string | null): string | null {
    if (!mac) return null;
    const hex = mac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    if (hex.length !== 12) throw new BadRequestException('La MAC debe tener 12 dígitos hexadecimales.');
    return hex.match(/.{2}/g)!.join(':');
  }

  private invalidar() { this.cacheHasta = 0; }

  /**
   * Nombre del equipo para una IP, o null si no está registrada.
   * Devuelve null en silencio a propósito: esto lo llama la auditoría, y la
   * auditoría nunca puede tumbar la operación que está auditando.
   */
  async nombrePorIp(ip?: string | null): Promise<string | null> {
    if (!ip) return null;
    try {
      if (Date.now() > this.cacheHasta) {
        const filas = await this.prisma.equipoConocido.findMany({
          where: { activo: true, ip: { not: null } },
          select: { ip: true, nombre: true },
        });
        this.cache = new Map(filas.map((f) => [f.ip as string, f.nombre]));
        this.cacheHasta = Date.now() + EquiposService.VIDA_CACHE_MS;
      }
      return this.cache.get(ip) ?? null;
    } catch {
      return null;
    }
  }

  listar(q?: string) {
    const texto = (q || '').trim();
    return this.prisma.equipoConocido.findMany({
      where: texto
        ? {
            OR: [
              { nombre: { contains: texto, mode: 'insensitive' } },
              { ip: { contains: texto } },
              { mac: { contains: texto.toUpperCase() } },
              { area: { contains: texto, mode: 'insensitive' } },
              { ubicacion: { contains: texto, mode: 'insensitive' } },
              { responsable: { contains: texto, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
  }

  async crear(dto: CrearEquipoDto) {
    const mac = this.normalizarMac(dto.mac);
    await this.exigirLibres(dto.ip ?? null, mac, null);
    const fila = await this.prisma.equipoConocido.create({
      data: { ...dto, mac, tipo: dto.tipo || 'PC' },
    });
    this.invalidar();
    return fila;
  }

  async editar(id: string, dto: EditarEquipoDto) {
    const previo = await this.prisma.equipoConocido.findUnique({ where: { id } });
    if (!previo) throw new NotFoundException('Equipo no encontrado');
    const mac = dto.mac === undefined ? previo.mac : this.normalizarMac(dto.mac);
    await this.exigirLibres(dto.ip === undefined ? previo.ip : dto.ip, mac, id);
    const fila = await this.prisma.equipoConocido.update({
      where: { id },
      data: { ...dto, mac },
    });
    this.invalidar();
    return fila;
  }

  async borrar(id: string) {
    const previo = await this.prisma.equipoConocido.findUnique({ where: { id } });
    if (!previo) throw new NotFoundException('Equipo no encontrado');
    await this.prisma.equipoConocido.delete({ where: { id } });
    this.invalidar();
    // Las líneas de auditoría que ya nombraban este equipo NO se tocan: guardan
    // el nombre copiado, no un enlace. Eso es lo que se quiere.
    return { ok: true, nombre: previo.nombre };
  }

  /**
   * Mensaje concreto en vez del error de clave duplicada de Postgres.
   * Decir "esa IP ya es del PC del Púlpito T2" ahorra el viaje a preguntar.
   */
  private async exigirLibres(ip: string | null | undefined, mac: string | null, exceptoId: string | null) {
    if (ip) {
      const otro = await this.prisma.equipoConocido.findUnique({ where: { ip } });
      if (otro && otro.id !== exceptoId) {
        throw new BadRequestException(`La IP ${ip} ya está registrada como "${otro.nombre}".`);
      }
    }
    if (mac) {
      const otro = await this.prisma.equipoConocido.findUnique({ where: { mac } });
      if (otro && otro.id !== exceptoId) {
        throw new BadRequestException(`La MAC ${mac} ya está registrada como "${otro.nombre}".`);
      }
    }
  }

  /**
   * IPs que aparecen en la auditoría y NO están en el registro.
   * Es la lista de trabajo del técnico de redes: cada línea es un equipo que
   * entró al sistema y del que no sabemos dónde está.
   */
  async ipsSinRegistrar(dias = 30) {
    const desde = new Date(Date.now() - dias * 86_400_000);
    const filas = await this.prisma.auditLog.groupBy({
      by: ['ip'],
      where: { createdAt: { gte: desde }, ip: { not: null }, origen: null },
      _count: { _all: true },
      orderBy: { _count: { ip: 'desc' } },
      take: 40,
    });
    const conocidas = new Set(
      (await this.prisma.equipoConocido.findMany({ where: { ip: { not: null } }, select: { ip: true } }))
        .map((f) => f.ip as string),
    );
    return filas
      .filter((f) => f.ip && !conocidas.has(f.ip) && f.ip !== 'local (servidor)')
      .map((f) => ({ ip: f.ip as string, accesos: f._count._all }));
  }
}
