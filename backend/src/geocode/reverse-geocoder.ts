import { Injectable, Logger } from '@nestjs/common';
import {
  GeoPlacesClient,
  ReverseGeocodeCommand,
} from '@aws-sdk/client-geo-places';

// 緯度・経度から、住所(日本語)を引く。AWS 以外(テストの偽物など)に差し替えられるよう、抽象にしてある
export abstract class ReverseGeocoder {
  // 見つからなければ null
  abstract reverse(latitude: number, longitude: number): Promise<string | null>;
}

// Amazon Location Service の応答の住所(Label)は、「〒100-0005 東京都千代田区丸の内1丁目9 <施設名>」の形。
// 住所の欄には、郵便番号の頭(〒…)と、末尾の施設名を取り除いた、「東京都千代田区丸の内1丁目9」を入れる
export function formatAddress(
  label: string | undefined,
  title?: string,
): string | null {
  if (!label) return null;
  let address = label.replace(/^〒\s*\d{3}-?\d{4}\s*/, '').trim();
  if (title && address.endsWith(title)) {
    const withoutTitle = address.slice(0, address.length - title.length).trim();
    // 施設名が、住所そのもの(番地の住所の結果は、題が住所と同じ)のときは、取り除かない
    if (withoutTitle !== '') address = withoutTitle;
  }
  return address === '' ? null : address;
}

@Injectable()
export class AwsReverseGeocoder extends ReverseGeocoder {
  private readonly logger = new Logger(AwsReverseGeocoder.name);
  private client?: GeoPlacesClient;

  // 認証は、AWS の標準の方法(ECS ではタスクロール。ローカルでは AWS_ACCESS_KEY_ID など)
  private getClient(): GeoPlacesClient {
    this.client ??= new GeoPlacesClient({
      region: process.env['LOCATION_REGION'] || 'ap-northeast-1',
    });
    return this.client;
  }

  async reverse(latitude: number, longitude: number): Promise<string | null> {
    // 位置は [経度, 緯度] の順
    const res = await this.getClient().send(
      new ReverseGeocodeCommand({
        QueryPosition: [longitude, latitude],
        MaxResults: 1,
        Language: 'ja',
      }),
    );
    const item = res.ResultItems?.[0];
    if (!item) return null;
    const address = formatAddress(item.Address?.Label, item.Title);
    this.logger.debug(`reverse geocode: ${item.PlaceType ?? '-'}`);
    return address;
  }
}
