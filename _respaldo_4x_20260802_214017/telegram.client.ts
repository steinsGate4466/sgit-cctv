import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import { ConfiguracionService } from './configuracion.service';

/**
 * EL ÚNICO ARCHIVO QUE SABE QUE TELEGRAM EXISTE.
 *
 * Todo lo demás —la bandeja de salida, los eventos, las plantillas— habla de
 * "avisos" y de "destinos". Si TI no autoriza Telegram y hay que irse a
 * correo corporativo o a Teams, se escribe otro archivo como éste y no se
 * toca nada más.
 *
 * SIN DEPENDENCIAS. Usa el https que trae Node. En un backend que ya arrastra
 * 25 alertas de dependencias, añadir una librería para hacer un POST es
 * empeorar el problema a cambio de nada.
 *
 * ESTÁ APAGADO MIENTRAS NO HAYA TOKEN. Sin TELEGRAM_BOT_TOKEN, `activo()`
 * devuelve false y no se intenta nada. Ese es el interruptor del bloque
 * entero: el día que TI autorice, se pone la variable en Railway y empieza a
 * funcionar. Ni un despliegue de código.
 */
@Injectable()
export class TelegramClient {
  private readonly logger = new Logger('Telegram');

  constructor(private readonly config: ConfiguracionService) {}

  /**
   * El token sale de la configuración del sistema o, si está puesta, de la
   * variable de entorno —que tiene prioridad para no cambiarle el
   * comportamiento a quien ya la tenía funcionando—.
   */
  async token(): Promise<string | null> {
    const t = await this.config.leer('TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN');
    return t && t.length > 20 ? t : null;
  }

  async activo(): Promise<boolean> {
    return !!(await this.token());
  }

  /**
   * Comprueba un token contra Telegram y devuelve el nombre del bot.
   *
   * Es lo que convierte "pega esto y reza" en "pega esto y te digo si vale".
   * Sin esta comprobación, un token mal copiado no se descubre hasta que
   * alguien echa en falta un aviso que nunca llegó.
   */
  async comprobar(token: string): Promise<{ ok: boolean; bot?: string; error?: string }> {
    return new Promise((resolve) => {
      const req = https.request(
        { hostname: 'api.telegram.org', path: `/bot${token}/getMe`, method: 'GET', timeout: 10000 },
        (res) => {
          let txt = '';
          res.on('data', (d) => (txt += d));
          res.on('end', () => {
            try {
              const j = JSON.parse(txt);
              if (j.ok && j.result?.username) resolve({ ok: true, bot: '@' + j.result.username });
              else resolve({ ok: false, error: j.description || 'Telegram no reconoce ese token.' });
            } catch {
              resolve({ ok: false, error: 'Respuesta ilegible de Telegram.' });
            }
          });
        },
      );
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Telegram no respondió.' }); });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.end();
    });
  }

  /**
   * Manda un mensaje. Devuelve el resultado en lugar de lanzar: quien llama
   * es el despachador, y necesita distinguir "reintenta" de "no insistas".
   */
  async enviar(chatId: string, texto: string, silencioso = false): Promise<{
    ok: boolean;
    /** true si volver a intentarlo tiene sentido. */
    reintentable: boolean;
    error?: string;
    /** Segundos que Telegram pide esperar (cabecera retry_after). */
    esperarSeg?: number;
  }> {
    const token = await this.token();
    if (!token) {
      return {
        ok: false, reintentable: false,
        error: 'Telegram no está configurado. Pega el token del bot en la pantalla de Avisos.',
      };
    }

    const cuerpo = JSON.stringify({
      chat_id: chatId,
      text: texto,
      disable_notification: silencioso,
      // Sin formato: un código de equipo con guion bajo saldría en cursiva y
      // a medias, y un asterisco de un modelo rompería el mensaje entero.
      // El texto plano nunca se rompe.
      disable_web_page_preview: true,
    });

    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: 'api.telegram.org',
          path: `/bot${token}/sendMessage`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo) },
          timeout: 15000,
        },
        (res) => {
          let txt = '';
          res.on('data', (d) => (txt += d));
          res.on('end', () => {
            const codigo = res.statusCode || 0;
            if (codigo >= 200 && codigo < 300) return resolve({ ok: true, reintentable: false });

            let datos: any = {};
            try { datos = JSON.parse(txt); } catch { /* respuesta no JSON */ }
            const desc = datos?.description || txt.slice(0, 200);

            // 429: nos pasamos del cupo. Telegram DICE cuánto esperar y hay
            // que hacerle caso: ignorarlo acaba con el bot bloqueado.
            if (codigo === 429) {
              return resolve({
                ok: false, reintentable: true, error: desc,
                esperarSeg: Number(datos?.parameters?.retry_after) || 60,
              });
            }
            // 403: la persona bloqueó al bot, o nunca le escribió /start.
            // Reintentar no arregla eso: hace falta que ELLA actúe.
            if (codigo === 403 || codigo === 400) {
              return resolve({ ok: false, reintentable: false, error: desc });
            }
            // 5xx: es problema suyo, no nuestro. Se reintenta.
            resolve({ ok: false, reintentable: codigo >= 500, error: desc });
          });
        },
      );
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, reintentable: true, error: 'Telegram no respondió en 15 segundos.' });
      });
      req.on('error', (e) => {
        // Sin red o DNS caído: reintentable, casi siempre pasajero.
        resolve({ ok: false, reintentable: true, error: e.message });
      });
      req.write(cuerpo);
      req.end();
    });
  }

  /**
   * Lee los mensajes que le han escrito al bot. Es como se VINCULA una
   * persona: escribe /start CODIGO y el bot descubre así su chat.
   *
   * Se usa getUpdates (consulta) y NO webhook a propósito: un webhook
   * obligaría a exponer una URL pública para que Telegram entre. Consultando,
   * la conexión sale siempre de aquí hacia fuera. Es la misma decisión que
   * en el agente de planta, y por el mismo motivo.
   */
  async recibir(desdeId = 0): Promise<{ updateId: number; chatId: string; texto: string }[]> {
    const token = await this.token();
    if (!token) return [];
    const url = `/bot${token}/getUpdates?offset=${desdeId}&timeout=0&limit=50`;
    return new Promise((resolve) => {
      const req = https.request(
        { hostname: 'api.telegram.org', path: url, method: 'GET', timeout: 15000 },
        (res) => {
          let txt = '';
          res.on('data', (d) => (txt += d));
          res.on('end', () => {
            try {
              const j = JSON.parse(txt);
              resolve((j.result || []).map((u: any) => ({
                updateId: u.update_id,
                chatId: String(u.message?.chat?.id ?? ''),
                texto: String(u.message?.text ?? ''),
              })).filter((x: any) => x.chatId));
            } catch {
              resolve([]);
            }
          });
        },
      );
      req.on('timeout', () => { req.destroy(); resolve([]); });
      req.on('error', () => resolve([]));
      req.end();
    });
  }
}
