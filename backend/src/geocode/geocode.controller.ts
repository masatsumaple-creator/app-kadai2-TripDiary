import { Controller, Get, Logger, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ApiError } from '../common/api-error.js';
import { ApiErrors } from '../common/api-doc.js';
import {
  ReverseGeocodeQueryDto,
  ReverseGeocodeResponse,
} from './geocode.dto.js';
import { ReverseGeocoder } from './reverse-geocoder.js';

@ApiTags('geocode')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('geocode')
export class GeocodeController {
  private readonly logger = new Logger(GeocodeController.name);

  constructor(private readonly geocoder: ReverseGeocoder) {}

  @Get('reverse')
  @ApiOperation({
    summary: '位置から住所を調べる(逆ジオコーディング)',
    description:
      '投稿フォームの「現在地から入力」で、緯度・経度から住所を自動入力するために使う。ログイン必須(外部のサービスを呼ぶため、未ログインには使わせない)。住所が見つからなければ address は null。外部のサービスに接続できないときは 502(画面では、住所の手入力に切り替える)。',
  })
  @ApiOkResponse({ type: ReverseGeocodeResponse })
  @ApiErrors(400, 401, 502)
  async reverse(
    @Query() query: ReverseGeocodeQueryDto,
  ): Promise<ReverseGeocodeResponse> {
    try {
      return { address: await this.geocoder.reverse(query.lat, query.lng) };
    } catch (e) {
      this.logger.warn(`Reverse geocoding failed: ${String(e)}`);
      throw new ApiError(
        502,
        'GEOCODE_UNAVAILABLE',
        '住所を取得できませんでした。住所を手入力してください。',
      );
    }
  }
}
