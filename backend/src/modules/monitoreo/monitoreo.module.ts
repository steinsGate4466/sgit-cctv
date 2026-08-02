import { Module } from '@nestjs/common';
import { MonitoreoService } from './monitoreo.service';
import { MonitoreoController } from './monitoreo.controller';

/**
 * MONITOREO — bloque 8, montado y en espera.
 *
 * Sin agentes dados de alta no llega ni un reporte y el sistema funciona
 * exactamente igual que hoy. El día que TI autorice: se crea un agente, se
 * instala el script de `agente/` en una máquina de planta y empieza a llegar
 * información. Cero cambios de esquema, cero despliegues.
 */
@Module({
  controllers: [MonitoreoController],
  providers: [MonitoreoService],
  exports: [MonitoreoService],
})
export class MonitoreoModule {}
