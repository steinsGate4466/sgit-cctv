import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { aNumero, aTexto, analizar, dentroDe, enPoolDhcp } from './red';

/**
 * DIRECCIONAMIENTO IP (IPAM) — bloque 20
 * =============================================================================
 *
 *  LA PREGUNTA QUE HOY NADIE PUEDE CONTESTAR
 *  --------------------------------------------------------------------------
 *      «Voy a instalar una cámara. ¿Qué IP le pongo?»
 *
 *  Hoy se contesta mirando un Excel desactualizado o, peor, haciendo ping y
 *  usando la que no responde. Eso funciona hasta el día que el equipo que la
 *  tenía estaba apagado por mantenimiento. Entonces hay dos equipos con la
 *  misma IP tumbándose entre ellos **a ratos**, que es el fallo más caro de
 *  diagnosticar que existe en una red: no falla siempre, así que nadie lo
 *  reproduce y todos culpan a la cámara.
 *
 * =============================================================================
 *  LA DECISIÓN DE DISEÑO: LA OCUPACIÓN NO SE LEE DE UNA SOLA TABLA
 * =============================================================================
 *  Un IPAM ingenuo guarda sus reservas y enseña eso. El problema es que la
 *  realidad no está ahí: está en `assets.ipAddress`, donde el técnico apuntó
 *  la IP que de verdad configuró en el equipo.
 *
 *  Así que la ocupación se calcula **cruzando las dos**, y las diferencias
 *  entre ellas no se esconden: se sacan a la luz como hallazgos.
 *
 *    · IP en un activo y sin reserva  -> «usada sin declarar»
 *    · reserva sin ningún activo      -> «reservada y sin usar»
 *    · dos activos con la misma IP    -> **DUPLICADA**, lo que rompe la red
 *    · IP fuera de toda subred        -> alguien inventó direccionamiento
 *    · estática dentro del pool DHCP  -> bomba de tiempo
 *
 *  Ese último merece explicación: si se configura una IP fija dentro del
 *  rango que reparte el DHCP, funciona hasta que el servidor se la entrega a
 *  otro equipo. Puede tardar semanas. Y cuando pasa, los dos equipos fallan a
 *  ratos y nadie relaciona la causa con una instalación de hace un mes.
 */
@Injectable()
export class IpamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------------------- SUBREDES ---------------------------- */

  async listarSubredes() {
    const subredes = await this.prisma.subred.findMany({
      orderBy: { cidr: 'asc' },
      include: {
        location: { select: { id: true, name: true } },
        _count: { select: { reservas: true } },
      },
    });

    // Una sola consulta para todos los activos con IP: nada de N+1.
    const activos = await this.prisma.asset.findMany({
      where: { deletedAt: null, ipAddress: { not: null } },
      select: { id: true, assetCode: true, ipAddress: true },
    });

    return subredes.map((s) => {
      const r = analizar(s.cidr);
      const dentro = activos.filter((a) => dentroDe(a.ipAddress!, s.cidr));
      const utiles = r?.utiles ?? 0;
      return {
        ...s,
        utiles,
        reservadas: s._count.reservas,
        enUsoReal: dentro.length,
        libres: Math.max(0, utiles - Math.max(s._count.reservas, dentro.length)),
        pctOcupada: utiles ? Math.round((Math.max(s._count.reservas, dentro.length) / utiles) * 100) : 0,
        rango: r ? { primera: aTexto(r.primera), ultima: aTexto(r.ultima) } : null,
      };
    });
  }

  async crearSubred(dto: any, userId?: string | null, ip?: string | null) {
    const cidr = String(dto.cidr || '').trim();
    const r = analizar(cidr);
    if (!r) throw new BadRequestException('CIDR no válido. Escríbelo así: 10.20.4.0/24');

    // Se guarda NORMALIZADO: si alguien escribe 10.20.4.14/24, se guarda
    // 10.20.4.0/24. Si no, la misma subred entraría dos veces con dos textos
    // distintos y el índice único no lo impediría.
    const normalizado = `${aTexto(r.red)}/${cidr.split('/')[1]}`;

    const repetida = await this.prisma.subred.findUnique({ where: { cidr: normalizado } });
    if (repetida) throw new ConflictException(`La subred ${normalizado} ya está declarada como "${repetida.nombre}".`);

    for (const campo of ['gateway', 'dns1', 'dns2', 'dhcpDesde', 'dhcpHasta']) {
      if (dto[campo] && aNumero(dto[campo]) === null) {
        throw new BadRequestException(`"${dto[campo]}" no es una dirección IPv4 válida (${campo}).`);
      }
    }
    if (dto.gateway && !dentroDe(dto.gateway, normalizado)) {
      throw new BadRequestException(`El gateway ${dto.gateway} no está dentro de ${normalizado}.`);
    }

    const s = await this.prisma.subred.create({
      data: {
        cidr: normalizado,
        nombre: String(dto.nombre || '').trim() || normalizado,
        proposito: dto.proposito || 'CCTV',
        vlan: dto.vlan ? Number(dto.vlan) : null,
        gateway: dto.gateway?.trim() || null,
        dns1: dto.dns1?.trim() || null,
        dns2: dto.dns2?.trim() || null,
        tren: dto.tren || null,
        locationId: dto.locationId || null,
        dhcpDesde: dto.dhcpDesde?.trim() || null,
        dhcpHasta: dto.dhcpHasta?.trim() || null,
        descripcion: dto.descripcion?.trim() || null,
        creadoPorId: userId || null,
      },
    });
    await this.audit.record({ userId, action: 'CREATE', entity: 'ipam', entityId: s.id, ip, after: { cidr: normalizado } });
    return s;
  }

  /**
   * EL MAPA DE LA SUBRED: dirección por dirección, quién la tiene.
   *
   * Se limita a /22 (1.022 direcciones). Dibujar un /16 son 65.534 filas que
   * ni el navegador ni la persona pueden leer, y la consulta tardaría más que
   * la respuesta que se busca.
   */
  async mapa(id: string) {
    const s = await this.prisma.subred.findUnique({
      where: { id },
      include: { reservas: { include: { asset: { select: { id: true, assetCode: true, type: true } } } } },
    });
    if (!s) throw new NotFoundException('Esa subred no existe.');

    const r = analizar(s.cidr);
    if (!r) throw new BadRequestException('El CIDR guardado no es válido.');
    if (r.utiles > 1024) {
      throw new BadRequestException(
        `Esta subred tiene ${r.utiles} direcciones. El mapa se dibuja hasta 1.024: ` +
        'por encima de eso no hay pantalla ni persona que lo lea. Usa el buscador.',
      );
    }

    const activos = await this.prisma.asset.findMany({
      where: { deletedAt: null, ipAddress: { not: null } },
      select: { id: true, assetCode: true, type: true, ipAddress: true, status: true },
    });
    const porIp = new Map<string, typeof activos>();
    for (const a of activos) {
      const k = (a.ipAddress || '').trim();
      porIp.set(k, [...(porIp.get(k) ?? []), a]);
    }
    const reservaPorIp = new Map(s.reservas.map((x) => [x.ip, x]));

    const filas: any[] = [];
    for (let n = r.primera; n <= r.ultima; n++) {
      const ip = aTexto(n);
      const usados = porIp.get(ip) ?? [];
      const reserva = reservaPorIp.get(ip);
      const esGateway = s.gateway === ip;
      const enDhcp = enPoolDhcp(ip, s.dhcpDesde, s.dhcpHasta);

      filas.push({
        ip,
        estado: esGateway ? 'GATEWAY'
          : usados.length > 1 ? 'DUPLICADA'
          : usados.length === 1 ? 'EN_USO'
          : reserva ? 'RESERVADA'
          : enDhcp ? 'POOL_DHCP'
          : 'LIBRE',
        enDhcp,
        activos: usados.map((a) => ({ id: a.id, assetCode: a.assetCode, tipo: a.type as string, estado: a.status as string })),
        reserva: reserva
          ? { id: reserva.id, tipo: reserva.tipo as string, hostname: reserva.hostname, descripcion: reserva.descripcion, mac: reserva.mac }
          : null,
      });
    }

    return { subred: { ...s, rango: { primera: aTexto(r.primera), ultima: aTexto(r.ultima), utiles: r.utiles } }, filas };
  }

  /**
   * LA SIGUIENTE IP LIBRE. La respuesta a «¿qué IP le pongo?».
   *
   * Salta el gateway, lo reservado, lo que ya está en uso según los activos, y
   * —esto es lo importante— **el rango del DHCP**. Sugerir una del pool sería
   * plantar la bomba de tiempo que este módulo existe para evitar.
   */
  async siguienteLibre(id: string, cuantas = 1) {
    const s = await this.prisma.subred.findUnique({ where: { id }, include: { reservas: { select: { ip: true } } } });
    if (!s) throw new NotFoundException('Esa subred no existe.');
    const r = analizar(s.cidr);
    if (!r) throw new BadRequestException('El CIDR guardado no es válido.');

    const activos = await this.prisma.asset.findMany({
      where: { deletedAt: null, ipAddress: { not: null } },
      select: { ipAddress: true },
    });
    const ocupadas = new Set<string>([
      ...s.reservas.map((x) => x.ip),
      ...activos.map((a) => (a.ipAddress || '').trim()),
    ]);
    if (s.gateway) ocupadas.add(s.gateway);

    const libres: string[] = [];
    for (let n = r.primera; n <= r.ultima && libres.length < Math.min(cuantas, 50); n++) {
      const ip = aTexto(n);
      if (ocupadas.has(ip)) continue;
      if (enPoolDhcp(ip, s.dhcpDesde, s.dhcpHasta)) continue;
      libres.push(ip);
    }

    return {
      subred: s.cidr,
      libres,
      // Se dice POR QUÉ no hay, en vez de devolver una lista vacía sin más.
      aviso: libres.length === 0
        ? 'No queda ninguna dirección libre fuera del rango del DHCP. Amplía la subred o revisa las reservas sin usar.'
        : null,
    };
  }

  /* -------------------------- LOS HALLAZGOS -------------------------- */

  /**
   * LO QUE ESTÁ MAL EN EL DIRECCIONAMIENTO, ORDENADO POR GRAVEDAD.
   * Es la pantalla que abre el técnico de redes cuando algo va raro.
   */
  async hallazgos() {
    const [subredes, activos, reservas] = await Promise.all([
      this.prisma.subred.findMany({ where: { activa: true } }),
      this.prisma.asset.findMany({
        where: { deletedAt: null, ipAddress: { not: null } },
        select: { id: true, assetCode: true, type: true, ipAddress: true },
      }),
      this.prisma.reservaIp.findMany({ select: { id: true, ip: true, assetId: true, descripcion: true } }),
    ]);

    // 1. DUPLICADAS. La que rompe la red.
    const porIp = new Map<string, typeof activos>();
    for (const a of activos) {
      const k = (a.ipAddress || '').trim();
      if (!k) continue;
      porIp.set(k, [...(porIp.get(k) ?? []), a]);
    }
    const duplicadas = [...porIp.entries()]
      .filter(([, l]) => l.length > 1)
      .map(([ip, l]) => ({ ip, equipos: l.map((a) => a.assetCode) }));

    // 2. Estáticas dentro del pool del DHCP. La bomba de tiempo.
    const enPool: any[] = [];
    // 3. IP que no cae en ninguna subred declarada.
    const fueraDeSubred: any[] = [];
    for (const a of activos) {
      const ip = (a.ipAddress || '').trim();
      if (!ip || aNumero(ip) === null) continue;
      const suya = subredes.find((s) => dentroDe(ip, s.cidr));
      if (!suya) { fueraDeSubred.push({ ip, assetCode: a.assetCode }); continue; }
      if (enPoolDhcp(ip, suya.dhcpDesde, suya.dhcpHasta)) {
        enPool.push({ ip, assetCode: a.assetCode, subred: suya.cidr });
      }
    }

    // 4. Usadas y sin declarar.
    const declaradas = new Set(reservas.map((r) => r.ip));
    const sinDeclarar = activos
      .filter((a) => a.ipAddress && !declaradas.has(a.ipAddress.trim()))
      .map((a) => ({ ip: a.ipAddress, assetCode: a.assetCode }));

    // 5. Reservadas y sin usar. No es grave: es limpieza.
    const enUso = new Set(activos.map((a) => (a.ipAddress || '').trim()));
    const reservadasSinUso = reservas
      .filter((r) => !enUso.has(r.ip) && !r.assetId)
      .map((r) => ({ ip: r.ip, descripcion: r.descripcion }));

    // 6. IP mal escrita en la ficha del activo.
    const invalidas = activos
      .filter((a) => a.ipAddress && aNumero(a.ipAddress.trim()) === null)
      .map((a) => ({ ip: a.ipAddress, assetCode: a.assetCode }));

    return {
      duplicadas,
      enPoolDhcp: enPool,
      fueraDeSubred,
      sinDeclarar,
      reservadasSinUso,
      invalidas,
      graves: duplicadas.length + enPool.length + invalidas.length,
    };
  }

  /* --------------------------- RESERVAS --------------------------- */

  async reservar(dto: any, userId?: string | null, ipOrigen?: string | null) {
    const ip = String(dto.ip || '').trim();
    if (aNumero(ip) === null) throw new BadRequestException(`"${ip}" no es una dirección IPv4 válida.`);

    const repetida = await this.prisma.reservaIp.findUnique({
      where: { ip }, include: { asset: { select: { assetCode: true } } },
    });
    if (repetida) {
      throw new ConflictException(
        `La IP ${ip} ya está reservada${repetida.asset ? ` para ${repetida.asset.assetCode}` : ''}` +
        `${repetida.descripcion ? ` (${repetida.descripcion})` : ''}.`,
      );
    }

    // Se busca su subred sola: pedírsela al usuario es pedirle que haga una
    // cuenta que el sistema puede hacer.
    const subredes = await this.prisma.subred.findMany({ where: { activa: true } });
    const suya = subredes.find((s) => dentroDe(ip, s.cidr));

    const avisos: string[] = [];
    if (!suya) {
      avisos.push('Esta IP no cae en ninguna subred declarada. Declara la subred o revisa la dirección.');
    } else if (enPoolDhcp(ip, suya.dhcpDesde, suya.dhcpHasta)) {
      avisos.push(
        `Esta IP está DENTRO del rango que reparte el DHCP de ${suya.cidr}. ` +
        'Si se configura fija, el servidor puede dársela a otro equipo y los dos fallarán a ratos.',
      );
    }

    const r = await this.prisma.reservaIp.create({
      data: {
        ip,
        subredId: suya?.id ?? null,
        tipo: dto.tipo || 'ESTATICA',
        assetId: dto.assetId || null,
        hostname: dto.hostname?.trim() || null,
        mac: dto.mac?.trim().toUpperCase() || null,
        descripcion: dto.descripcion?.trim() || null,
        notas: dto.notas?.trim() || null,
        creadoPorId: userId || null,
      },
    });
    await this.audit.record({ userId, action: 'CREATE', entity: 'ipam', entityId: r.id, ip: ipOrigen, after: { ip, subred: suya?.cidr } });
    return { ...r, avisos };
  }

  async liberar(id: string, userId?: string | null, ip?: string | null) {
    const r = await this.prisma.reservaIp.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Esa reserva no existe.');
    await this.prisma.reservaIp.delete({ where: { id } });
    await this.audit.record({ userId, action: 'DELETE', entity: 'ipam', entityId: id, ip, before: { ip: r.ip } });
    return { ok: true, ip: r.ip };
  }

  /** Buscar una IP concreta: «¿de quién es la 10.20.4.87?» */
  async buscar(q: string) {
    const texto = String(q || '').trim();
    if (!texto) return { activos: [], reservas: [] };
    const [activos, reservas] = await Promise.all([
      this.prisma.asset.findMany({
        where: { deletedAt: null, ipAddress: { contains: texto } },
        select: { id: true, assetCode: true, type: true, ipAddress: true, status: true, location: { select: { name: true } } },
        take: 30,
      }),
      this.prisma.reservaIp.findMany({
        where: { OR: [{ ip: { contains: texto } }, { hostname: { contains: texto, mode: 'insensitive' } }] },
        include: { asset: { select: { assetCode: true } }, subred: { select: { cidr: true, nombre: true } } },
        take: 30,
      }),
    ]);
    return { activos, reservas };
  }
}
