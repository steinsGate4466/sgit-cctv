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
      // Datos que no encajan con el esquema (ej.: valor de enum inexistente).
      status = HttpStatus.BAD_REQUEST;
      message = 'Datos inválidos para esta operación (revisa los valores enviados).';
    }

    if (status >= 500) {
      // Solo los errores realmente inesperados se registran como error.
      this.logger.error(
        `${req?.method} ${req?.url} -> ${status} ${code || ''}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      statusCode: status,
      message,
      path: req?.url,
      timestamp: new Date().toISOString(),
    });
  }
}
