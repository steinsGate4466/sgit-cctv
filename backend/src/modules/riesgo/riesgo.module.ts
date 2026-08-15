import { Module } from '@nestjs/common';
import { RiesgoService } from './riesgo.service';
import { RiesgoController } from './riesgo.controller';

/** Riesgo de quedarse sin recambio (bloque 32). Sin precios: se puede usar hoy. */
@Module({ controllers: [RiesgoController], providers: [RiesgoService], exports: [RiesgoService] })
export class RiesgoModule {}
