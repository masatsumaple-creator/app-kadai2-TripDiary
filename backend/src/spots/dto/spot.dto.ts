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
  @Transform(trim)
  @IsString()
  @Length(1, 100, { message: '場所名は 1〜100 文字で入力してください。' })
  name: string;

  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: '感想は 5000 文字以内で入力してください。' })
  review?: string | null;

  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '住所は 255 文字以内で入力してください。' })
  address?: string | null;

  // 緯度・経度は、どちらかを入れたら両方必要
  @ValidateIf(bothCoords)
  @IsNumber({}, { message: '緯度と経度は両方入力してください。' })
  @Min(-90, { message: '緯度は -90〜90 の範囲で入力してください。' })
  @Max(90, { message: '緯度は -90〜90 の範囲で入力してください。' })
  latitude?: number | null;

  @ValidateIf(bothCoords)
  @IsNumber({}, { message: '緯度と経度は両方入力してください。' })
  @Min(-180, { message: '経度は -180〜180 の範囲で入力してください。' })
  @Max(180, { message: '経度は -180〜180 の範囲で入力してください。' })
  longitude?: number | null;

  @IsArray({ message: 'エリアタグを指定してください。' })
  @ArrayMinSize(1, { message: 'エリアタグは 1 個以上選んでください。' })
  @ArrayMaxSize(3, { message: 'エリアタグは 3 個までです。' })
  @ArrayUnique({ message: '同じエリアタグは重複して選べません。' })
  @IsString({ each: true })
  areas: string[];

  @IsIn(VISIBILITIES, { message: '公開範囲が正しくありません。' })
  visibility: Visibility;
}
