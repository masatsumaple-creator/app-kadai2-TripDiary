import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ApiError } from '../common/api-error.js';

export type AuthenticatedRequest = Request & { user: { id: number } };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw this.unauthorized();
    try {
      const payload = await this.jwt.verifyAsync<{ sub: number }>(token);
      req.user = { id: payload.sub };
      return true;
    } catch {
      throw this.unauthorized();
    }
  }

  private unauthorized() {
    return new ApiError(401, 'UNAUTHORIZED', 'ログインが必要です。');
  }
}
