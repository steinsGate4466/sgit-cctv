import { Module } from '@nestjs/common';
import { SeguridadController } from './seguridad.controller';

/** Bloque 168 · la seguridad del trabajo sale de lo declarado, no del criterio de cada uno. */
@Module({ controllers: [SeguridadController] })
export class SeguridadModule {}
