import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { INTERVALO_POR_AMBIENTE, Ambiente } from '../../common/plant-context';

/**
 * ETAPAS DEL PROCESO — catálogo editable.
 *
 * El sistema NO trae etapas precargadas a propósito: los nombres reales del
 * proceso los conoce el personal de planta, no el software. Aquí se crean,
 * se ordenan y se les asigna ambiente; de ese ambiente se deriva cada cuántos
 * días toca el mantenimiento preventivo.
 *
 * Una vez creada la etapa, se "instancia" bajo el tren que la tenga: así el
 * Tren 1 y el Tren 2 pueden tener etapas distintas sin tocar la base de datos.
 */
@Injectable()
export class StagesService {
  constructor(private prisma: PrismaService) {}

  /** Catálogo completo, en orden de proceso, con cuántos trenes lo usan. */
  async findAll() {
    const stages = await this.prisma.processStage.findMany({
      orderBy: { sequence: 'asc' },
      include: {
        locations: {
          select: { id: true, code: true, name: true, parentId: true },
        },
      },
    });
    return stages.map((s: any) => ({
      ...s,
      enUso: s.locations.length,
      // Intervalo que corresponde al ambiente, para avisar si se editó a mano.
      intervaloSugerido: INTERVALO_POR_AMBIENTE[s.environment as Ambiente] ?? null,
    }));
  }

  /** Ambientes disponibles con su intervalo, para poblar el desplegable. */
  ambientes() {
    return [
      { code: 'CALOR_RADIANTE', label: 'Calor radiante (horno)', dias: 30,
        detalle: 'Radiación directa: degrada sellos y óptica' },
      { code: 'VAPOR_AGUA', label: 'Vapor y agua (tren)', dias: 30,
        detalle: 'Refrigeración de rodillos, condensación interna' },
      { code: 'POLVO_METALICO', label: 'Polvo metálico / cascarilla', dias: 45,
        detalle: 'Abrasión y obstrucción de la óptica' },
      { code: 'INTEMPERIE_SALINA', label: 'Intemperie (patio, almacén)', dias: 45,
        detalle: 'Pisco es costa: corrosión acelerada' },
      { code: 'EMI_ALTA', label: 'Sala eléctrica / MCC', dias: 60,
        detalle: 'Interferencia electromagnética' },
      { code: 'CLIMATIZADO', label: 'Climatizado (púlpito)', dias: 90,
        detalle: 'Polvo normal' },
    ];
  }

  async create(dto: any) {
    const code = String(dto.code || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (!code) throw new BadRequestException('El código de la etapa es obligatorio');
    if (!dto.name?.trim()) throw new BadRequestException('El nombre de la etapa es obligatorio');

    const yaExiste = await this.prisma.processStage.findUnique({ where: { code } });
    if (yaExiste) throw new ConflictException(`Ya existe una etapa con el código ${code}`);

    // Si no indican intervalo, se toma el del ambiente. Es el punto de partida
    // técnico; el Jefe de Mantenimiento puede ajustarlo después.
    const intervalo = Number(dto.defaultIntervalDays) > 0
      ? Number(dto.defaultIntervalDays)
      : (INTERVALO_POR_AMBIENTE[dto.environment as Ambiente] ?? 60);

    // Si no indican orden, va al final del proceso.
    let sequence = Number(dto.sequence);
    if (!sequence || sequence < 1) {
      const ultima = await this.prisma.processStage.findFirst({ orderBy: { sequence: 'desc' } });
      sequence = (ultima?.sequence ?? 0) + 1;
    }

    return this.prisma.processStage.create({
      data: {
        code,
        name: dto.name.trim(),
        sequence,
        environment: dto.environment,
        baseCriticality: dto.baseCriticality || 'MEDIA',
        defaultIntervalDays: intervalo,
        watches: dto.watches?.trim() || null,
      },
    });
  }

  async update(id: string, dto: any) {
    const etapa = await this.prisma.processStage.findUnique({ where: { id } });
    if (!etapa) throw new NotFoundException('Etapa no encontrada');

    return this.prisma.processStage.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? undefined,
        sequence: dto.sequence != null ? Number(dto.sequence) : undefined,
        environment: dto.environment ?? undefined,
        baseCriticality: dto.baseCriticality ?? undefined,
        defaultIntervalDays:
          dto.defaultIntervalDays != null ? Number(dto.defaultIntervalDays) : undefined,
        watches: dto.watches !== undefined ? (dto.watches?.trim() || null) : undefined,
        active: dto.active !== undefined ? !!dto.active : undefined,
      },
    });
  }

  /**
   * Desactiva la etapa. NO se borra: si ya hay ubicaciones y activos colgando
   * de ella, borrarla dejaría huérfano el historial de mantenimiento.
   */
  async deactivate(id: string) {
    const etapa = await this.prisma.processStage.findUnique({
      where: { id },
      include: { _count: { select: { locations: true } } },
    });
    if (!etapa) throw new NotFoundException('Etapa no encontrada');
    return this.prisma.processStage.update({ where: { id }, data: { active: false } });
  }

  /**
   * Instancia la etapa bajo un tren: crea la ubicación de tipo ETAPA.
   * Es lo que permite que el Tren 1 y el Tren 2 tengan etapas distintas.
   */
  async instanciarEnTren(stageId: string, trenId: string) {
    const etapa = await this.prisma.processStage.findUnique({ where: { id: stageId } });
    if (!etapa) throw new NotFoundException('Etapa no encontrada');

    const tren = await this.prisma.location.findUnique({ where: { id: trenId } });
    if (!tren) throw new NotFoundException('Tren no encontrado');
    if (tren.type !== 'TREN') {
      throw new BadRequestException('Las etapas sólo se pueden colgar de un tren');
    }

    const code = `${tren.code}-${etapa.code}`;
    const yaExiste = await this.prisma.location.findUnique({ where: { code } });
    if (yaExiste) {
      throw new ConflictException(`${tren.name} ya tiene la etapa ${etapa.name}`);
    }

    return this.prisma.location.create({
      data: {
        code,
        name: etapa.name,
        type: 'ETAPA',
        parentId: tren.id,
        path: `${tren.path}/${etapa.code}`,
        stageId: etapa.id,
      },
    });
  }

  /** Trenes disponibles para instanciar etapas. */
  async trenes() {
    return this.prisma.location.findMany({
      where: { type: 'TREN' },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, path: true },
    });
  }
}
