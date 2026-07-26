import { Module } from '@nestjs/common';
import { PredictiveService } from './predictive.service';
import { PredictiveController } from './predictive.controller';

@Module({
  controllers: [PredictiveController],
  providers: [PredictiveService],
})
export class PredictiveModule {}
