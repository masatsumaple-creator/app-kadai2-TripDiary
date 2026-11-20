import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';

// OpenAPI の共通部品。エラー応答の形(`{ code, message, fieldErrors? }`)と、
// 各 API に付けるエラー応答の説明をまとめる。

export class ApiErrorResponse {
  @ApiProperty({
    type: 'string',
    description: 'エラーの種類(例: VALIDATION_ERROR、UNAUTHORIZED、NOT_FOUND)',
    example: 'VALIDATION_ERROR',
  })
  code: string;

  @ApiProperty({
    type: 'string',
    description: '利用者に表示できるメッセージ',
    example: '入力内容に誤りがあります。',
  })
  message: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    description: '入力エラーのとき、項目名ごとのメッセージ',
    example: { name: ['場所名は 1〜100 文字で入力してください。'] },
  })
  fieldErrors?: Record<string, string[]>;
}

// ユーザーの要約(投稿者、コメントした人)。メールアドレスなどの個人情報は含めない
export class UserSummary {
  @ApiProperty({ type: 'integer', example: 1 })
  id: number;

  @ApiProperty({ type: 'string', example: 'はるか' })
  name: string;
}

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: '入力が正しくない(VALIDATION_ERROR など)',
  401: 'ログインが必要、またはトークンが不正・期限切れ(UNAUTHORIZED)',
  403: '権限がない(FORBIDDEN)',
  404: '見つからない。閲覧できない投稿・ユーザーも、存在しない場合と同じ 404 を返し、存在を知らせない(NOT_FOUND)',
  409: 'すでに登録されている(CONFLICT)',
  429: '回数の制限に達した(TOO_MANY_REQUESTS)。Retry-After ヘッダーに、やり直せるまでの秒数',
};

// エラー応答(すべて ApiErrorResponse の形)を、ステータスごとに説明する
export const ApiErrors = (...statuses: number[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: ERROR_DESCRIPTIONS[status] ?? 'エラー',
        type: ApiErrorResponse,
      }),
    ),
  );

// 「ログインは任意」の API 用。アクセストークンなしでも呼べる(OpenAPI の security に、空の要件 {} を加える)。
// トークンを付けたのに不正・期限切れなら 401(未ログイン扱いにはしない)
export const ApiOptionalBearerAuth = () =>
  applyDecorators(ApiBearerAuth('bearer'), ApiSecurity({}));
