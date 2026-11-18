import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SpotsModule } from '../spots/spots.module.js';
import { LikesController } from './likes.controller.js';
import { LikesService } from './likes.service.js';

@Module({
  imports: [AuthModule, SpotsModule],
  controllers: [LikesController],
  providers: [LikesService],
})
export class LikesModule {}
