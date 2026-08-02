import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BandejaSalidaService } from './bandeja-salida.service';
import { resumenDiario } from './plantillas';

/**
 * RESUMEN DE CADA MAÑANA.
 *
 * Un mensaje al día, al empezar el turno, con lo que quedó pendiente:
 * órdenes sin detallar, vencidas, paradas y repuestos bajo mínimo.
 *
 * POR QUÉ UN RESUMEN Y NO UN AVISO POR CADA COSA
 * Porque estas cuatro cosas no exigen levantarse: exigen mirarlas. Mandar un
 * mensaje por cada orden vencida es cómo se consigue que alguien silencie el
 * bot — y con él, lo urgente. Va SIN SONIDO por el mismo motivo.
 *
 * Y SI NO HAY NADA, NO SE MANDA NADA. Un "hoy no hay novedades" diario es la
 * forma más rápida de que la gente deje de leerlo. Eso lo decide la propia
 * plantilla, que devuelve null cuando no hay nada que contar.
 *
 * Sin dependencias de calendario: mismo temporizador propio que el generador
 * de preventivas. Una dependencia menos que mantener.
 *
 * Variables:
 *   RESUMEN_DIARIO=off      lo desactiva
 *   RESUMEN_DIARIO_HORA=7   hora local de planta (0-23)
 *   PLANT_UTC_OFFSET=-5     huso de la planta (Perú)
 */
@Injectable()
export class ResumenScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Avisos');
  private timer: NodeJS.Timeout | null = null;
  private ultimoDiaEnviado: string | null = null;

  private readonly CADA_MS = 15 * 60 * 1000;
  private readonly PRIMERA_MS = 90 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly avisos: BandejaSalidaService,
  ) {}

  onModuleInit() {
    if ((process.env.RESUMEN_DIARIO || 'on').toLowerCase() === 'off') {
      this.logger.log('Resumen diario desactivado (RESUMEN_DIARIO=off).');
      return;
    }
    setTimeout(() => this.tick(), this.PRIMERA_MS);
    this.timer = setInterval(() => this.tick(), this.CADA_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Hora local de la planta. Perú es UTC-5. */
  private horaPlanta(): Date {
    const off = Number(process.env.PLANT_UTC_OFFSET ?? -5);
    return new Date(Date.now() + off * 3600 * 1000);
  }

  async tick() {
    try {
      const ahora = this.horaPlanta();
      const hora = Number(process.env.RESUMEN_DIARIO_HORA ?? 7);
      const dia = ahora.toISOString().slice(0, 10);

      // Ya se mandó hoy, o todavía no es la hora.
      if (this.ultimoDiaEnviado === dia) return;
      if (ahora.getUTCHours() < hora) return;

      const destinatarios = await this.avisos.destinatarios('INGENIERO');
      // Sin nadie escuchando no se calcula nada: cuatro consultas de más cada
      // quince minutos, para nadie.
      if (destinatarios.length === 0) {
        this.ultimoDiaEnviado = dia;
        return;
      }

      const [sinDetallar, vencidas, paradas, bajoMinimo] = await Promise.all([
        this.prisma.workOrder.count({
          where: { detailedAt: null, status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] } },
        }),
        this.prisma.workOrder.count({
          where: { status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] }, scheduledDate: { lt: new Date() } },
        }),
        this.prisma.workOrder.count({ where: { status: 'EN_ESPERA' } }),
        this.prisma.$queryRaw<{ n: bigint }[]>`
          SELECT COUNT(*)::bigint AS n FROM spare_parts WHERE "currentStock" <= "minStock"
        `.then((r) => Number(r?.[0]?.n ?? 0)).catch(() => 0),
      ]);

      const aviso = resumenDiario({
        sinDetallar, vencidas, paradas, bajoMinimo,
        enlace: (process.env.APP_URL || '').replace(/\/+$/, '') + '/bandeja' || null,
      });

      // Se marca el día ANTES de encolar. Si algo fallara después, es
      // preferible perder el resumen de hoy a mandar el mismo cuatro veces.
      this.ultimoDiaEnviado = dia;
      const n = await this.avisos.encolar('RESUMEN_DIARIO', aviso, destinatarios);
      if (n > 0) this.logger.log(`Resumen diario encolado para ${n} destinatario(s).`);
    } catch (e: any) {
      this.logger.error(`Resumen diario: ${e?.message}`);
    }
  }
}
