import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CANDADO, conCandado } from '../../common/candado-de-instancia';
import { BandejaSalidaService } from './bandeja-salida.service';
import { resumenDiario } from './plantillas';

/**
 * Dónde se anota que el resumen de hoy ya se mandó.
 *
 * ESTABA EN MEMORIA (`ultimoDiaEnviado`) y eso escondía DOS fallos:
 *
 *  1. Entre instancias: cada réplica tenía su copia, así que con dos réplicas
 *     salían DOS resúmenes cada mañana.
 *  2. **Con UNA sola instancia también.** Un despliegue después de las 7 de la
 *     mañana —que es cuando se despliega— reiniciaba el proceso, el campo
 *     volvía a `null`, y el resumen se mandaba OTRA VEZ. Ese fallo llevaba ahí
 *     desde que se escribió y no lo veía nada: no rompe, no sale en rojo, y el
 *     que lo sufre piensa que el bot está mal configurado.
 *
 * `ConfiguracionSistema` es una tabla clave/valor que ya existe: no hace falta
 * migración para esto.
 */
const CLAVE_ULTIMO_DIA = 'resumen_diario_ultimo_dia';

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

  /** El día que se mandó el último resumen, según la base. */
  private async ultimoDiaEnviado(): Promise<string | null> {
    const fila = await this.prisma.configuracionSistema.findUnique({
      where: { clave: CLAVE_ULTIMO_DIA },
      select: { valor: true },
    });
    return fila?.valor ?? null;
  }

  /** Deja anotado que el resumen de este día ya está resuelto. */
  private async anotarDia(dia: string): Promise<void> {
    await this.prisma.configuracionSistema.upsert({
      where: { clave: CLAVE_ULTIMO_DIA },
      create: {
        clave: CLAVE_ULTIMO_DIA,
        valor: dia,
        descripcion: 'Último día de planta con resumen diario resuelto (bloque 100).',
        actualizadoPor: 'sistema (automático)',
      },
      update: { valor: dia, actualizadoEn: new Date(), actualizadoPor: 'sistema (automático)' },
    });
  }

  async tick() {
    try {
      const ahora = this.horaPlanta();
      const hora = Number(process.env.RESUMEN_DIARIO_HORA ?? 7);
      const dia = ahora.toISOString().slice(0, 10);

      // Todavía no es la hora. Se mira antes del candado para no abrir una
      // transacción cada quince minutos durante toda la noche.
      if (ahora.getUTCHours() < hora) return;

      const r = await conCandado(this.prisma, CANDADO.RESUMEN_DIARIO, () => this.enviar(dia));
      if (r.motivo === 'fallo') {
        this.logger.error(
          `No se pudo tomar el candado del resumen diario; se salta este ciclo: ${
            (r.error as any)?.message || r.error
          }`,
        );
      }
      // `tomado: false` sin fallo = lo está haciendo la otra instancia.
    } catch (e: any) {
      this.logger.error(`Resumen diario: ${e?.message}`);
    }
  }

  /**
   * El resumen en sí. **Corre siempre dentro del candado**, y la comprobación
   * de «¿ya se mandó hoy?» va DENTRO con él a propósito: si estuviera fuera,
   * las dos instancias la harían a la vez, las dos verían que no se ha mandado
   * y las dos entrarían. Sería el fallo original con un candado encima.
   */
  private async enviar(dia: string): Promise<void> {
    if ((await this.ultimoDiaEnviado()) === dia) return;

    const destinatarios = await this.avisos.destinatarios('INGENIERO');
    // Sin nadie escuchando no se calcula nada: cuatro consultas de más cada
    // quince minutos, para nadie.
    if (destinatarios.length === 0) {
      await this.anotarDia(dia);
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
    await this.anotarDia(dia);
    const n = await this.avisos.encolar('RESUMEN_DIARIO', aviso, destinatarios);
    if (n > 0) this.logger.log(`Resumen diario encolado para ${n} destinatario(s).`);
  }
}
