import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { toNumber } from '../../common/number-query.js';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { emptyToUndefined } from '../../common/page-query.dto.js';
import { VISIBILITIES } from './spot.dto.js';
import type { Visibility } from './spot.dto.js';

// 地図 1 画面で返す、最大の件数(docs/00_要件定義書.md の「地図の表示範囲取得 API」)
export const MAP_SPOTS_LIMIT = 100;

const coordinate = (label: string, min: number, max: number) => ({
  type: 'number' as const,
  minimum: min,
  maximum: max,
  description: label,
});

const range = (label: string, min: number, max: number) =>
  `${label}は ${min}〜${max} の数値で指定してください。`;

// 表示範囲(南西の角と、北東の角)。経度は、日付変更線をまたぐ範囲(南西の経度 > 北東の経度)も指定できる
export class MapSpotsQueryDto {
  @ApiProperty(coordinate('範囲の南西の角の緯度', -90, 90))
  @Transform(toNumber)
  @IsNumber({}, { message: range('swLat', -90, 90) })
  @Min(-90, { message: range('swLat', -90, 90) })
  @Max(90, { message: range('swLat', -90, 90) })
  swLat: number;

  @ApiProperty(coordinate('範囲の南西の角の経度', -180, 180))
  @Transform(toNumber)
  @IsNumber({}, { message: range('swLng', -180, 180) })
  @Min(-180, { message: range('swLng', -180, 180) })
  @Max(180, { message: range('swLng', -180, 180) })
  swLng: number;

  @ApiProperty(coordinate('範囲の北東の角の緯度', -90, 90))
  @Transform(toNumber)
  @IsNumber({}, { message: range('neLat', -90, 90) })
  @Min(-90, { message: range('neLat', -90, 90) })
  @Max(90, { message: range('neLat', -90, 90) })
  neLat: number;

  @ApiProperty(coordinate('範囲の北東の角の経度', -180, 180))
  @Transform(toNumber)
  @IsNumber({}, { message: range('neLng', -180, 180) })
  @Min(-180, { message: range('neLng', -180, 180) })
  @Max(180, { message: range('neLng', -180, 180) })
  neLng: number;

  @ApiPropertyOptional({
    type: 'string',
    description: 'エリアタグ(都道府県名)で絞り込む。マスタにない名前は 400',
    example: '京都府',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  area?: string;
}

// 地図のピン 1 つ分(感想・写真・いいねなどは含めない。詳細で取得する)
export class MapSpotItem {
  @ApiProperty({ type: 'integer', example: 1 })
  id: number;

  @ApiProperty({ type: 'string', example: '清水寺' })
  name: string;

  @ApiProperty({ type: 'number', example: 34.9949 })
  latitude: number;

  @ApiProperty({ type: 'number', example: 135.785 })
  longitude: number;

  @ApiProperty({ type: [String], example: ['京都府'] })
  areas: string[];

  @ApiProperty({ enum: VISIBILITIES })
  visibility: Visibility;
}

export class MapSpotsResponse {
  @ApiProperty({
    type: () => [MapSpotItem],
    description: `範囲内の、閲覧できる投稿(位置のあるものだけ)。新着順で、最大 ${MAP_SPOTS_LIMIT} 件`,
  })
  items: MapSpotItem[];

  @ApiProperty({
    type: 'boolean',
    description: `範囲内に、${MAP_SPOTS_LIMIT} 件を超える投稿があり、一部を省いたか(true なら、地図を拡大して、絞り込む)`,
  })
  truncated: boolean;
}
