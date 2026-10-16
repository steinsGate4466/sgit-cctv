import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetType } from '../../generated/prisma/client';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { alcanza, ambitoDelUsuario, noVeNada, veTodo } from '../../common/ambito-usuario';
import {
  NO_VAN_A_UN_PUERTO, avisoDelPuerto, esEnlace, exigirPoeDisponible, validarCapacidad, vlanValida,
} from './reglas-de-puerto';

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
        switchDev: {
          select: {
            portCount: true, poePorts: true, poeBudgetW: true, vendor: true,
            switchRole: true, capa: true, gestionable: true, soportaVlan: true,
          },
        },
      },
      orderBy: { assetCode: 'asc' },
    });
    if (equipos.length === 0) return [];

    const ctx = await resolverContextoDePlanta(this.prisma, equipos);
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
        connectedAsset: { select: { assetCode: true, type: true, status: true, referencePlace: true, model: true } },
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
      const d = s.switchDev;
      return {
        id: s.id,
        code: s.assetCode,
        modelo: s.model,
        estado: s.status,
        lugar: s.referencePlace,
        tren: ctx[s.id]?.trenCode ?? null,
        /* Bloque 173 · lo que decide cómo se configura un puerto: si da
           corriente (y cuántos), si se puede entrar a configurarlo y si
           segmenta en VLAN. Sin esto la rejilla no puede decir «este switch
           no tiene VLAN, no la pongas». */
        poePuertos: d?.poePorts ?? null,
        poeUsados: suyos.filter((p) => p.poe).length,
        poePresupuestoW: d?.poeBudgetW ?? null,
        fabricante: d?.vendor ?? null,
        rol: d?.switchRole ?? null,
        capa: d?.capa ?? null,
        gestionable: d?.gestionable ?? null,
        soportaVlan: d?.soportaVlan ?? null,
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
          /* Un switch, router o firewall en el puerto = enlace entre equipos
             de red (subida/troncal). Cuando cae, cae todo lo de detrás. */
          enlace: esEnlace(p.connectedAsset?.type),
          aviso: avisoDelPuerto({ poe: p.poe, tipoEquipo: p.connectedAsset?.type ?? null }),
          equipo: p.connectedAsset
            ? {
                id: p.connectedAssetId,
                code: p.connectedAsset.assetCode,
                tipo: p.connectedAsset.type,
                estado: p.connectedAsset.status,
                lugar: p.connectedAsset.referencePlace,
                modelo: p.connectedAsset.model,
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
    const ctx = await resolverContextoDePlanta(this.prisma, extremos);
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
   *
   * Bloque 173 · ofrecía TODO: gabinetes, tableros, pantallas, fuentes, el
   * propio switch, equipos en almacén y los de otros trenes. Ahora:
   *   · fuera lo que no tiene puerto de red (`NO_VAN_A_UN_PUERTO`) y lo de STOCK;
   *   · fuera el propio switch;
   *   · con ámbito: un técnico del Tren 2 no enchufa equipos del Tren 1;
   *   · los del MISMO tren que el switch van primero (`mismoTren`).
   */
  async candidatos(texto?: string, switchId?: string | null, userId?: string | null) {
    const t = texto?.trim();
    const ocupados = await this.prisma.switchPort.findMany({
      where: { connectedAssetId: { not: null } },
      select: { connectedAssetId: true },
    });
    const yaEnchufados = ocupados.map((o) => o.connectedAssetId as string);
    if (switchId) yaEnchufados.push(switchId);

    const libres = await this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['BAJA', 'STOCK'] },
        type: { notIn: NO_VAN_A_UN_PUERTO as AssetType[] },
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
      select: { id: true, assetCode: true, type: true, status: true, referencePlace: true, locationId: true },
      orderBy: { assetCode: 'asc' },
      take: 300,
    });

    const sw = switchId
      ? await this.prisma.asset.findFirst({ where: { id: switchId }, select: { id: true, locationId: true } })
      : null;
    const ctx = await resolverContextoDePlanta(this.prisma, sw ? [...libres, sw] : libres);
    const ambito = await ambitoDelUsuario(this.prisma, userId);
    if (noVeNada(ambito)) return [];
    const trenSw = sw ? ctx[sw.id]?.trenCode ?? null : null;

    return libres
      .filter((a) => alcanza(ambito, ctx[a.id]?.trenCode ?? null))
      .map((a) => {
        const tren = ctx[a.id]?.trenCode ?? null;
        return {
          id: a.id, code: a.assetCode, tipo: a.type as string,
          estado: a.status as string, lugar: a.referencePlace,
          tren,
          mismoTren: !!trenSw && tren === trenSw,
          enlace: esEnlace(a.type),
        };
      })
      .sort((x, y) => Number(y.mismoTren) - Number(x.mismoTren))
      .slice(0, 150);
  }

  /** El switch, comprobando que existe y que es del ámbito de quien escribe. */
  private async switchDelAmbito(switchId: string, userId?: string | null) {
    const sw = await this.prisma.asset.findFirst({
      where: { id: switchId, deletedAt: null, type: 'SWITCH' },
      select: {
        id: true, assetCode: true, locationId: true,
        switchDev: { select: { portCount: true, poePorts: true, soportaVlan: true } },
      },
    });
    if (!sw) throw new NotFoundException('Ese switch no existe.');
    const ambito = await ambitoDelUsuario(this.prisma, userId);
    if (!veTodo(ambito)) {
      const ctx = await resolverContextoDePlanta(this.prisma, [sw]);
      // 404 y no 403: un 403 confirma que el switch existe (bloque 12.3).
      if (noVeNada(ambito) || !alcanza(ambito, ctx[sw.id]?.trenCode ?? null)) {
        throw new NotFoundException('Ese switch no existe.');
      }
    }
    return sw;
  }

  /**
   * Crear o actualizar un puerto y lo que cuelga de él.
   *
   * Bloque 173 · además de lo de siempre:
   *   · VLAN en 1–4094, y si la ficha dice que el switch NO segmenta, no se
   *     guarda una VLAN que el equipo no puede tener;
   *   · PoE contra los puertos PoE de la ficha;
   *   · el switch tiene que ser del ámbito de quien escribe;
   *   · y se SINCRONIZA la ficha del equipo: una cámara en un puerto PoE queda
   *     con «puerto que la alimenta» puesto, y una antena con su puerto. Antes
   *     ese dato se pedía en la ficha y no había dónde rellenarlo: era la
   *     misma conexión contada en dos sitios, y sólo uno se podía escribir.
   */
  async guardarPuerto(dto: {
    switchId: string; numero: number; connectedAssetId?: string | null;
    poe?: boolean; vlan?: number | null;
  }, userId?: string | null) {
    const sw = await this.switchDelAmbito(dto.switchId, userId);

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

    const vlan = vlanValida(dto.vlan);
    if (vlan != null && sw.switchDev?.soportaVlan === false) {
      throw new BadRequestException(
        `La ficha de ${sw.assetCode} dice que no admite VLAN: es un switch plano y todo lo que cuelga comparte la misma red. ` +
        'Deja la VLAN vacía, o corrige la ficha si sí la admite.',
      );
    }

    const poe = !!dto.poe;
    const poeEnOtros = await this.prisma.switchPort.count({
      where: { switchId: sw.id, poe: true, NOT: { portNumber: numero } },
    });
    exigirPoeDisponible({ marcarPoe: poe, poeMarcadosEnOtros: poeEnOtros, poePorts: sw.switchDev?.poePorts, switchCode: sw.assetCode });

    const equipoId = dto.connectedAssetId || null;
    let tipoEquipo: string | null = null;
    if (equipoId) {
      if (equipoId === dto.switchId) {
        throw new BadRequestException('Un switch no se puede enchufar a sí mismo.');
      }
      const existe = await this.prisma.asset.findFirst({
        where: { id: equipoId, deletedAt: null },
        select: { id: true, type: true, assetCode: true },
      });
      if (!existe) throw new BadRequestException('Ese equipo no existe.');
      if (NO_VAN_A_UN_PUERTO.includes(existe.type)) {
        throw new BadRequestException(
          `${existe.assetCode} no tiene puerto de red: un gabinete, un tablero, una pantalla o una fuente no se enchufan a un switch.`,
        );
      }
      tipoEquipo = existe.type;

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

    await this.prisma.$transaction(async (tx) => {
      const puerto = await tx.switchPort.upsert({
        where: { switchId_portNumber: { switchId: dto.switchId, portNumber: numero } },
        create: {
          switchId: dto.switchId, portNumber: numero,
          connectedAssetId: equipoId, poe, vlanNumber: vlan,
        },
        update: { connectedAssetId: equipoId, poe, vlanNumber: vlan },
        select: { id: true },
      });
      await this.sincronizarFicha(tx, puerto.id, equipoId, tipoEquipo, poe);
    });
    return { ok: true };
  }

  /**
   * La ficha de la cámara y de la antena guarda «en qué puerto está» y «qué
   * puerto la alimenta». Se escriben AQUÍ, desde el puerto, que es la única
   * puerta (bloque 173). Primero se suelta lo que apuntaba a este puerto
   * (el equipo de antes), luego se ata el de ahora.
   */
  private async sincronizarFicha(
    tx: any, puertoId: string, equipoId: string | null, tipo: string | null, poe: boolean,
  ) {
    await tx.assetCamera.updateMany({
      where: { switchPortId: puertoId, ...(equipoId ? { NOT: { assetId: equipoId } } : {}) },
      data: { switchPortId: null },
    });
    await tx.assetCamera.updateMany({
      where: { poeSourcePortId: puertoId, ...(equipoId ? { NOT: { assetId: equipoId } } : {}) },
      data: { poeSourcePortId: null },
    });
    await tx.assetWireless.updateMany({
      where: { switchPortId: puertoId, ...(equipoId ? { NOT: { assetId: equipoId } } : {}) },
      data: { switchPortId: null },
    });
    if (!equipoId) return;
    if (tipo === 'CAMERA') {
      await tx.assetCamera.updateMany({
        where: { assetId: equipoId },
        data: { switchPortId: puertoId, ...(poe ? { poeSourcePortId: puertoId } : {}) },
      });
      if (!poe) {
        await tx.assetCamera.updateMany({
          where: { assetId: equipoId, poeSourcePortId: puertoId },
          data: { poeSourcePortId: null },
        });
      }
    } else if (tipo === 'WIRELESS') {
      await tx.assetWireless.updateMany({ where: { assetId: equipoId }, data: { switchPortId: puertoId } });
    }
  }

  /**
   * Bloque 173 · DECLARAR LOS PUERTOS DESDE AQUÍ. Un switch sin «cantidad de
   * puertos» salía en Conexiones sin rejilla y con un aviso que mandaba a otra
   * pantalla. Ahora se declara en el mismo sitio donde hace falta, con lo que
   * se lee en la etiqueta del frontal. No toca nada más de la ficha.
   */
  async declararPuertos(switchId: string, body: { puertos?: unknown; poe?: unknown }, userId?: string | null) {
    const sw = await this.switchDelAmbito(switchId, userId);
    const mayor = await this.prisma.switchPort.aggregate({
      where: { switchId: sw.id, connectedAssetId: { not: null } },
      _max: { portNumber: true },
    });
    const { portCount, poePorts } = validarCapacidad({
      puertos: body.puertos, poe: body.poe, mayorRegistrado: mayor._max.portNumber ?? 0,
    });
    if (poePorts != null) {
      const marcados = await this.prisma.switchPort.count({ where: { switchId: sw.id, poe: true } });
      if (marcados > poePorts) {
        throw new BadRequestException(
          `Hay ${marcados} puertos marcados con PoE: no pueden ser ${poePorts}. Desmarca primero los que no dan corriente.`,
        );
      }
    }
    await this.prisma.assetSwitch.upsert({
      where: { assetId: sw.id },
      create: { assetId: sw.id, portCount, ...(poePorts != null ? { poePorts } : {}) },
      update: { portCount, ...(poePorts != null ? { poePorts } : {}) },
    });
    return { ok: true, portCount, poePorts };
  }

  /** Vaciar un puerto. No borra el equipo: sólo lo desenchufa. */
  async vaciarPuerto(id: string, userId?: string | null) {
    const p = await this.prisma.switchPort.findUnique({ where: { id }, select: { id: true, switchId: true } });
    if (!p) throw new NotFoundException('Ese puerto ya no existe.');
    await this.switchDelAmbito(p.switchId, userId);
    /* La VLAN y el PoE SE QUEDAN: son la configuración del puerto, no del
       equipo. Desenchufar una cámara no cambia la VLAN del puerto en el
       switch, y borrarla aquí haría que la pantalla dijera otra cosa. */
    await this.prisma.$transaction(async (tx) => {
      await tx.switchPort.update({ where: { id }, data: { connectedAssetId: null } });
      await this.sincronizarFicha(tx, id, null, null, false);
    });
    return { ok: true };
  }
}
