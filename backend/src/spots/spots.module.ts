import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SpotsController } from './spots.controller.js';
import { SpotsService } from './spots.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SpotsController],
  providers: [SpotsService],
})
export class SpotsModule {}
