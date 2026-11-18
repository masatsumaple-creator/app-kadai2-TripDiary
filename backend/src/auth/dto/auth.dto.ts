import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({
    type: 'string',
    minLength: 1,
    maxLength: 50,
    description: '表示名(前後の空白は除く)',
    example: 'はるか',
  })
  @Transform(trim)
  @IsString()
  @Length(1, 50, { message: '表示名は 1〜50 文字で入力してください。' })
  name: string;

  @ApiProperty({
    type: 'string',
    format: 'email',
    maxLength: 255,
    description: 'メールアドレス(小文字に正規化して保存)',
    example: 'haruka@example.com',
  })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'メールアドレスの形式で入力してください。' })
  @MaxLength(255, {
    message: 'メールアドレスは 255 文字以内で入力してください。',
  })
  email: string;

  @ApiProperty({
    type: 'string',
    format: 'password',
    minLength: 8,
    maxLength: 128,
    example: 'your-password-here',
  })
  @IsString()
  @MinLength(8, { message: 'パスワードは 8 文字以上で入力してください。' })
  @MaxLength(128, { message: 'パスワードは 128 文字以内で入力してください。' })
  password: string;
}

export class LoginDto {
  @ApiProperty({
    type: 'string',
    format: 'email',
    example: 'haruka@example.com',
  })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'メールアドレスの形式で入力してください。' })
  email: string;

  @ApiProperty({
    type: 'string',
    format: 'password',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @MinLength(1, { message: 'パスワードを入力してください。' })
  @MaxLength(128)
  password: string;
}

// ログインしているユーザー本人の情報(本人にだけ返す。他人には返さない)
export class AuthUser {
  @ApiProperty({ type: 'integer', example: 1 })
  id: number;

  @ApiProperty({ type: 'string', example: 'はるか' })
  name: string;

  @ApiProperty({
    type: 'string',
    format: 'email',
    example: 'haruka@example.com',
  })
  email: string;
}

// 登録・ログイン・リフレッシュの応答。リフレッシュトークンは本文ではなく、HttpOnly の Cookie(refresh_token)で渡す
export class AuthResponse {
  @ApiProperty({
    type: 'string',
    description:
      'アクセストークン(JWT、有効期限 15 分)。Authorization: Bearer で送る',
  })
  accessToken: string;

  @ApiProperty({ type: () => AuthUser })
  user: AuthUser;
}
