import { Module } from '@nestjs/common';
import { CriticidadController } from './criticidad.controller';
import { CriticidadService } from './criticidad.service';
import { PrismaModule } from '../../prisma/prisma.module';

/* Toda clase inyectada por constructor DEBE estar en `providers` de su módulo.
   Faltó `BandejaService` una vez y tiró producción al arrancar. Lo vigila
   `verificar:inyeccion`.

   Se exporta porque la ficha del activo también pinta la letra: sin exportarlo,
   `AssetsModule` no puede inyectarlo. */
@Module({
  imports: [PrismaModule],
  controllers: [CriticidadController],
  providers: [CriticidadService],
  exports: [CriticidadService],
})
export class CriticidadModule {}
