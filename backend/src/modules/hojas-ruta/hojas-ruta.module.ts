import { Module } from '@nestjs/common';
import { HojasRutaController } from './hojas-ruta.controller';
import { HojasRutaService } from './hojas-ruta.service';
import { PrismaModule } from '../../prisma/prisma.module';

/* Toda clase inyectada por constructor DEBE estar en `providers` de su módulo.
   Faltó `BandejaService` una vez y tiró producción al arrancar (bloque 3).
   Lo vigila `verificar:inyeccion`. */
@Module({
  imports: [PrismaModule],
  controllers: [HojasRutaController],
  providers: [HojasRutaService],
  exports: [HojasRutaService],
})
export class HojasRutaModule {}
