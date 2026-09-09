import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CANDADO, conCandado } from '../../common/candado-de-instancia';
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
   *
   * IDEMPOTENTE EN DOS NIVELES, y hacen falta los dos (bloque 100):
   *
   *   · `alreadyRanToday()` consulta la traza de auditoría del día, así que un
   *     reinicio del servicio no vuelve a generar.
   *   · El CANDADO hace que esa comprobación sea atómica ENTRE INSTANCIAS.
   *     Sin él, dos réplicas comprobaban a la vez, las dos veían «hoy no se ha
   *     ejecutado» y las dos generaban el plan entero: órdenes duplicadas, dos
   *     cuadrillas al mismo poste, y el reparto del comité contando el doble.
   *     Y el peor momento era el despliegue, porque las dos réplicas arrancan
   *     juntas y sus primeros disparos caen con milisegundos de diferencia.
   *
   * Por eso la comprobación va DENTRO del candado. Dejarla fuera y meter sólo
   * la generación no arregla nada: es el fallo original con un candado encima.
   */
  private async tick(): Promise<void> {
    try {
      const startHour = Number(process.env.PREVENTIVE_AUTOGEN_HOUR ?? 6);
      const now = this.plantNow();
      if (now.getUTCHours() < startHour) return; // aún no es la hora de planta

      const r = await conCandado(this.prisma, CANDADO.PREVENTIVO, async () => {
        if (await this.alreadyRanToday()) return null;
        const lookahead = Number(process.env.PREVENTIVE_LOOKAHEAD_DAYS ?? 0);
        return this.preventive.generateDue(null, 'sistema (automático)', lookahead);
      });

      if (r.motivo === 'fallo') {
        /* No poder tomar el candado NO se ejecuta: no se puede demostrar que
           la otra réplica no esté haciéndolo. Se reintenta en 30 minutos. */
        this.logger.error(
          `No se pudo tomar el candado de la generación automática; se salta este ciclo: ${
            (r.error as any)?.message || r.error
          }`,
        );
        return;
      }
      // `tomado: false` sin fallo = lo está haciendo la otra instancia. Normal.
      if (!r.tomado || !r.valor) return;

      this.logger.log(
        `Generación automática: ${r.valor.generated} OM preventiva(s) creada(s), ${r.valor.skipped.length} omitida(s).`,
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
