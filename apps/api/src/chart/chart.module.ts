import { Module } from '@nestjs/common';
import { ChartController } from './chart.controller.js';
import { ChartService } from './chart.service.js';

@Module({
  controllers: [ChartController],
  providers: [ChartService],
})
export class ChartModule {}
