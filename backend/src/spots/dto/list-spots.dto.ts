import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

export class ListSpotsQueryDto {
  // エリアタグ(都道府県名)での絞り込み
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  area?: string;

  // 前のページの最後の ID(nextCursor の値)。これより古い投稿を返す
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'cursor は整数で指定してください。' })
  @Min(1, { message: 'cursor は 1 以上で指定してください。' })
  cursor?: number;

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
