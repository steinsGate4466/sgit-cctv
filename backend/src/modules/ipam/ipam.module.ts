import { Module } from '@nestjs/common';
import { IpamService } from './ipam.service';
import { IpamController } from './ipam.controller';
import { AuditModule } from '../audit/audit.module';

/**
 * DIRECCIONAMIENTO IP (bloque 20). Contesta «¿qué IP le pongo?» y saca a la
 * luz lo que está mal: duplicadas, estáticas dentro del pool del DHCP, y
 * direcciones que no caen en ninguna subred declarada.
 */
@Module({
  imports: [AuditModule],
  controllers: [IpamController],
  providers: [IpamService],
  exports: [IpamService],
})
export class IpamModule {}
