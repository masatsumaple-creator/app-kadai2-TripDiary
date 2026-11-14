import {
  INestApplication,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
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
