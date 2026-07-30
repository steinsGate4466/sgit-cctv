import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Filtro global de excepciones.
 * Traduce errores técnicos (Prisma, enum inválido, etc.) a mensajes claros en
 * español, con el código HTTP correcto, en vez de un "Internal server error" genérico.
 * Los detalles completos quedan en el log del servidor (no se filtran al cliente).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req: any = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor.';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      // Errores esperados (validación, permisos, not found, firma inválida...).
      status = exception.getStatus();
      const body: any = exception.getResponse();
      message = typeof body === 'string' ? body : body?.message ?? exception.message;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Errores de base de datos con código conocido.
      code = exception.code;
      switch (exception.code) {
        case 'P2002': {
          const fields = (exception.meta?.target as string[] | undefined)?.join(', ') || 'campo único';
          status = HttpStatus.CONFLICT;
          message = `Ya existe un registro con ese ${fields}.`;
          break;
        }
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Referencia inválida: el registro relacionado no existe.';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'El registro solicitado no existe.';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'No se pudo completar la operación en la base de datos.';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      // La CONSULTA no encaja con el esquema: un campo que no existe, un
      // select mal formado, un valor de enum inexistente. Es un fallo del
      // servidor, aunque se responda 400.
      code = 'PRISMA_VALIDACION';
      status = HttpStatus.BAD_REQUEST;
      message = 'Datos inválidos para esta operación (revisa los valores enviados).';
    }

    // ------------------------------------------------------------------ LOG
    // ANTES: solo se registraba a partir de 500. Consecuencia real: un error de
    // Prisma que este filtro traduce a 400 no dejaba NINGÚN rastro en el log, y
    // el cliente recibía un mensaje genérico sin el código. Diagnosticarlo era
    // imposible sin adivinar.
    //
    // AHORA: cualquier excepción que NO sea una HttpException esperada se
    // registra completa, con su código y su traza, sea cual sea el estado con
    // el que se responda. Una excepción no prevista es un defecto del servidor
    // por definición: el estado HTTP con el que se conteste no cambia eso.
    const esperada = exception instanceof HttpException;
    if (!esperada || status >= 500) {
      const detalle = exception instanceof Error
        ? `${exception.name}: ${exception.message}`
        : String(exception);
      this.logger.error(
        `${req?.method} ${req?.url} -> ${status} ${code || ''} | ${detalle}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(status).json({
      statusCode: status,
      message,
      // El CÓDIGO sí se devuelve (P2002, P2023, PRISMA_VALIDACION...). No revela
      // datos ni estructura de la base, y es lo primero que se necesita para
      // saber qué pasó. El mensaje técnico completo se queda en el log.
      ...(code ? { code } : {}),
      path: req?.url,
      timestamp: new Date().toISOString(),
    });
  }
}
