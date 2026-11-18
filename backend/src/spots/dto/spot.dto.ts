import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const VISIBILITIES = ['public', 'followers', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
// 空文字は「未入力」として扱う
const emptyToNull = ({ value }: { value: unknown }) => {
  const v = typeof value === 'string' ? value.trim() : value;
  return v === '' ? null : v;
};

const bothCoords = (o: SpotInputDto) =>
  o.latitude != null || o.longitude != null;

// 作成(POST)と更新(PUT、全項目を置き換える)で共通
export class SpotInputDto {
  @ApiProperty({
    type: 'string',
    minLength: 1,
    maxLength: 100,
    description: '場所名(前後の空白は除く)',
    example: '清水寺',
  })
  @Transform(trim)
  @IsString()
  @Length(1, 100, { message: '場所名は 1〜100 文字で入力してください。' })
  name: string;

  @ApiPropertyOptional({
    type: 'string',
    nullable: true,
    maxLength: 5000,
    description: '感想。空文字・省略は未入力(null)として扱う',
    example: '朝イチがおすすめ',
  })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: '感想は 5000 文字以内で入力してください。' })
  review?: string | null;

  @ApiPropertyOptional({
    type: 'string',
    nullable: true,
    maxLength: 255,
    description: '住所(自由記述)',
    example: '京都府京都市東山区清水1-294',
  })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '住所は 255 文字以内で入力してください。' })
  address?: string | null;

  // 緯度・経度は、どちらかを入れたら両方必要
  @ApiPropertyOptional({
    type: 'number',
    nullable: true,
    minimum: -90,
    maximum: 90,
    description: '緯度。経度とどちらかを入れたら、両方必要',
    example: 34.9949,
  })
  @ValidateIf(bothCoords)
  @IsNumber({}, { message: '緯度と経度は両方入力してください。' })
  @Min(-90, { message: '緯度は -90〜90 の範囲で入力してください。' })
  @Max(90, { message: '緯度は -90〜90 の範囲で入力してください。' })
  latitude?: number | null;

  @ApiPropertyOptional({
    type: 'number',
    nullable: true,
    minimum: -180,
    maximum: 180,
    description: '経度。緯度とどちらかを入れたら、両方必要',
    example: 135.785,
  })
  @ValidateIf(bothCoords)
  @IsNumber({}, { message: '緯度と経度は両方入力してください。' })
  @Min(-180, { message: '経度は -180〜180 の範囲で入力してください。' })
  @Max(180, { message: '経度は -180〜180 の範囲で入力してください。' })
  longitude?: number | null;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 3,
    uniqueItems: true,
    description:
      'エリアタグ(都道府県名)を 1〜3 個。重複不可。マスタにない名前は 400',
    example: ['京都府'],
  })
  @IsArray({ message: 'エリアタグを指定してください。' })
  @ArrayMinSize(1, { message: 'エリアタグは 1 個以上選んでください。' })
  @ArrayMaxSize(3, { message: 'エリアタグは 3 個までです。' })
  @ArrayUnique({ message: '同じエリアタグは重複して選べません。' })
  @IsString({ each: true })
  areas: string[];

  @ApiProperty({
    enum: VISIBILITIES,
    description:
      '公開範囲。public: 誰でも、followers: 投稿者のフォロワー、private: 本人のみ',
    example: 'public',
  })
  @IsIn(VISIBILITIES, { message: '公開範囲が正しくありません。' })
  visibility: Visibility;
}
