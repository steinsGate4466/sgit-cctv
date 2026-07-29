import { ConsoleLogger, LogLevel } from '@nestjs/common';

/**
 * Registro estructurado (JSON) para producción.
 *
 * POR QUÉ
 * Hasta ahora los mensajes salían como texto suelto. Cuando el sistema falla
 * en el servidor de planta, ese texto no se puede filtrar ni agrupar: hay que
 * leerlo a ojo. En JSON, cualquier visor —incluido el de Railway— permite
 * buscar por nivel, por módulo o por mensaje.
 *
 * SIN DEPENDENCIAS NUEVAS
 * Se extiende el logger que ya trae NestJS. Añadir pino o winston implicaría
 * una dependencia más que instalar y auditar en el servidor de Aceros, para
 * un beneficio que aquí no se necesita.
 *
 * En desarrollo se mantiene el formato legible de siempre: el JSON solo se
 * activa con LOG_FORMAT=json (que es lo que se pone en producción).
 */
export class StructuredLogger extends ConsoleLogger {
  private readonly json = process.env.LOG_FORMAT === 'json';

  private emitir(level: LogLevel, mensaje: any, contexto?: string, extra?: any) {
    if (!this.json) return null;
    const linea = {
      hora: new Date().toISOString(),
      nivel: level,
      modulo: contexto || this.context || 'app',
      mensaje: typeof mensaje === 'string' ? mensaje : JSON.stringify(mensaje),
      ...(extra ? { detalle: extra } : {}),
    };
    // Los errores van a stderr para que el servidor los pueda separar.
    const salida = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
    salida.write(JSON.stringify(linea) + '\n');
    return true;
  }

  log(mensaje: any, contexto?: string) {
    if (!this.emitir('log', mensaje, contexto)) super.log(mensaje, contexto as any);
  }

  warn(mensaje: any, contexto?: string) {
    if (!this.emitir('warn', mensaje, contexto)) super.warn(mensaje, contexto as any);
  }

  debug(mensaje: any, contexto?: string) {
    if (!this.emitir('debug', mensaje, contexto)) super.debug(mensaje, contexto as any);
  }

  verbose(mensaje: any, contexto?: string) {
    if (!this.emitir('verbose', mensaje, contexto)) super.verbose(mensaje, contexto as any);
  }

  error(mensaje: any, traza?: string, contexto?: string) {
    // La traza se recorta: en JSON una traza completa ensucia el registro y
    // las primeras líneas ya dicen dónde ocurrió.
    const detalle = traza ? { traza: String(traza).split('\n').slice(0, 6).join(' | ') } : undefined;
    if (!this.emitir('error', mensaje, contexto, detalle)) {
      super.error(mensaje, traza as any, contexto as any);
    }
  }
}
