import { HttpException } from '@nestjs/common';

export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

// エラー応答は { code, message, fieldErrors? } に統一する
export class ApiError extends HttpException {
  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors?: Record<string, string[]>,
  ) {
    const body: ApiErrorBody = { code, message };
    if (fieldErrors) body.fieldErrors = fieldErrors;
    super(body, status);
  }
}
