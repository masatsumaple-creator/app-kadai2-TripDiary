import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SpotsModule } from '../spots/spots.module.js';
import { PhotoStorageModule } from './photo-storage.module.js';
import { PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';

@Module({
  imports: [AuthModule, SpotsModule, PhotoStorageModule],
  controllers: [PhotosController],
  providers: [PhotosService],
})
export class PhotosModule {}
