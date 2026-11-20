import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { toNumber } from '../common/number-query.js';
import { IsNumber, Max, Min } from 'class-validator';

export class ReverseGeocodeQueryDto {
  @ApiProperty({
    type: 'number',
    minimum: -90,
    maximum: 90,
    description: '緯度',
    example: 34.9949,
  })
  @Transform(toNumber)
  @IsNumber({}, { message: 'lat は -90〜90 の数値で指定してください。' })
  @Min(-90, { message: 'lat は -90〜90 の数値で指定してください。' })
  @Max(90, { message: 'lat は -90〜90 の数値で指定してください。' })
  lat: number;

  @ApiProperty({
    type: 'number',
    minimum: -180,
    maximum: 180,
    description: '経度',
    example: 135.785,
  })
  @Transform(toNumber)
  @IsNumber({}, { message: 'lng は -180〜180 の数値で指定してください。' })
  @Min(-180, { message: 'lng は -180〜180 の数値で指定してください。' })
  @Max(180, { message: 'lng は -180〜180 の数値で指定してください。' })
  lng: number;
}

export class ReverseGeocodeResponse {
  @ApiProperty({
    type: 'string',
    nullable: true,
    description:
      '住所(日本語。郵便番号・施設名は含まない)。その位置に住所が見つからなければ null',
    example: '京都府京都市東山区清水1丁目294',
  })
  address: string | null;
}
