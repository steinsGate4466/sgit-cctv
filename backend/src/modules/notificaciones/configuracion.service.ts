import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../../common/crypto/crypto.util';

/**
 * AJUSTES DEL SISTEMA QUE NO DEBERÍAN ESTAR EN RAILWAY.
 *
 * El token del bot no se puede generar por programa: lo emite @BotFather y
 * Telegram no ofrece otra vía. Eso no tiene arreglo.
 *
 * Lo que sí tenía arreglo es todo lo de alrededor. Antes había que:
 *   1. entrar al panel de despliegue (que no todo el mundo tiene),
 *   2. añadir una variable,
 *   3. esperar a que el backend reinicie, en mitad de la jornada,
 *   4. y probar a ver si el token era el correcto, mirando logs.
 *
 * Ahora se pega una vez en una pantalla, se comprueba al instante contra
 * Telegram, y queda cifrado en la base con el mismo mecanismo que las
 * credenciales de las cámaras.
 *
 * SE MANTIENE LA VARIABLE DE ENTORNO COMO RESPALDO, y con prioridad sobre la
 * base: si alguien la puso en Railway, esa manda. Quitarla de golpe habría
 * apagado los avisos de quien ya la tuviera configurada.
 *
 * Hay una caché en memoria de 30 segundos: esto se consulta en cada vuelta
 * del despachador, y no tiene sentido una consulta por minuto para leer algo
 * que cambia una vez al año.
 */
@Injectable()
export class ConfiguracionService {
  private readonly logger = new Logger('Config');
  private cache = new Map<string, { valor: string | null; hasta: number }>();
  private readonly VIGENCIA_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  async leer(clave: string, variableEntorno?: string): Promise<string | null> {
    // La variable de entorno gana. Es lo que había antes y no se le puede
    // cambiar el comportamiento a quien ya lo tenía funcionando.
    const env = variableEntorno ? process.env[variableEntorno] : undefined;
    if (env && env.trim()) return env.trim();

    const c = this.cache.get(clave);
    if (c && c.hasta > Date.now()) return c.valor;

    let valor: string | null = null;
    try {
      const fila = await this.prisma.configuracionSistema.findUnique({ where: { clave } });
      if (fila?.valor) {
        valor = fila.secreto ? decryptSecret(fila.valor) : fila.valor;
      }
    } catch (e: any) {
      // Si la base falla se devuelve null: el sistema sigue, apagado. Es
      // preferible a que reviente por no poder leer un ajuste.
      this.logger.error(`No se pudo leer "${clave}": ${e?.message}`);
    }
    this.cache.set(clave, { valor, hasta: Date.now() + this.VIGENCIA_MS });
    return valor;
  }

  async guardar(clave: string, valor: string | null, secreto: boolean, userId?: string | null) {
    const limpio = (valor || '').trim();
    await this.prisma.configuracionSistema.upsert({
      where: { clave },
      create: {
        clave,
        valor: limpio ? (secreto ? encryptSecret(limpio) : limpio) : null,
        secreto,
        actualizadoPor: userId || null,
      },
      update: {
        valor: limpio ? (secreto ? encryptSecret(limpio) : limpio) : null,
        secreto,
        actualizadoEn: new Date(),
        actualizadoPor: userId || null,
      },
    });
    // La caché se vacía entera, no sólo esa clave: son cuatro entradas y
    // afinar aquí sólo añade una forma de equivocarse.
    this.cache.clear();
    return { ok: true };
  }

  /**
   * Lo que se le enseña a la pantalla. NUNCA el valor de un secreto: sólo si
   * está puesto y sus últimos cuatro caracteres, que es lo que permite a una
   * persona reconocer "sí, es el token que pegué" sin exponerlo.
   */
  async estado(clave: string, variableEntorno?: string) {
    const v = await this.leer(clave, variableEntorno);
    const env = variableEntorno ? process.env[variableEntorno] : undefined;
    return {
      puesto: !!v,
      pista: v ? '…' + v.slice(-4) : null,
      desdeEntorno: !!(env && env.trim()),
    };
  }
}
