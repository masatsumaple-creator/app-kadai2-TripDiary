import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import {
  PHOTO_CONTENT_TYPE_LIST,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_COUNT,
  UPLOAD_URL_TTL_SECONDS,
  VIEW_URL_TTL_SECONDS,
} from './photo-config.js';
import type { PhotoContentType } from './photo-config.js';

export class CreatePhotoUploadDto {
  @ApiProperty({
    enum: PHOTO_CONTENT_TYPE_LIST,
    description: '画像の形式(JPEG・PNG・WebP)',
    example: 'image/jpeg',
  })
  @IsIn(PHOTO_CONTENT_TYPE_LIST, {
    message: '写真は JPEG・PNG・WebP のいずれかにしてください。',
  })
  contentType: PhotoContentType;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: PHOTO_MAX_BYTES,
    description: '画像の大きさ(バイト)。1 枚 5MB まで',
    example: 350000,
  })
  @IsInt({ message: '写真の大きさを、整数で指定してください。' })
  @Min(1, { message: '写真が空です。' })
  @Max(PHOTO_MAX_BYTES, { message: '写真は 1 枚 5MB 以下にしてください。' })
  size: number;
}

export class PhotoUploadResponse {
  @ApiProperty({ type: 'integer', example: 12 })
  photoId: number;

  @ApiProperty({
    type: 'string',
    description: `アップロード先の URL(S3 の署名付き URL。${UPLOAD_URL_TTL_SECONDS} 秒間だけ有効)。この URL へ、画像を PUT する`,
  })
  uploadUrl: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'PUT のときに付けるヘッダー(署名に含まれているため、この値のとおりに付ける)',
    example: { 'Content-Type': 'image/jpeg' },
  })
  headers: Record<string, string>;
}

export class PhotoResponse {
  @ApiProperty({ type: 'integer', example: 12 })
  id: number;

  @ApiProperty({
    type: 'string',
    description: `表示用の URL(S3 の署名付き URL。${VIEW_URL_TTL_SECONDS} 秒間だけ有効。期限が切れたら、投稿を取り直す)`,
  })
  url: string;
}

export const PHOTO_LIMIT_DESCRIPTION = `1 投稿に付けられる写真は、最大 ${PHOTO_MAX_COUNT} 枚`;
