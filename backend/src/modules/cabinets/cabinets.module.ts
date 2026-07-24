import { Module } from '@nestjs/common';
import { CabinetsService } from './cabinets.service';
import { CabinetsController } from './cabinets.controller';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [CabinetsController],
  providers: [CabinetsService],
})
export class CabinetsModule {}
