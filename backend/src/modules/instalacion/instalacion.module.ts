import { Module } from '@nestjs/common';
import { InstalacionService } from './instalacion.service';
import { InstalacionController } from './instalacion.controller';
import { AuditModule } from '../audit/audit.module';

/**
 * INSTALACIONES (bloque 16). Poner equipo nuevo, con el formulario adaptado
 * al sitio: oficina, púlpito, grúa, sala eléctrica, patio, nave.
 * Termina creando el activo en el inventario.
 */
@Module({
  imports: [AuditModule],
  controllers: [InstalacionController],
  providers: [InstalacionService],
  exports: [InstalacionService],
})
export class InstalacionModule {}
