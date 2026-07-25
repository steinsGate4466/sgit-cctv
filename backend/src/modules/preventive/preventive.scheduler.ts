import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PreventiveService } from './preventive.service';

/**
 * Tarea programada de generación automática de OM **PREVENTIVAS**.
 *
 * Por qué existe: con 400+ activos en planta, depender de que alguien pulse un botón
 * cada día hace que el plan preventivo se incumpla. Esta tarea lo ejecuta sola.
 *
 * Alcance (importante): SOLO genera preventivas. Correctivo, mejora y predictivo
 * nacen siempre de una decisión humana (incidencia, análisis o propuesta de mejora).
 *
 * Implementación deliberadamente sin dependencias externas (sin @nestjs/schedule):
 * un temporizador propio evita tocar package.json y mantiene el despliegue estable.
 *
 * Configuración por variables de entorno:
 *   PREVENTIVE_AUTOGEN=off        -> desactiva la generación automática (por defecto: activa)
 *   PREVENTIVE_AUTOGEN_HOUR=6     -> hora local de planta a partir de la cual corre (0-23)
 *   PREVENTIVE_LOOKAHEAD_DAYS=0   -> también genera las que vencen en N días
 *   PLANT_UTC_OFFSET=-5           -> huso horario de la planta (Perú = -5)
 */
@Injectable()
export class PreventiveScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PreventiveScheduler');
  private timer: NodeJS.Timeout | null = null;

  // Cada cuánto se revisa si toca ejecutar (no es la frecuencia de generación).
  private readonly CHECK_EVERY_MS = 30 * 60 * 1000; // 30 minutos
  private readonly FIRST_CHECK_MS = 60 * 1000;      // primer chequeo 1 min tras arrancar

  constructor(
    private prisma: PrismaService,
    private preventive: PreventiveService,
  ) {}

  onModuleInit() {
    if ((process.env.PREVENTIVE_AUTOGEN || 'on').toLowerCase() === 'off') {
      this.logger.log('Generación automática de preventivos DESACTIVADA (PREVENTIVE_AUTOGEN=off).');
      return;
    }
    // No bloquear el arranque de la app: se agenda en segundo plano.
    setTimeout(() => this.tick(), this.FIRST_CHECK_MS);
    this.timer = setInterval(() => this.tick(), this.CHECK_EVERY_MS);
    this.logger.log('Generación automática de OM preventivas activada.');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Hora local de la planta (por defecto Perú, UTC-5). */
  private plantNow(): Date {
    const offset = Number(process.env.PLANT_UTC_OFFSET ?? -5);
    return new Date(Date.now() + offset * 3600 * 1000);
  }

  /**
   * Revisa si corresponde ejecutar hoy y, de ser así, genera las OM preventivas.
   * Es idempotente: si ya se ejecutó hoy (aunque el servicio se haya reiniciado),
   * no vuelve a correr, porque consulta la traza de auditoría del día.
   */
  private async tick(): Promise<void> {
    try {
      const startHour = Number(process.env.PREVENTIVE_AUTOGEN_HOUR ?? 6);
      const now = this.plantNow();
      if (now.getUTCHours() < startHour) return; // aún no es la hora de planta

      if (await this.alreadyRanToday()) return;

      const lookahead = Number(process.env.PREVENTIVE_LOOKAHEAD_DAYS ?? 0);
      const result = await this.preventive.generateDue(null, 'sistema (automático)', lookahead);
      this.logger.log(
        `Generación automática: ${result.generated} OM preventiva(s) creada(s), ${result.skipped.length} omitida(s).`,
      );
    } catch (e: any) {
      // Nunca tumbar la aplicación por un fallo del job; se reintenta en el próximo ciclo.
      this.logger.error(`Fallo en la generación automática: ${e?.message || e}`);
    }
  }

  /** ¿Ya se ejecutó la generación automática en el día de planta en curso? */
  private async alreadyRanToday(): Promise<boolean> {
    const offset = Number(process.env.PLANT_UTC_OFFSET ?? -5);
    const plant = this.plantNow();
    // Inicio del día de planta, convertido a UTC real para consultar la BD.
    const startOfPlantDayUtc = new Date(
      Date.UTC(plant.getUTCFullYear(), plant.getUTCMonth(), plant.getUTCDate()) - offset * 3600 * 1000,
    );
    const run = await this.prisma.auditLog.findFirst({
      where: {
        action: 'PREVENTIVE_GENERATE',
        ip: 'sistema (automático)', // marca de ejecución automática
        createdAt: { gte: startOfPlantDayUtc },
      },
      select: { id: true },
    });
    return !!run;
  }
}
