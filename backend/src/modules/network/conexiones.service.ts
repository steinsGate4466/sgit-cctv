import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { alcanza, ambitoDelUsuario, noVeNada } from '../../common/ambito-usuario';

/**
 * CONEXIONES DE RED (bloque 12.1).
 *
 * EL AGUJERO QUE CIERRA
 * El sistema sabía dibujar el mapa y calcular qué se cae si un equipo falla,
 * pero NO HABÍA DÓNDE DECIR QUÉ ESTÁ CONECTADO CON QUÉ. Los modelos existían
 * (`SwitchPort`, `NetworkLink`), el endpoint de alta de enlaces existía, y no
 * había ni una pantalla. Resultado: el mapa salía como un montón de cajas
 * sueltas y el análisis de impacto no tenía nada que analizar.
 *
 * Es el caso de manual de una función a medio terminar: la parte difícil
 * hecha, y la puerta de entrada sin construir.
 *
 * LAS DOS FORMAS DE CONECTAR, Y CUÁNDO USAR CADA UNA
 *   · PUERTO DE SWITCH — "en el puerto 8 del switch del púlpito está la
 *     cámara X". Es el dato más fiable porque se anota al cablear, y es el
 *     que hay que usar siempre que se pueda.
 *   · ENLACE DECLARADO — para lo que no pasa por un puerto numerado: el
 *     anillo de fibra del core, un radioenlace entre naves. Admite marcar
 *     `isRing`, que es lo que hace que el análisis entienda que hay camino
 *     alternativo.
 *
 * SÓLO LECTURA + ALTAS SIMPLES. Ninguna operación borra activos.
 */
@Injectable()
export class ConexionesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Switches visibles con sus puertos y qué cuelga de cada uno. */
  async switches(userId?: string | null, tren?: string | null) {
    const equipos = await this.prisma.asset.findMany({
      where: { deletedAt: null, type: 'SWITCH', status: { notIn: ['BAJA'] } },
      select: {
        id: true, assetCode: true, model: true, status: true,
        referencePlace: true, locationId: true,
        switchDev: { select: { portCount: true, poePorts: true, mgmtIp: true } },
      },
      orderBy: { assetCode: 'asc' },
    });
    if (equipos.length === 0) return [];

    const ctx = await resolverContextoDePlanta(this.prisma, equipos as any);
    const ambito = await ambitoDelUsuario(this.prisma, userId);
    if (noVeNada(ambito)) return [];
    const visibles = equipos.filter((s) => {
      const t = ctx[s.id]?.trenCode ?? null;
      if (!alcanza(ambito, t)) return false;
      if (tren && t !== tren.toUpperCase()) return false;
      return true;
    });
    if (visibles.length === 0) return [];

    // Una sola consulta para los puertos de TODOS los switches visibles.
    // Una por switch sería el N+1 que ya costó 40 segundos en monitoreo.
    const puertos = await this.prisma.switchPort.findMany({
      where: { switchId: { in: visibles.map((s) => s.id) } },
      select: {
        id: true, switchId: true, portNumber: true, poe: true, vlanNumber: true,
        connectedAssetId: true,
        connectedAsset: { select: { assetCode: true, type: true, status: true, referencePlace: true } },
      },
      orderBy: { portNumber: 'asc' },
    });

    const porSwitch = new Map<string, typeof puertos>();
    for (const p of puertos) {
      if (!porSwitch.has(p.switchId)) porSwitch.set(p.switchId, []);
      (porSwitch.get(p.switchId) as typeof puertos).push(p);
    }

    return visibles.map((s) => {
      const suyos = porSwitch.get(s.id) || [];
      const ocupados = suyos.filter((p) => p.connectedAssetId).length;
      const capacidad = s.switchDev?.portCount ?? null;
      return {
        id: s.id,
        code: s.assetCode,
        modelo: s.model,
        estado: s.status,
        lugar: s.referencePlace,
        tren: ctx[s.id]?.trenCode ?? null,
        mgmtIp: undefined, // la IP de gestión NO viaja aquí: es dato sensible
        capacidad,
        // Igual que con los grabadores: si el switch no declara cuántos
        // puertos tiene, NO se inventa un número. Decir "quedan 12 libres"
        // sin saberlo hace que alguien planifique cámaras sobre una suposición.
        registrados: suyos.length,
        ocupados,
        libres: capacidad != null ? Math.max(0, capacidad - ocupados) : null,
        puertos: suyos.map((p) => ({
          id: p.id,
          numero: p.portNumber,
          poe: p.poe,
          vlan: p.vlanNumber,
          equipo: p.connectedAsset
            ? {
                id: p.connectedAssetId,
                code: p.connectedAsset.assetCode,
                tipo: p.connectedAsset.type,
                estado: p.connectedAsset.status,
                lugar: p.connectedAsset.referencePlace,
              }
            : null,
        })),
      };
    });
  }

  /** Enlaces declarados: fibra del anillo, radioenlaces. */
  async enlaces(userId?: string | null, tren?: string | null) {
    const filas = await this.prisma.networkLink.findMany({
      select: {
        id: true, medium: true, isRing: true, description: true,
        endpointAId: true, endpointBId: true,
        endpointA: { select: { assetCode: true, type: true, locationId: true } },
        endpointB: { select: { assetCode: true, type: true, locationId: true } },
      },
    });
    if (filas.length === 0) return [];

    const ids = [...new Set(filas.flatMap((f) => [f.endpointAId, f.endpointBId]))];
    const extremos = await this.prisma.asset.findMany({
      where: { id: { in: ids } },
      select: { id: true, locationId: true },
    });
    const ctx = await resolverContextoDePlanta(this.prisma, extremos as any);
    const ambito = await ambitoDelUsuario(this.prisma, userId);

    // Un enlace se ve si CUALQUIERA de sus extremos está en el ámbito: un
    // radioenlace entre el Tren 1 y el core le importa a los dos lados.
    // (Se llamaba `alcanza` y se renombró: ahora ese nombre es la función
    //  compartida de `ambito-usuario`, y una local con el mismo nombre la
    //  taparía justo donde hay que llamarla.)
    const entraEnAmbito = (id: string) => {
      const t = ctx[id]?.trenCode ?? null;
      if (!alcanza(ambito, t)) return false;
      if (tren && t !== tren.toUpperCase()) return false;
      return true;
    };

    return filas
      .filter((f) => entraEnAmbito(f.endpointAId) || entraEnAmbito(f.endpointBId))
      .map((f) => ({
        id: f.id,
        medio: f.medium as string,
        esAnillo: f.isRing,
        descripcion: f.description,
        a: { id: f.endpointAId, code: f.endpointA?.assetCode ?? '', tipo: f.endpointA?.type ?? null },
        b: { id: f.endpointBId, code: f.endpointB?.assetCode ?? '', tipo: f.endpointB?.type ?? null },
      }));
  }

  /**
   * Equipos que se pueden enchufar a un puerto: los que NO están ya en otro
   * puerto. `connectedAssetId` es único en la base, así que ofrecer uno ya
   * conectado terminaría en un error feo de clave duplicada; mejor no
   * ofrecerlo y explicar por qué no aparece.
   */
  async candidatos(texto?: string) {
    const t = texto?.trim();
    const ocupados = await this.prisma.switchPort.findMany({
      where: { connectedAssetId: { not: null } },
      select: { connectedAssetId: true },
    });
    const yaEnchufados = ocupados.map((o) => o.connectedAssetId as string);

    const libres = await this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['BAJA'] },
        id: { notIn: yaEnchufados.length ? yaEnchufados : ['-'] },
        ...(t
          ? {
              OR: [
                { assetCode: { contains: t, mode: 'insensitive' as const } },
                { model: { contains: t, mode: 'insensitive' as const } },
                { referencePlace: { contains: t, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: { id: true, assetCode: true, type: true, status: true, referencePlace: true },
      orderBy: { assetCode: 'asc' },
      take: 150,
    });
    return libres.map((a) => ({
      id: a.id, code: a.assetCode, tipo: a.type as string,
      estado: a.status as string, lugar: a.referencePlace,
    }));
  }

  /** Crear o actualizar un puerto y lo que cuelga de él. */
  async guardarPuerto(dto: {
    switchId: string; numero: number; connectedAssetId?: string | null;
    poe?: boolean; vlan?: number | null;
  }) {
    const sw = await this.prisma.asset.findFirst({
      where: { id: dto.switchId, deletedAt: null, type: 'SWITCH' },
      select: { id: true, assetCode: true, switchDev: { select: { portCount: true } } },
    });
    if (!sw) throw new NotFoundException('Ese switch no existe.');

    const numero = Number(dto.numero);
    if (!Number.isInteger(numero) || numero < 1) {
      throw new BadRequestException('El número de puerto tiene que ser un entero desde 1.');
    }
    const capacidad = sw.switchDev?.portCount ?? null;
    if (capacidad != null && capacidad > 0 && numero > capacidad) {
      throw new BadRequestException(
        `Este switch tiene ${capacidad} puertos registrados y estás usando el ${numero}. ` +
        `Si de verdad tiene más, corrige primero el número de puertos en su ficha.`,
      );
    }

    const equipoId = dto.connectedAssetId || null;
    if (equipoId) {
      if (equipoId === dto.switchId) {
        throw new BadRequestException('Un switch no se puede enchufar a sí mismo.');
      }
      const existe = await this.prisma.asset.findFirst({
        where: { id: equipoId, deletedAt: null },
        select: { id: true },
      });
      if (!existe) throw new BadRequestException('Ese equipo no existe.');

      // Un equipo sólo puede estar en UN puerto. Se comprueba antes para dar
      // un mensaje que diga DÓNDE está, en vez del error de clave duplicada.
      const enOtro = await this.prisma.switchPort.findFirst({
        where: { connectedAssetId: equipoId, NOT: { switchId: dto.switchId, portNumber: numero } },
        select: {
          portNumber: true,
          switchAsset: { select: { assetCode: true } },
        },
      });
      if (enOtro) {
        throw new BadRequestException(
          `Ese equipo ya está en el puerto ${enOtro.portNumber} de ${enOtro.switchAsset?.assetCode}. ` +
          `Quítalo de ahí primero.`,
        );
      }
    }

    await this.prisma.switchPort.upsert({
      where: { switchId_portNumber: { switchId: dto.switchId, portNumber: numero } },
      create: {
        switchId: dto.switchId, portNumber: numero,
        connectedAssetId: equipoId, poe: !!dto.poe,
        vlanNumber: dto.vlan == null ? null : Number(dto.vlan),
      },
      update: {
        connectedAssetId: equipoId, poe: !!dto.poe,
        vlanNumber: dto.vlan == null ? null : Number(dto.vlan),
      },
    });
    return { ok: true };
  }

  /** Vaciar un puerto. No borra el equipo: sólo lo desenchufa. */
  async vaciarPuerto(id: string) {
    const p = await this.prisma.switchPort.findUnique({ where: { id }, select: { id: true } });
    if (!p) throw new NotFoundException('Ese puerto ya no existe.');
    await this.prisma.switchPort.update({ where: { id }, data: { connectedAssetId: null } });
    return { ok: true };
  }
}
