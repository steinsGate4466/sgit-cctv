import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { tablerosAfectados, calcularImpacto, ColgadosDeSwitch, EquipoAlimentado } from './impacto-tablero';

/**
 * ELECTRICIDAD (bloque 18)
 * =============================================================================
 *
 *  POR QUÉ UN MÓDULO ELÉCTRICO EN UN SISTEMA DE CCTV
 *  --------------------------------------------------------------------------
 *  Porque la causa número uno de «se cayeron ocho cámaras de golpe» no es la
 *  red ni las cámaras: **saltó una llave**. Y hoy, cuando eso pasa, nadie
 *  puede contestar dos preguntas que deciden si el arreglo son diez minutos o
 *  tres horas:
 *
 *      «¿Qué se apagó cuando saltó el térmico 12 del MCC del T2?»
 *      «¿Qué llave le corta la luz a ESTA cámara?»
 *
 *  La segunda es la que más tiempo ahorra en campo: el técnico sube al
 *  manlift, y si no sabe qué breaker bajar, o trabaja con tensión —que no se
 *  hace— o baja a preguntar.
 *
 *  LA TABLA QUE HACE ÚTIL TODO LO DEMÁS es `AlimentacionActivo`: qué equipo
 *  cuelga de qué circuito. Sin ella esto sería un inventario de tableros, que
 *  ya existe en cualquier hoja de Excel y no le sirve a nadie.
 *
 *  EL DETALLE QUE SE OLVIDA SIEMPRE: **la cámara no cuelga del breaker**.
 *  Cuelga del switch PoE, que sí. Por eso `viaPoe` está marcado aparte: si no,
 *  alguien va a buscar un enchufe que no existe, o va a bajar la llave
 *  equivocada creyendo que corta la cámara.
 */
@Injectable()
export class ElectricidadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------------------- TABLEROS ---------------------------- */

  listarTableros(q: { tren?: string; texto?: string }) {
    const t = (q.texto || '').trim();
    return this.prisma.tableroElectrico.findMany({
      where: {
        ...(q.tren ? { tren: q.tren as any } : {}),
        ...(t ? {
          OR: [
            { codigo: { contains: t, mode: 'insensitive' } },
            { nombre: { contains: t, mode: 'insensitive' } },
            { referencia: { contains: t, mode: 'insensitive' } },
          ],
        } : {}),
      },
      orderBy: { codigo: 'asc' },
      include: {
        location: { select: { id: true, code: true, name: true, path: true } },
        _count: { select: { circuitos: true } },
      },
      take: 300,
    });
  }

  async detalleTablero(id: string) {
    const t = await this.prisma.tableroElectrico.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, code: true, name: true, path: true } },
        alimentadoDe: { select: { id: true, codigo: true, nombre: true } },
        alimenta: { select: { id: true, codigo: true, nombre: true } },
        circuitos: {
          orderBy: { numero: 'asc' },
          include: {
            alimenta: {
              include: { asset: { select: { id: true, assetCode: true, type: true, status: true } } },
            },
          },
        },
        mediciones: { orderBy: { fecha: 'desc' }, take: 20 },
        /* Lo que está atornillado DENTRO del tablero. Distinto de lo que
           alimenta: eso puede estar a cien metros. */
        equiposMontados: {
          where: { deletedAt: null },
          select: { id: true, assetCode: true, type: true, status: true, brand: true, model: true },
          orderBy: { assetCode: 'asc' },
        },
      },
    });
    if (!t) throw new NotFoundException('Ese tablero no existe.');

    // Cuántos equipos de CCTV dependen de este tablero, en total.
    const equiposCctv = t.circuitos.reduce((s, c) => s + c.alimenta.length, 0);
    return { ...t, equiposCctv };
  }

  async crearTablero(dto: any, userId?: string | null, ip?: string | null) {
    const codigo = String(dto.codigo || '').trim().toUpperCase();
    if (codigo.length < 3) throw new BadRequestException('El código del tablero es obligatorio.');
    const repetido = await this.prisma.tableroElectrico.findUnique({ where: { codigo }, select: { id: true } });
    if (repetido) throw new ConflictException(`Ya existe un tablero con el código ${codigo}.`);

    const t = await this.prisma.tableroElectrico.create({
      data: {
        codigo,
        nombre: String(dto.nombre || '').trim() || codigo,
        tipo: dto.tipo || 'DISTRIBUCION',
        locationId: dto.locationId || null,
        tren: dto.tren || null,
        referencia: dto.referencia?.trim() || null,
        comoLlegar: dto.comoLlegar?.trim() || null,
        tensionV: dto.tensionV ? Number(dto.tensionV) : null,
        fases: dto.fases ? Number(dto.fases) : null,
        corrienteNominalA: dto.corrienteNominalA ? Number(dto.corrienteNominalA) : null,
        alimentadoDeId: dto.alimentadoDeId || null,
        riesgos: dto.riesgos?.trim() || null,
        requierePermiso: dto.requierePermiso !== false,
        notas: dto.notas?.trim() || null,
        creadoPorId: userId || null,
      },
    });
    await this.audit.record({ userId, action: 'CREATE', entity: 'electricidad', entityId: t.id, ip, after: { codigo } });
    return t;
  }

  async editarTablero(id: string, dto: any, userId?: string | null, ip?: string | null) {
    const previo = await this.prisma.tableroElectrico.findUnique({ where: { id } });
    if (!previo) throw new NotFoundException('Ese tablero no existe.');
    const datos: any = {};
    for (const k of ['nombre', 'tipo', 'locationId', 'tren', 'referencia', 'comoLlegar', 'riesgos', 'notas', 'alimentadoDeId']) {
      if (dto[k] !== undefined) datos[k] = typeof dto[k] === 'string' ? (dto[k].trim() || null) : dto[k];
    }
    for (const k of ['tensionV', 'fases', 'corrienteNominalA']) {
      if (dto[k] !== undefined) datos[k] = dto[k] === '' || dto[k] === null ? null : Number(dto[k]);
    }
    if (dto.requierePermiso !== undefined) datos.requierePermiso = !!dto.requierePermiso;
    // Un tablero no puede alimentarse a sí mismo: sería un bucle infinito al
    // recorrer la cadena hacia arriba.
    if (datos.alimentadoDeId === id) throw new BadRequestException('Un tablero no puede alimentarse a sí mismo.');

    const t = await this.prisma.tableroElectrico.update({ where: { id }, data: datos });
    await this.audit.record({ userId, action: 'UPDATE', entity: 'electricidad', entityId: id, ip, after: { codigo: t.codigo } });
    return t;
  }

  /* ---------------------------- CIRCUITOS ---------------------------- */

  async crearCircuito(tableroId: string, dto: any, userId?: string | null, ip?: string | null) {
    const t = await this.prisma.tableroElectrico.findUnique({ where: { id: tableroId }, select: { id: true, codigo: true } });
    if (!t) throw new NotFoundException('Ese tablero no existe.');
    const numero = String(dto.numero || '').trim();
    if (!numero) throw new BadRequestException('El número del circuito es obligatorio: es como está rotulado en la puerta.');

    try {
      const c = await this.prisma.circuitoElectrico.create({
        data: {
          tableroId,
          numero,
          designacion: dto.designacion?.trim() || null,
          proteccion: dto.proteccion || 'TERMOMAGNETICO',
          amperajeA: dto.amperajeA ? Number(dto.amperajeA) : null,
          curva: dto.curva?.trim() || null,
          polos: dto.polos ? Number(dto.polos) : null,
          tensionV: dto.tensionV ? Number(dto.tensionV) : null,
          estado: dto.estado || 'ACTIVO',
          esCctv: !!dto.esCctv,
          notas: dto.notas?.trim() || null,
        },
      });
      await this.audit.record({ userId, action: 'CREATE', entity: 'electricidad', entityId: c.id, ip, after: { tablero: t.codigo, circuito: numero } });
      return c;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(`El circuito ${numero} ya está declarado en ${t.codigo}.`);
      }
      throw e;
    }
  }

  async editarCircuito(id: string, dto: any, userId?: string | null, ip?: string | null) {
    const previo = await this.prisma.circuitoElectrico.findUnique({ where: { id } });
    if (!previo) throw new NotFoundException('Ese circuito no existe.');
    const datos: any = {};
    for (const k of ['numero', 'designacion', 'proteccion', 'curva', 'estado', 'notas']) {
      if (dto[k] !== undefined) datos[k] = typeof dto[k] === 'string' ? (dto[k].trim() || null) : dto[k];
    }
    for (const k of ['amperajeA', 'polos', 'tensionV']) {
      if (dto[k] !== undefined) datos[k] = dto[k] === '' || dto[k] === null ? null : Number(dto[k]);
    }
    if (dto.esCctv !== undefined) datos.esCctv = !!dto.esCctv;
    const c = await this.prisma.circuitoElectrico.update({ where: { id }, data: datos });
    await this.audit.record({ userId, action: 'UPDATE', entity: 'electricidad', entityId: id, ip });
    return c;
  }

  /* -------------------- QUÉ CUELGA DE QUÉ LLAVE -------------------- */

  async colgarActivo(circuitoId: string, assetId: string, viaPoe: boolean, notas: string | undefined, userId?: string | null, ip?: string | null) {
    const [c, a] = await Promise.all([
      this.prisma.circuitoElectrico.findUnique({ where: { id: circuitoId }, select: { id: true, numero: true, tableroId: true } }),
      this.prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, assetCode: true, type: true } }),
    ]);
    if (!c) throw new NotFoundException('Ese circuito no existe.');
    if (!a) throw new NotFoundException('Ese activo no existe.');

    try {
      const r = await this.prisma.alimentacionActivo.create({
        data: { circuitoId, assetId, viaPoe: !!viaPoe, notas: notas?.trim() || null },
      });
      // Si se declara un equipo de CCTV, el circuito queda marcado como tal:
      // así el técnico de red lo encuentra filtrando, sin saber de tableros.
      await this.prisma.circuitoElectrico.update({ where: { id: circuitoId }, data: { esCctv: true } });
      await this.audit.record({
        userId, action: 'CREATE', entity: 'electricidad', entityId: r.id, ip,
        after: { circuito: c.numero, activo: a.assetCode, viaPoe: !!viaPoe },
      });
      return r;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Ese activo ya está colgado de este circuito.');
      throw e;
    }
  }

  async descolgarActivo(id: string, userId?: string | null, ip?: string | null) {
    const r = await this.prisma.alimentacionActivo.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Ese enlace no existe.');
    await this.prisma.alimentacionActivo.delete({ where: { id } });
    await this.audit.record({ userId, action: 'DELETE', entity: 'electricidad', entityId: id, ip });
    return { ok: true };
  }

  /**
   * SI SALTA ESTA LLAVE, ¿QUÉ SE APAGA?
   *
   * Cuenta lo que cuelga del circuito y, además, **lo que cuelga de los
   * equipos que cuelgan**: si el breaker alimenta un switch PoE, se van
   * también todas las cámaras de ese switch. Es la diferencia entre
   * «se apaga un switch» y «se apagan catorce cámaras», que es la respuesta
   * que hace falta a las tres de la mañana.
   */
  async impactoCircuito(circuitoId: string) {
    const c = await this.prisma.circuitoElectrico.findUnique({
      where: { id: circuitoId },
      include: {
        tablero: { select: { id: true, codigo: true, nombre: true } },
        alimenta: { include: { asset: { select: { id: true, assetCode: true, type: true, status: true } } } },
      },
    });
    if (!c) throw new NotFoundException('Ese circuito no existe.');

    const directos = c.alimenta.map((x) => ({
      id: x.asset.id, assetCode: x.asset.assetCode, tipo: x.asset.type as string,
      viaPoe: x.viaPoe, enlaceId: x.id,
    }));

    // Lo que cuelga de un switch alimentado por este circuito.
    const idsSwitch = directos.filter((d) => d.tipo === 'SWITCH').map((d) => d.id);
    let porSwitch: any[] = [];
    if (idsSwitch.length) {
      const puertos = await this.prisma.switchPort.findMany({
        where: { switchId: { in: idsSwitch }, connectedAssetId: { not: null } },
        select: {
          switchId: true,
          connectedAsset: { select: { id: true, assetCode: true, type: true } },
        },
      });
      porSwitch = puertos
        .filter((p) => p.connectedAsset)
        .map((p) => ({
          id: p.connectedAsset!.id, assetCode: p.connectedAsset!.assetCode,
          tipo: p.connectedAsset!.type as string, porSwitchId: p.switchId,
        }));
    }

    return {
      circuito: {
        id: c.id, numero: c.numero, designacion: c.designacion,
        amperajeA: c.amperajeA, proteccion: c.proteccion as string, estado: c.estado as string,
        tablero: c.tablero,
      },
      directos,
      indirectos: porSwitch,
      total: directos.length + porSwitch.length,
      // El aviso que evita el viaje en balde.
      aviso: porSwitch.length
        ? `Ojo: ${porSwitch.length} equipo(s) más se apagan porque cuelgan de un switch alimentado por este circuito.`
        : null,
    };
  }

  /** ¿QUÉ LLAVE LE CORTA LA LUZ A ESTE EQUIPO? La pregunta de campo. */
  async alimentacionDeActivo(assetId: string) {
    const filas = await this.prisma.alimentacionActivo.findMany({
      where: { assetId },
      include: {
        circuito: {
          include: { tablero: { select: { id: true, codigo: true, nombre: true, referencia: true, comoLlegar: true, requierePermiso: true, riesgos: true } } },
        },
      },
    });
    return filas.map((f) => ({
      enlaceId: f.id,
      viaPoe: f.viaPoe,
      circuito: {
        id: f.circuito.id, numero: f.circuito.numero, designacion: f.circuito.designacion,
        amperajeA: f.circuito.amperajeA, proteccion: f.circuito.proteccion as string,
      },
      tablero: f.circuito.tablero,
    }));
  }

  /* --------------------------- MEDICIONES --------------------------- */

  async anotarMedicion(dto: any, userId?: string | null, ip?: string | null) {
    if (!dto.circuitoId && !dto.tableroId) {
      throw new BadRequestException('Di de qué circuito o de qué tablero es la medición.');
    }
    const m = await this.prisma.medicionElectrica.create({
      data: {
        circuitoId: dto.circuitoId || null,
        tableroId: dto.tableroId || null,
        tensionV: dto.tensionV ? Number(dto.tensionV) : null,
        corrienteA: dto.corrienteA ? Number(dto.corrienteA) : null,
        temperaturaC: dto.temperaturaC ? Number(dto.temperaturaC) : null,
        observacion: dto.observacion?.trim() || null,
        medidoPorId: userId || null,
      },
    });
    await this.audit.record({ userId, action: 'CREATE', entity: 'electricidad', entityId: m.id, ip });
    return m;
  }

  /**
   * Tablero de electricidad: lo que hay que mirar hoy.
   *
   * El umbral de 60 °C no es un dato inventado de planta: es el criterio
   * habitual de termografía para bornes en baja tensión, donde por encima de
   * ~60 °C sobre ambiente se considera anomalía a corregir. Si en Aceros
   * Arequipa usan otro, se cambia aquí y en un solo sitio.
   */
  async resumen() {
    const [tableros, circuitos, cctv, sinAlimentacion, calientes] = await Promise.all([
      this.prisma.tableroElectrico.count(),
      this.prisma.circuitoElectrico.count(),
      this.prisma.circuitoElectrico.count({ where: { esCctv: true } }),
      this.prisma.asset.count({
        where: {
          deletedAt: null,
          type: { in: ['CAMERA', 'NVR', 'SWITCH', 'WIRELESS'] },
          alimentadoPor: { none: {} },
        },
      }),
      this.prisma.medicionElectrica.findMany({
        where: { temperaturaC: { gte: 60 } },
        orderBy: { fecha: 'desc' },
        take: 10,
        include: {
          circuito: { select: { numero: true, designacion: true, tablero: { select: { codigo: true } } } },
          tablero: { select: { codigo: true } },
        },
      }),
    ]);

    return {
      tableros,
      circuitos,
      circuitosCctv: cctv,
      /* Equipos de CCTV de los que NO se sabe de qué llave cuelgan. Es la
         lista de trabajo: cada uno es un equipo que, cuando falle por
         electricidad, va a costar horas encontrar. */
      sinAlimentacionDeclarada: sinAlimentacion,
      puntosCalientes: calientes.map((m) => ({
        id: m.id, fecha: m.fecha, temperaturaC: m.temperaturaC,
        donde: m.circuito
          ? `${m.circuito.tablero.codigo} · circuito ${m.circuito.numero}${m.circuito.designacion ? ` (${m.circuito.designacion})` : ''}`
          : m.tablero?.codigo ?? '—',
        observacion: m.observacion,
      })),
    };
  }
  /**
   * SI SE CAE ESTE TABLERO ENTERO, ¿QUÉ SE APAGA? (bloque 31)
   *
   * El impacto por CIRCUITO ya existía. Éste es el de arriba: el tablero
   * completo, arrastrando los que él alimenta aguas abajo — un dato que el
   * modelo guardaba desde el bloque 18 y que no usaba nadie.
   *
   * Cruza tres capas y las suma sin contar a nadie dos veces:
   *   1. lo colgado de sus circuitos,
   *   2. lo colgado de los tableros que él alimenta,
   *   3. lo que pierde la RED porque su switch se quedó sin luz.
   *
   * Y termina diciendo qué ZONAS VITALES quedan a ciegas, que es lo único que
   * a Producción le va a importar de todo esto.
   */
  async impactoTablero(tableroId: string) {
    const [tableros, enlaces] = await Promise.all([
      this.prisma.tableroElectrico.findMany({
        select: { id: true, codigo: true, nombre: true, alimentadoDeId: true },
      }),
      this.prisma.alimentacionActivo.findMany({
        select: {
          asset: { select: { id: true, assetCode: true, type: true, locationId: true, criticality: true } },
          circuito: { select: { tableroId: true } },
        },
      }),
    ]);

    const cadena = tablerosAfectados(tableroId, tableros);
    if (!cadena.length) throw new NotFoundException('Ese tablero no existe.');

    // El contexto de planta dice qué zona es vital. Se pide para TODOS los
    // activos alimentados, no sólo los del apagón: sale igual de caro y evita
    // una segunda consulta si mañana se amplía la vista.
    const activos = enlaces.map((e) => ({
      id: e.asset.id, criticality: e.asset.criticality, locationId: e.asset.locationId,
    }));
    const ctx = await resolverContextoDePlanta(this.prisma, activos);

    const alimentados: EquipoAlimentado[] = enlaces.map((e) => ({
      id: e.asset.id,
      assetCode: e.asset.assetCode,
      tipo: e.asset.type as string,
      tableroId: e.circuito.tableroId,
      zonaVital: ctx[e.asset.id]?.zonaVital ?? false,
      zonaNombre: ctx[e.asset.id]?.zonaCriticaNombre ?? null,
    }));

    // Lo que cuelga de cada switch, por si el switch se queda sin luz.
    const idsSwitch = alimentados.filter((a) => a.tipo === 'SWITCH').map((a) => a.id);
    const colgados: ColgadosDeSwitch = new Map();
    if (idsSwitch.length) {
      const puertos = await this.prisma.switchPort.findMany({
        where: { switchId: { in: idsSwitch }, connectedAssetId: { not: null } },
        select: {
          switchId: true,
          connectedAsset: { select: { id: true, assetCode: true, type: true, locationId: true, criticality: true } },
        },
      });
      const ctx2 = await resolverContextoDePlanta(
        this.prisma,
        puertos.filter((p) => p.connectedAsset).map((p) => ({
          id: p.connectedAsset!.id,
          criticality: p.connectedAsset!.criticality,
          locationId: p.connectedAsset!.locationId,
        })),
      );
      for (const p of puertos) {
        if (!p.connectedAsset) continue;
        const lista = colgados.get(p.switchId) ?? [];
        lista.push({
          id: p.connectedAsset.id,
          assetCode: p.connectedAsset.assetCode,
          tipo: p.connectedAsset.type as string,
          tableroId: '',           // no cuelga eléctricamente del tablero
          zonaVital: ctx2[p.connectedAsset.id]?.zonaVital ?? false,
          zonaNombre: ctx2[p.connectedAsset.id]?.zonaCriticaNombre ?? null,
        });
        colgados.set(p.switchId, lista);
      }
    }

    const impacto = calcularImpacto(cadena.map((t) => t.id), alimentados, colgados);
    return {
      tablero: cadena[0],
      cadena: cadena.slice(1),
      ...impacto,
    };
  }

}
