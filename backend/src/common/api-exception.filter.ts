import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiError } from './api-error.js';
import type { ApiErrorBody } from './api-error.js';

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
};

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value
  );
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isApiErrorBody(body)) {
        if (exception instanceof ApiError && exception.retryAfterSeconds) {
          res.setHeader('Retry-After', String(exception.retryAfterSeconds));
        }
        res.status(status).json(body);
        return;
      }
      // Nest 標準の例外(404 など)の message は文字列または文字列の配列
      const raw =
        typeof body === 'string'
          ? body
          : (body as { message?: string | string[] }).message;
      const message = Array.isArray(raw)
        ? raw.join(', ')
        : (raw ?? exception.message);
      res.status(status).json({
        code: DEFAULT_CODES[status] ?? 'ERROR',
        message,
      } satisfies ApiErrorBody);
      return;
    }

    // 想定外のエラーは内容を返さず、ログにだけ残す
    this.logger.error(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'サーバーでエラーが発生しました。',
    } satisfies ApiErrorBody);
  }
}
