import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import {
  AuthRateLimiter,
  rateLimitOptionsFromEnv,
} from './auth-rate-limiter.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard, OptionalJwtAuthGuard } from './jwt-auth.guard.js';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env['JWT_SECRET'];
        if (!secret) throw new Error('JWT_SECRET is not set');
        return {
          secret,
          signOptions: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    // ログイン・登録の回数の制限(上限は、環境変数で変えられる)
    {
      provide: AuthRateLimiter,
      useFactory: () => new AuthRateLimiter(rateLimitOptionsFromEnv()),
    },
  ],
  exports: [JwtModule, JwtAuthGuard, OptionalJwtAuthGuard],
})
export class AuthModule {}
