import { Module } from '@nestjs/common';
import { CredentialsService } from './credentials.service';
import { CredentialsController } from './credentials.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule], // para inyectar AuditService (auditar revelaciones)
  controllers: [CredentialsController],
  providers: [CredentialsService],
})
export class CredentialsModule {}
