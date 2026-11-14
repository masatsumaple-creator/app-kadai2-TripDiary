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
  @Transform(trim)
  @IsString()
  @Length(1, 50, { message: '表示名は 1〜50 文字で入力してください。' })
  name: string;

  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'メールアドレスの形式で入力してください。' })
  @MaxLength(255, {
    message: 'メールアドレスは 255 文字以内で入力してください。',
  })
  email: string;

  @IsString()
  @MinLength(8, { message: 'パスワードは 8 文字以上で入力してください。' })
  @MaxLength(128, { message: 'パスワードは 128 文字以内で入力してください。' })
  password: string;
}

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'メールアドレスの形式で入力してください。' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'パスワードを入力してください。' })
  @MaxLength(128)
  password: string;
}
