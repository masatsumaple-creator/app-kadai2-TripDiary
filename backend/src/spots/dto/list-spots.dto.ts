import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PageQueryDto, emptyToUndefined } from '../../common/page-query.dto.js';

// ページング(cursor、limit)は PageQueryDto から引き継ぐ
export class ListSpotsQueryDto extends PageQueryDto {
  // エリアタグ(都道府県名)での絞り込み
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  area?: string;

  // この ID のユーザーの投稿だけにする(プロフィールの投稿一覧)
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'author は整数で指定してください。' })
  @Min(1, { message: 'author は 1 以上で指定してください。' })
  author?: number;

  // 'true' なら、ログイン中のユーザーがフォローしている人の投稿だけにする(フォロー中一覧)。要ログイン
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsIn(['true', 'false'], {
    message: "following は 'true' か 'false' で指定してください。",
  })
  following?: 'true' | 'false';
}
