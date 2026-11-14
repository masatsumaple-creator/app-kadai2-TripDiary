import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { hashPassword, verifyPassword } from './password.js';

export const REFRESH_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: number;
  name: string;
  email: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const invalidRefresh = () =>
  new ApiError(401, 'INVALID_REFRESH_TOKEN', 'ログインし直してください。');

@Injectable()
export class AuthService {
  // 存在しないメールでも scrypt を 1 回走らせ、応答時間でメールの有無を推測されにくくする
  private readonly dummyHash = hashPassword('dummy-password');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw this.emailTaken();

    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash: await hashPassword(dto.password),
        },
      });
      return this.issueTokens(user);
    } catch (e) {
      // 同時登録で一意制約に違反した場合
      if ((e as { code?: string }).code === 'P2002') throw this.emailTaken();
      throw e;
    }
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const ok = await verifyPassword(
      dto.password,
      user?.passwordHash ?? (await this.dummyHash),
    );
    if (!user || !ok) {
      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        'メールアドレスまたはパスワードが正しくありません。',
      );
    }
    return this.issueTokens(user);
  }

  // リフレッシュトークンは使うたびに失効させて作り直す(ローテーション)。
  // 失効済みのトークンが再び使われた場合は、盗用の可能性があるため全端末のトークンを失効させる。
  async refresh(rawToken: string | undefined): Promise<AuthResult> {
    if (!rawToken) throw invalidRefresh();
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!stored) throw invalidRefresh();

    if (stored.revokedAt) {
      await this.revokeAll(stored.userId);
      throw invalidRefresh();
    }
    if (stored.expiresAt <= new Date()) throw invalidRefresh();

    // 同時リクエストでも 1 回しか成功しないよう、未失効の行だけを更新する
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      await this.revokeAll(stored.userId);
      throw invalidRefresh();
    }
    return this.issueTokens(stored.user);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: number): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'ログインが必要です。');
    return this.toAuthUser(user);
  }

  private revokeAll(userId: number) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private emailTaken() {
    return new ApiError(
      409,
      'EMAIL_ALREADY_REGISTERED',
      'このメールアドレスは既に登録されています。',
    );
  }

  private toAuthUser(user: AuthUser): AuthUser {
    return { id: user.id, name: user.name, email: user.email };
  }

  private async issueTokens(user: AuthUser): Promise<AuthResult> {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    const accessToken = await this.jwt.signAsync({ sub: user.id });
    return { accessToken, refreshToken, user: this.toAuthUser(user) };
  }
}
