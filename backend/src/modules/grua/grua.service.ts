import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { perfilDeSeguridadEn } from '../../common/seguridad-de-planta';
import { PrismaService } from '../../prisma/prisma.service';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { alcanza, ambitoDelUsuario, noVeNada } from '../../common/ambito-usuario';
import { CrearInspeccionGruaDto } from './dto/inspeccion-grua.dto';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { actividadDeLaOm, decidirOmDeInspeccion } from './om-de-inspeccion';

/**
 * INSPECCIÓN DE CÁMARAS DE GRÚA (bloque 14).
 *
 * Una cámara de grúa falla por tres cosas que ninguna otra cámara tiene: el
 * cable se fatiga en la cadena portacables, la antena se desalinea con el
 * movimiento, y no se llega sin manlift. Ver el comentario largo del modelo
 * en schema.prisma.
 *
 * La consecuencia práctica: **subir cuesta caro, así que se sube UNA vez y
 * se revisa TODO**. Por eso el formulario es largo, y por eso este servicio
 * no deja cerrar una inspección a medias sin decirlo.
 */
@Injectable()
export class GruaService {
  constructor(
    private readonly prisma: PrismaService,
    /* Bloque 140: el hallazgo abre la orden. Se usa el MISMO alta que el
       formulario de Órdenes, con su código y su fecha, no un atajo. */
    private readonly ordenes: MaintenanceService,
  ) {}

  /** Código correlativo por año: GRU-2026-0001. */
  /**
   * «CÁMARA INSPECCIONADA» — bloque 172.
   *
   * El desplegable traía TODAS las cámaras de la planta (las del horno, las del
   * púlpito…) para una inspección que es sólo de cámaras montadas en grúa. Se
   * marca `enGrua` a la que lo es por algo DECLARADO, no por adivinar:
   *   · cuelga de la ubicación de grúas (tren «Grúas» / código …-GRU);
   *   · su medio de acceso declarado es GRUA;
   *   · ya tiene una inspección de grúa.
   * Las demás se devuelven aparte para que la pantalla las ponga en su propio
   * grupo («Otras cámaras»): si una cámara de grúa todavía no está declarada
   * así, no se bloquea el trabajo — se ve que es la excepción.
   */
  async camarasElegibles(userId?: string | null) {
    const ambito = await ambitoDelUsuario(this.prisma, userId);
    if (noVeNada(ambito)) return [];
    const [camaras, nodos, inspeccionadas] = await Promise.all([
      this.prisma.asset.findMany({
        where: { type: 'CAMERA', deletedAt: null, status: { notIn: ['BAJA'] } },
        select: { id: true, assetCode: true, referencePlace: true, locationId: true, medioAcceso: true },
        orderBy: { assetCode: 'asc' },
      }),
      this.prisma.location.findMany({ select: { id: true, parentId: true, type: true, code: true, name: true } }),
      // Una fila por CÁMARA (no por inspección): acotado por el número de cámaras.
      this.prisma.inspeccionGrua.groupBy({ by: ['assetId'] }),
    ]);
    const porId = new Map(nodos.map((n) => [n.id, n]));
    const trenDe = (id: string | null) => {
      for (let n = id ? porId.get(id) : undefined, i = 0; n && i < 20; n = n.parentId ? porId.get(n.parentId) : undefined, i++) {
        if (n.type === 'TREN') return n;
      }
      return null;
    };
    const conInspeccion = new Set(inspeccionadas.map((x) => x.assetId));
    return camaras
      .map((c) => {
        const t = trenDe(c.locationId);
        const enGrua = !!(t && (/-GRU$/i.test(t.code) || /gr[uú]a/i.test(t.name)))
          || c.medioAcceso === 'GRUA' || conInspeccion.has(c.id);
        return { id: c.id, assetCode: c.assetCode, referencePlace: c.referencePlace, enGrua, tren: t?.code ?? null };
      })
      .filter((c) => alcanza(ambito, c.tren));
  }

  private async siguienteCodigo(): Promise<string> {
    const anio = new Date().getFullYear();
    const ultima = await this.prisma.inspeccionGrua.findFirst({
      where: { code: { startsWith: `GRU-${anio}-` } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const n = ultima ? Number(ultima.code.split('-')[2] || 0) + 1 : 1;
    return `GRU-${anio}-${String(n).padStart(4, '0')}`;
  }

  async lista(userId?: string | null, tren?: string | null, grua?: string) {
    const filas = await this.prisma.inspeccionGrua.findMany({
      where: grua?.trim() ? { grua: { contains: grua.trim(), mode: 'insensitive' } } : {},
      select: {
        id: true, code: true, grua: true, posicionEnGrua: true, fecha: true,
        resultado: true, requiereManlift: true, requiereSeguimiento: true,
        senalDbm: true, senalDbmAnterior: true, assetId: true,
        camaraEstado: true, antenaEstado: true, cableEstado: true,
        asset: { select: { assetCode: true, status: true, locationId: true } },
        inspeccionadoPor: { select: { fullName: true } },
        // Bloque 140: la orden que abrió (o a la que se enlazó).
        workOrder: { select: { code: true } },
      },
      orderBy: { fecha: 'desc' },
      take: 200,
    });
    if (filas.length === 0) return [];

    const activos = filas.map((f) => ({ id: f.assetId, locationId: f.asset?.locationId ?? null }));
    const ctx = await resolverContextoDePlanta(this.prisma, activos);
    const ambito = await ambitoDelUsuario(this.prisma, userId);
    // Bloque 42: rol sectorizado sin tren asignado -> ni una fila.
    if (noVeNada(ambito)) return [];

    return filas
      .filter((f) => {
        const t = ctx[f.assetId]?.trenCode ?? null;
        if (!alcanza(ambito, t)) return false;
        if (tren && t !== tren.toUpperCase()) return false;
        return true;
      })
      .map((f) => ({
        id: f.id,
        code: f.code,
        grua: f.grua,
        posicion: f.posicionEnGrua,
        equipo: f.asset?.assetCode ?? null,
        assetId: f.assetId,
        om: f.workOrder?.code ?? null,
        estadoEquipo: f.asset?.status ?? null,
        tren: ctx[f.assetId]?.trenCode ?? null,
        fecha: f.fecha,
        resultado: f.resultado as string,
        requiereManlift: f.requiereManlift,
        requiereSeguimiento: f.requiereSeguimiento,
        senalDbm: f.senalDbm,
        // La DERIVA es el dato que importa, no la señal suelta. -70 puede ser
        // normal en un enlace largo; -70 cuando el mes pasado era -50 es una
        // antena que se está moviendo, y eso se ve venir.
        deriva: f.senalDbm != null && f.senalDbmAnterior != null
          ? f.senalDbm - f.senalDbmAnterior
          : null,
        // Se resume en un solo número lo que hay que volver a mirar.
        pendientes: [f.camaraEstado, f.antenaEstado, f.cableEstado]
          .filter((e) => e === 'OBSERVADO' || e === 'NO_CONFORME').length,
        inspector: f.inspeccionadoPor?.fullName ?? null,
      }));
  }

  async detalle(id: string) {
    const f = await this.prisma.inspeccionGrua.findUnique({
      where: { id },
      include: {
        asset: { select: { assetCode: true, status: true, referencePlace: true } },
        inspeccionadoPor: { select: { fullName: true } },
        workOrder: { select: { code: true } },
      },
    });
    if (!f) throw new NotFoundException('Esa inspección no existe.');
    return f;
  }

  /** Historial de una cámara concreta: es donde se ve la fatiga del cable. */
  async historial(assetId: string) {
    return this.prisma.inspeccionGrua.findMany({
      where: { assetId },
      select: {
        id: true, code: true, fecha: true, resultado: true, senalDbm: true,
        cableEstado: true, chicoteDanado: true, antenaEstado: true, hallazgos: true,
      },
      orderBy: { fecha: 'desc' },
      take: 30,
    });
  }

  /**
   * EL FORMULARIO YA RELLENADO — bloque 168.
   *
   * «Formularios que no se autocompletan y dejan a criterio técnico.» La
   * inspección de grúa pedía cada vez el nombre de la grúa, la posición, la
   * altura, si hace falta manlift o parar la grúa, el canal del grabador… que
   * ya estaban en la inspección anterior, en el acceso declarado del equipo
   * (bloque 41), en su ficha de cámara y en su perfil de seguridad. Aquí se
   * juntan. Lo que se INSPECCIONA (estado de cada componente, señal de hoy,
   * hallazgos) NO se copia: eso se mira hoy o no se mira.
   */
  async propuesta(assetId: string) {
    const activo = await this.prisma.asset.findFirst({
      where: { id: assetId, deletedAt: null },
      select: {
        id: true, type: true, assetCode: true, locationId: true, referencePlace: true,
        camera: { select: { nvrId: true, nvrChannel: true, wirelessUplinkId: true, poeSourcePortId: true } },
      },
    });
    if (!activo) throw new NotFoundException('Esa cámara no existe.');
    const [previa, perfil, permiso, orden] = await Promise.all([
      this.prisma.inspeccionGrua.findFirst({ where: { assetId }, orderBy: { fecha: 'desc' } }),
      perfilDeSeguridadEn(this.prisma, { assetId, locationId: activo.locationId }),
      this.prisma.accessRequest.findFirst({ where: { assetId, status: 'APROBADO' }, orderBy: { createdAt: 'desc' }, select: { id: true, code: true } }),
      this.prisma.workOrder.findFirst({
        where: { assetId, status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, code: true },
      }),
    ]);
    const p: any = previa || {};
    return {
      origen: {
        anterior: previa ? previa.code : null,
        permiso: permiso?.code ?? null,
        orden: orden?.code ?? null,
        faltaDeclarar: perfil.faltaDeclarar,
      },
      valores: {
        grua: p.grua ?? '',
        posicionEnGrua: p.posicionEnGrua ?? (activo.referencePlace || ''),
        requiereManlift: perfil.medio ? perfil.medio === 'MANLIFT' : (p.requiereManlift ?? perfil.enAltura),
        alturaMetros: perfil.alturaM ?? p.alturaMetros ?? '',
        seBajaAPiso: p.seBajaAPiso ?? false,
        requiereParada: perfil.parada || perfil.medio === 'GRUA' || !!p.requiereParada,
        accessRequestId: permiso?.id ?? undefined,
        workOrderId: orden?.id ?? undefined,
        antenaAssetId: activo.camera?.wirelessUplinkId ?? p.antenaAssetId ?? undefined,
        nvrAssetId: activo.camera?.nvrId ?? p.nvrAssetId ?? undefined,
        canalNvr: activo.camera?.nvrChannel ?? p.canalNvr ?? '',
        poe: activo.camera?.poeSourcePortId ? true : (p.poe ?? true),
        grabadorLocal: p.grabadorLocal ?? false,
        diasRetencion: p.diasRetencion ?? '',
        enCadenaPortacables: p.enCadenaPortacables ?? false,
        metrosAproximados: p.metrosAproximados ?? '',
        fuenteAssetId: p.fuenteAssetId ?? undefined,
      },
      seguridad: { epp: perfil.epp, riesgos: perfil.riesgos, requisitos: perfil.requisitos, impacto: perfil.impactoProduccion },
    };
  }

  async crear(dto: CrearInspeccionGruaDto, userId?: string | null) {
    const activo = await this.prisma.asset.findFirst({
      where: { id: dto.assetId, deletedAt: null },
      select: { id: true, type: true, assetCode: true },
    });
    if (!activo) throw new NotFoundException('Esa cámara no existe.');
    if (activo.type !== 'CAMERA') {
      throw new BadRequestException(
        `${activo.assetCode} no es una cámara. Esta inspección es para cámaras montadas en grúa.`,
      );
    }
    if (!dto.grua?.trim()) {
      throw new BadRequestException('Falta indicar de qué grúa se trata.');
    }

    /* COHERENCIA: si dice que NO se pudo acceder, no puede haber revisado
       nada. Dejarlo pasar produciría un registro que afirma "cámara conforme"
       en una visita donde nadie llegó al equipo — y eso es peor que no tener
       registro, porque el mes que viene alguien lo lee y se lo cree. */
    const revisoAlgo = [
      dto.camaraEstado, dto.antenaEstado, dto.cableEstado,
      dto.alimentacionEstado, dto.gabineteEstado,
    ].some((e) => e && e !== 'NO_REVISADO');
    if (dto.resultado === 'NO_SE_PUDO_ACCEDER' && revisoAlgo) {
      throw new BadRequestException(
        'Marcaste "no se pudo acceder" pero hay componentes revisados. ' +
        'O se llegó al equipo, o no: corrige una de las dos cosas.',
      );
    }

    // La señal anterior se arrastra sola para poder calcular la deriva sin
    // que nadie tenga que buscarla ni teclearla.
    const previa = await this.prisma.inspeccionGrua.findFirst({
      where: { assetId: dto.assetId, senalDbm: { not: null } },
      orderBy: { fecha: 'desc' },
      select: { senalDbm: true },
    });

    /* Bloque 169: los hallazgos salen de lo MARCADO (lente sucio, chicote
       dañado…) si no se escribieron: lo que se vio con clics no se reescribe. */
    if (!dto.hallazgos?.trim()) {
      const vistos = [
        dto.lenteSucio && 'Lente sucio', dto.carcasaDanada && 'Carcasa dañada', dto.soporteFlojo && 'Soporte flojo',
        dto.antenaAlineada === false && 'Antena desalineada', dto.chicoteDanado && 'Chicote (tramo flexible) dañado',
        dto.prensaestopaOk === false && 'Prensaestopa en mal estado', dto.conectorOxidado && 'Conector oxidado',
        dto.grabaOk === false && 'No está grabando', dto.gabineteHermetico === false && 'Gabinete no hermético',
        dto.senalDbm != null && dto.senalDbm <= -75 && `Señal baja (${dto.senalDbm} dBm)`,
      ].filter(Boolean);
      if (vistos.length) (dto as any).hallazgos = vistos.join('; ') + '.';
    }
    const { workOrderId, proximaRevision, ...resto } = dto;

    const creada = await this.prisma.inspeccionGrua.create({
      data: {
        ...resto,
        code: await this.siguienteCodigo(),
        workOrderId: workOrderId || null,
        proximaRevision: proximaRevision ? new Date(proximaRevision) : null,
        senalDbmAnterior: previa?.senalDbm ?? null,
        inspeccionadoPorId: userId || null,
      } as any,
      select: { id: true, code: true },
    });

    /* BLOQUE 140 · EL HALLAZGO SE CONVIERTE EN TRABAJO.
       La inspección ya está guardada: si abrir la orden fallara, lo subido al
       manlift NO se pierde, y la respuesta lo dice para abrirla a mano. */
    let om: { code: string; nueva: boolean } | null = null;
    let omError: string | null = null;
    if (decidirOmDeInspeccion({ ...dto, workOrderId }) === 'ABRIR') {
      try {
        const abierta = await this.prisma.workOrder.findFirst({
          where: { assetId: dto.assetId, type: 'CORRECTIVO', status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, code: true },
        });
        const orden = abierta ?? await this.ordenes.create({
          type: 'CORRECTIVO',
          assetId: dto.assetId,
          activity: actividadDeLaOm({ code: creada.code, grua: dto.grua, posicionEnGrua: dto.posicionEnGrua, resultado: dto.resultado, hallazgos: dto.hallazgos }),
          zone: `Grúa ${dto.grua.trim()}`,
        } as any, userId ?? null);
        await this.prisma.inspeccionGrua.update({ where: { id: creada.id }, data: { workOrderId: orden.id } });
        om = { code: orden.code, nueva: !abierta };
      } catch (e: any) {
        omError = 'La inspección se guardó, pero no se pudo abrir la orden: ' + (e?.message || 'error') + '. Ábrela a mano.';
      }
    }
    return { ...creada, om, omError };
  }

  /**
   * Resumen por grúa: la vista que usa el ingeniero para decidir a cuál
   * subir el próximo día que haya manlift.
   */
  async porGrua(userId?: string | null) {
    const filas = await this.lista(userId, null);
    const mapa = new Map<string, any>();
    for (const f of filas) {
      const actual = mapa.get(f.grua);
      // Sólo la MÁS RECIENTE de cada grúa: la lista ya viene ordenada por
      // fecha descendente, así que la primera que aparece es la buena.
      if (!actual) {
        mapa.set(f.grua, {
          grua: f.grua,
          ultima: f.fecha,
          resultado: f.resultado,
          camaras: 1,
          pendientes: f.pendientes,
          requiereManlift: f.requiereManlift,
          deriva: f.deriva,
        });
      } else {
        actual.camaras++;
        actual.pendientes += f.pendientes;
        if (f.requiereManlift) actual.requiereManlift = true;
      }
    }
    return [...mapa.values()].sort((a, b) => b.pendientes - a.pendientes);
  }
}
