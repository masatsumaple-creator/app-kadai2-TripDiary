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
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { ApiErrors } from '../common/api-doc.js';
import { AuthService, REFRESH_TOKEN_TTL_MS } from './auth.service.js';
import type { AuthResult } from './auth.service.js';
import {
  AuthResponse,
  AuthUser,
  LoginDto,
  RegisterDto,
} from './dto/auth.dto.js';
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

const SET_COOKIE_HEADER = {
  'Set-Cookie': {
    description:
      'リフレッシュトークン(refresh_token)。HttpOnly・SameSite=Strict・Path=/api/auth(本番は Secure も付く)。有効期限 14 日。使うたびに作り直される',
    schema: { type: 'string' },
  },
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: '新規登録',
    description:
      'ユーザーを作成し、そのままログインした状態にする。メールアドレスは小文字に正規化され、重複は 409。',
  })
  @ApiCreatedResponse({
    type: AuthResponse,
    headers: SET_COOKIE_HEADER,
    description:
      '登録できた。アクセストークンを本文で、リフレッシュトークンを Cookie で返す',
  })
  @ApiErrors(400, 409)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.register(dto));
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ログイン',
    description:
      'パスワードの誤りと、未登録のメールアドレスは、同じ 401(INVALID_CREDENTIALS)を返す(アカウントの有無を知らせない)。',
  })
  @ApiOkResponse({ type: AuthResponse, headers: SET_COOKIE_HEADER })
  @ApiErrors(400, 401)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.login(dto));
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'アクセストークンの再発行',
    description:
      'Cookie のリフレッシュトークンで、新しいアクセストークンを発行する。リフレッシュトークンは使い捨てで、使うと新しいものに置き換わる(ローテーション)。使用済みのトークンが再び使われた場合は、盗用の可能性があるため、そのユーザーの全トークンを失効させて 401 を返す。',
  })
  @ApiOkResponse({ type: AuthResponse, headers: SET_COOKIE_HEADER })
  @ApiErrors(401)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE
    ];
    return this.respond(res, await this.auth.refresh(token));
  }

  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'ログアウト',
    description:
      'Cookie のリフレッシュトークンを失効させ、Cookie を消す。ログインしていなくても 204(何度実行しても同じ)。',
  })
  @ApiNoContentResponse({ description: 'ログアウトした' })
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ログイン中のユーザー本人の情報' })
  @ApiOkResponse({ type: AuthUser })
  @ApiErrors(401)
  me(@Req() req: AuthenticatedRequest): Promise<AuthUser> {
    return this.auth.me(req.user!.id);
  }

  private respond(res: Response, result: AuthResult): AuthResponse {
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...cookieOptions(),
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
    return { accessToken: result.accessToken, user: result.user };
  }
}
