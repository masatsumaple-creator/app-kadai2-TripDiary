import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SpotsModule } from '../spots/spots.module.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

@Module({
  imports: [AuthModule, SpotsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
