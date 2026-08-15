import { Module } from '@nestjs/common';
import { EstandaresController } from './estandares.controller';

/** Estándar de rotulado y color (bloque 30). Sin servicio ni base de datos:
 *  es una norma, no un dato que cambie. */
@Module({ controllers: [EstandaresController] })
export class EstandaresModule {}
