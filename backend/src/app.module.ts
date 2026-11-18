import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CommentsModule } from './comments/comments.module.js';
import { FollowsModule } from './follows/follows.module.js';
import { LikesModule } from './likes/likes.module.js';
import { ListsModule } from './lists/lists.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SpotsModule } from './spots/spots.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SpotsModule,
    UsersModule,
    FollowsModule,
    LikesModule,
    CommentsModule,
    ListsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
