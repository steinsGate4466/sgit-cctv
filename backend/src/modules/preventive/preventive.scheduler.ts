import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CANDADO, conCandado } from '../../common/candado-de-instancia';
import { PreventiveService } from './preventive.service';
import { autogenApagadaPorEntorno } from './autogen-entorno';

/**
 * Tarea diaria del PROGRAMA PREVENTIVO.
 *
 * BLOQUE 180 · YA NO CREA ÓRDENES. Hasta el bloque 179 generaba cada madrugada
 * las OM preventivas vencidas con número propio. Cristhian lo corrigió (22/10):
 * la OM de una rutina la genera SAP —plan + hoja de ruta— y aquí se VINCULA.
 * Generarla también aquí eran dos órdenes para el mismo trabajo.
 *
 * Lo que hace ahora, una vez al día: deja DOCUMENTADO en la auditoría qué
 * rutinas tocaban y cuántas seguían sin su OM de SAP (`programaDelDia`). Es lo
 * que demuestra, en una auditoría, que el programa avisó a tiempo.
 *
 * Implementación deliberadamente sin dependencias externas (sin @nestjs/schedule):
 * un temporizador propio evita tocar package.json y mantiene el despliegue estable.
 *
 * Configuración por variables de entorno:
 *   PREVENTIVE_AUTOGEN=off|false|0|no -> desactiva este documento diario (por defecto: activo)
 *                                    (el interruptor de la pantalla, bloque 143, se retiró en el 180)
 *   PREVENTIVE_AUTOGEN_HOUR=6     -> hora local de planta a partir de la cual corre (0-23)
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
    if (autogenApagadaPorEntorno()) {
      this.logger.log(`Programa preventivo diario DESACTIVADO (PREVENTIVE_AUTOGEN=${process.env.PREVENTIVE_AUTOGEN}).`);
      return;
    }
    // No bloquear el arranque de la app: se agenda en segundo plano.
    setTimeout(() => this.tick(), this.FIRST_CHECK_MS);
    this.timer = setInterval(() => this.tick(), this.CHECK_EVERY_MS);
    this.logger.log('Programa preventivo diario activo (documenta lo que toca; no crea OM).');
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

      /* Bloque 180: el interruptor de la pantalla (bloque 143) se retiró con
         la generación: ya no se crea nada que haya que poder parar. La
         variable de entorno sigue apagando este documento diario. */
      const r = await conCandado(this.prisma, CANDADO.PREVENTIVO, async () => {
        if (await this.alreadyRanToday()) return null;
        return this.preventive.programaDelDia('sistema (automático)');
      });

      if (r.motivo === 'fallo') {
        /* No poder tomar el candado NO se ejecuta: no se puede demostrar que
           la otra réplica no esté haciéndolo. Se reintenta en 30 minutos. */
        this.logger.error(
          `No se pudo tomar el candado del programa preventivo; se salta este ciclo: ${
            (r.error as any)?.message || r.error
          }`,
        );
        return;
      }
      // `tomado: false` sin fallo = lo está haciendo la otra instancia. Normal.
      if (!r.tomado || !r.valor) return;

      this.logger.log(
        `Programa del día: ${r.valor.tocan} rutina(s) tocan; ${r.valor.sinOm + r.valor.omSinSap} sin su OM de SAP.`,
      );
    } catch (e: any) {
      // Nunca tumbar la aplicación por un fallo del job; se reintenta en el próximo ciclo.
      this.logger.error(`Fallo en el programa preventivo diario: ${e?.message || e}`);
    }
  }

  /** ¿Ya se documentó el programa del día de planta en curso? */
  private async alreadyRanToday(): Promise<boolean> {
    const offset = Number(process.env.PLANT_UTC_OFFSET ?? -5);
    const plant = this.plantNow();
    // Inicio del día de planta, convertido a UTC real para consultar la BD.
    const startOfPlantDayUtc = new Date(
      Date.UTC(plant.getUTCFullYear(), plant.getUTCMonth(), plant.getUTCDate()) - offset * 3600 * 1000,
    );
    const run = await this.prisma.auditLog.findFirst({
      where: {
        action: 'PREVENTIVE_PROGRAMA',
        ip: 'sistema (automático)', // marca de ejecución automática
        createdAt: { gte: startOfPlantDayUtc },
      },
      select: { id: true },
    });
    return !!run;
  }
}
