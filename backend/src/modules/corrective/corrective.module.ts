import { Module } from '@nestjs/common';
import { CorrectiveService } from './corrective.service';
import { CorrectiveController } from './corrective.controller';

@Module({
  controllers: [CorrectiveController],
  providers: [CorrectiveService],
})
export class CorrectiveModule {}
