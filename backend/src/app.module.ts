import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SpotsModule } from './spots/spots.module.js';

@Module({
  imports: [PrismaModule, AuthModule, SpotsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
