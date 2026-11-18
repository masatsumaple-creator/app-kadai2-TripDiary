import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

// カーソル方式のページングの、共通のクエリ(cursor と limit)
export class PageQueryDto {
  // 前のページの最後の ID(nextCursor の値)
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description:
      '前のページの最後の ID(応答の nextCursor の値)。省略すると最初のページ',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'cursor は整数で指定してください。' })
  @Min(1, { message: 'cursor は 1 以上で指定してください。' })
  cursor?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
    description: '1 ページの件数',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit は整数で指定してください。' })
  @Min(1, { message: 'limit は 1 以上で指定してください。' })
  @Max(MAX_PAGE_SIZE, {
    message: `limit は ${MAX_PAGE_SIZE} 以下で指定してください。`,
  })
  limit?: number;
}
