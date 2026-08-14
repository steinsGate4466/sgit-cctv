import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * ZONAS VITALES PARA LA PRODUCCIÓN — bloque 26.
 *
 * =============================================================================
 *  EL HUECO QUE TAPA
 * =============================================================================
 *  Tres áreas miran las mismas cámaras y ninguna ve lo mismo:
 *
 *    · MANTENIMIENTO sabe qué equipo es caro y cuál está expuesto al calor.
 *    · TI            sabe qué enlace arrastra a cuántos equipos si se cae.
 *    · PRODUCCIÓN    sabe qué se PIERDE si esa zona se queda sin vista.
 *
 *  Lo tercero no estaba en el sistema. Y es lo que de verdad ordena el
 *  trabajo: una cámara barata en la salida del horno importa más que una
 *  cámara cara en el estacionamiento.
 *
 *  Aquí Producción lo declara UNA VEZ por zona, y la criticidad de todas las
 *  cámaras que cuelgan de esa zona sube sola. Nadie tiene que acordarse de
 *  marcar cámara por cámara: se deriva del árbol de planta, igual que el
 *  tren, la etapa y el ambiente.
 *
 * =============================================================================
 *  LAS DOS REGLAS QUE EVITAN QUE ESTO SE DEGRADE
 * =============================================================================
 *  1. ALTA o CRÍTICA EXIGEN UN PORQUÉ ESCRITO.
 *     Sin esta regla, en tres meses todas las zonas son críticas y el campo
 *     deja de ordenar nada — que es exactamente lo que pasa con los campos de
 *     prioridad en los sistemas que nadie mantiene. El motivo se pide también
 *     en la base de datos, no sólo aquí: si algún día se carga por script, la
 *     regla sigue puesta.
 *
 *  2. LA DECLARACIÓN CADUCA.
 *     Se guarda hasta cuándo vale y quién la firmó. Una criticidad de 2026
 *     aplicada en 2029 sin que nadie la haya vuelto a mirar es una mentira
 *     con fecha.
 */
@Injectable()
export class ZonasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private readonly EXIGEN_MOTIVO = ['ALTA', 'CRITICA'];

  /**
   * El árbol de planta con la declaración de cada zona y CUÁNTOS ACTIVOS
   * cuelgan de ella, contando los de sus descendientes.
   *
   * El recuento importa: declarar crítica una zona con 40 cámaras no es lo
   * mismo que declararla con una. Sin ese número, Producción decide a ciegas
   * y Mantenimiento recibe una avalancha que no esperaba.
   */
  async listar() {
    const [ubicaciones, activos] = await Promise.all([
      this.prisma.location.findMany({
        select: {
          id: true, code: true, name: true, type: true, parentId: true,
          criticidadProduccion: true, porQueEsVital: true,
          impactoSiSeCae: true, queSeVigila: true,
          declaradoEn: true, revisarAntesDe: true,
          declaradoPor: { select: { fullName: true } },
        },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.asset.findMany({
        where: { deletedAt: null },
        select: { id: true, locationId: true },
      }),
    ]);

    // Activos propios de cada ubicación.
    const propios = new Map<string, number>();
    for (const a of activos) {
      if (!a.locationId) continue;
      propios.set(a.locationId, (propios.get(a.locationId) ?? 0) + 1);
    }

    // Y los de toda la rama. Se suben los propios hacia los padres en vez de
    // bajar por hijos: es una sola pasada y no depende del orden del array.
    const porId = new Map(ubicaciones.map((u) => [u.id, u] as const));
    const enLaRama = new Map<string, number>();
    for (const [locId, n] of propios) {
      let actual = porId.get(locId);
      let saltos = 0;
      while (actual && saltos < 20) {
        enLaRama.set(actual.id, (enLaRama.get(actual.id) ?? 0) + n);
        actual = actual.parentId ? porId.get(actual.parentId) : undefined;
        saltos++;
      }
    }

    const ahora = Date.now();
    return ubicaciones.map((u) => ({
      id: u.id,
      code: u.code,
      nombre: u.name,
      tipo: u.type,
      parentId: u.parentId,
      criticidadProduccion: u.criticidadProduccion,
      porQueEsVital: u.porQueEsVital,
      impactoSiSeCae: u.impactoSiSeCae,
      queSeVigila: u.queSeVigila,
      declaradoPor: u.declaradoPor?.fullName ?? null,
      declaradoEn: u.declaradoEn,
      revisarAntesDe: u.revisarAntesDe,
      vencida: !!u.revisarAntesDe && u.revisarAntesDe.getTime() < ahora,
      activosPropios: propios.get(u.id) ?? 0,
      activosEnLaRama: enLaRama.get(u.id) ?? 0,
    }));
  }

  /**
   * Lo que Producción tiene que revisar hoy: zonas declaradas vencidas, y
   * zonas con muchas cámaras que nadie ha declarado todavía.
   */
  async pendientes() {
    const zonas = await this.listar();
    return {
      vencidas: zonas.filter((z) => z.vencida),
      // Sin declarar y con equipos colgando. Se limita a las que tienen algo
      // que perder: una ubicación vacía no le interesa a nadie.
      sinDeclarar: zonas
        .filter((z) => !z.criticidadProduccion && z.activosEnLaRama > 0)
        .sort((a, b) => b.activosEnLaRama - a.activosEnLaRama)
        .slice(0, 20),
      declaradas: zonas.filter((z) => !!z.criticidadProduccion).length,
      total: zonas.length,
    };
  }

  /** Producción declara (o corrige) la importancia de una zona. */
  async declarar(
    id: string,
    dto: {
      criticidadProduccion?: string | null;
      porQueEsVital?: string | null;
      impactoSiSeCae?: string | null;
      queSeVigila?: string | null;
      revisarAntesDe?: string | null;
    },
    userId?: string,
    ip?: string,
  ) {
    const antes = await this.prisma.location.findUnique({
      where: { id },
      select: {
        id: true, name: true, criticidadProduccion: true,
        porQueEsVital: true, impactoSiSeCae: true, queSeVigila: true,
      },
    });
    if (!antes) throw new NotFoundException('Esa ubicación no existe.');

    const nivel = dto.criticidadProduccion ?? null;
    const motivo = (dto.porQueEsVital ?? '').trim();

    if (nivel && !['BAJA', 'MEDIA', 'ALTA', 'CRITICA'].includes(nivel)) {
      throw new BadRequestException(`Criticidad desconocida: ${nivel}.`);
    }

    // La regla del porqué. El mensaje explica el motivo de la regla, no sólo
    // que falta un campo: quien la encuentra tiene que entender por qué está.
    if (nivel && this.EXIGEN_MOTIVO.includes(nivel) && !motivo) {
      throw new BadRequestException(
        'Para declarar una zona ALTA o CRÍTICA hay que escribir por qué lo es. ' +
        'Sin esa frase, en unos meses todas las zonas acaban siendo críticas y ' +
        'el campo deja de servir para ordenar el trabajo.',
      );
    }

    let revisar: Date | null = null;
    if (dto.revisarAntesDe) {
      revisar = new Date(dto.revisarAntesDe);
      if (Number.isNaN(revisar.getTime())) {
        throw new BadRequestException('La fecha de revisión no es válida.');
      }
    }

    const despues = await this.prisma.location.update({
      where: { id },
      data: {
        criticidadProduccion: nivel as any,
        porQueEsVital: motivo || null,
        impactoSiSeCae: (dto.impactoSiSeCae ?? '').trim() || null,
        queSeVigila: (dto.queSeVigila ?? '').trim() || null,
        // Se re-firma en cada cambio: la fecha dice cuándo se miró por última
        // vez, no cuándo se declaró la primera.
        declaradoPorId: userId ?? null,
        declaradoEn: nivel ? new Date() : null,
        revisarAntesDe: revisar,
      },
      select: {
        id: true, name: true, criticidadProduccion: true,
        porQueEsVital: true, impactoSiSeCae: true, queSeVigila: true,
        declaradoEn: true, revisarAntesDe: true,
      },
    });

    /* Se audita SIEMPRE, incluso al retirar la declaración. Bajar una zona de
       CRÍTICA a nada cambia el orden de trabajo de decenas de cámaras sin que
       se note en ninguna pantalla; tiene que quedar quién lo hizo. */
    await this.audit.record({
      userId, ip, action: 'UPDATE', entity: 'zona-criticidad', entityId: id,
      before: {
        criticidad: antes.criticidadProduccion,
        porQue: antes.porQueEsVital,
      },
      after: {
        criticidad: despues.criticidadProduccion,
        porQue: despues.porQueEsVital,
      },
    });

    return despues;
  }
}
