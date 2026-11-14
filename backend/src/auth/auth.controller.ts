import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService, REFRESH_TOKEN_TTL_MS } from './auth.service.js';
import type { AuthResult, AuthUser } from './auth.service.js';
import { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

export const REFRESH_COOKIE = 'refresh_token';

// リフレッシュトークンは JS から読めない HttpOnly Cookie で渡す。
// フロントと API は同一オリジンなので SameSite=Strict にできる。
const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env['NODE_ENV'] === 'production',
  path: '/api/auth',
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.register(dto));
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.login(dto));
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE
    ];
    return this.respond(res, await this.auth.refresh(token));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE
    ];
    await this.auth.logout(token);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthenticatedRequest): Promise<AuthUser> {
    return this.auth.me(req.user!.id);
  }

  private respond(res: Response, result: AuthResult) {
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...cookieOptions(),
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
    return { accessToken: result.accessToken, user: result.user };
  }
}
