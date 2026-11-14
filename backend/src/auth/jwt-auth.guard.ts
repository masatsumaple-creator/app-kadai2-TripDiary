import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ApiError } from '../common/api-error.js';

// user は、ログイン必須の API では必ず入り、ログイン任意の API では未ログインなら undefined
export type AuthenticatedRequest = Request & { user?: { id: number } };

const unauthorized = () =>
  new ApiError(401, 'UNAUTHORIZED', 'ログインが必要です。');

async function authenticate(
  jwt: JwtService,
  req: AuthenticatedRequest,
): Promise<boolean> {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return false;
  try {
    const payload = await jwt.verifyAsync<{ sub: number }>(token);
    req.user = { id: payload.sub };
    return true;
  } catch {
    throw unauthorized();
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!(await authenticate(this.jwt, req))) throw unauthorized();
    return true;
  }
}

// ログインしていなくても使える API 用。
// トークンがなければ未ログインとして通す。トークンがあるのに不正・期限切れなら 401 にして、
// クライアントがリフレッシュして再試行できるようにする(未ログイン扱いにすると、期限切れが静かに権限不足になる)。
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await authenticate(this.jwt, req);
    return true;
  }
}
