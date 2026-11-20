import {
  INestApplication,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { Application } from 'express';
import { ApiError } from './common/api-error.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';

function toFieldErrors(errors: ValidationError[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const e of errors) {
    result[e.property] = Object.values(e.constraints ?? {});
  }
  return result;
}

// main.ts と e2e テストで共通のアプリ設定
export function configureApp(app: INestApplication): void {
  // プロキシ(CloudFront → ALB)の後ろでは、本当の接続元の IP を、X-Forwarded-For から求める。
  // 値は、信頼するプロキシの段数(CloudFront と ALB で 2)。**信頼する段数より左の値は、利用者が偽れるため、使わない**。
  // 指定がなければ(ローカル・テスト)、プロキシなしとして、直接の接続元を使う
  const hops = Number(process.env['TRUST_PROXY']);
  if (Number.isInteger(hops) && hops > 0) {
    (app.getHttpAdapter().getInstance() as Application).set(
      'trust proxy',
      hops,
    );
  }
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new ApiError(
          400,
          'VALIDATION_ERROR',
          '入力内容に誤りがあります。',
          toFieldErrors(errors),
        ),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
}
