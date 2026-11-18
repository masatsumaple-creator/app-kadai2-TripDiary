import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SpotsModule } from '../spots/spots.module.js';
import { ListsController } from './lists.controller.js';
import { ListsService } from './lists.service.js';

@Module({
  imports: [AuthModule, SpotsModule],
  controllers: [ListsController],
  providers: [ListsService],
})
export class ListsModule {}
