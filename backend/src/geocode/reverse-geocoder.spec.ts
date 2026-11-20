const send = vi.fn();
vi.mock('@aws-sdk/client-geo-places', () => ({
  GeoPlacesClient: class {
    send = send;
  },
  // 渡された入力を、そのまま確かめられるようにする
  ReverseGeocodeCommand: class {
    constructor(public readonly input: unknown) {}
  },
}));

const { AwsReverseGeocoder, formatAddress } =
  await import('./reverse-geocoder.js');

describe('formatAddress(AWS の住所のラベルから、住所の欄に入れる形にする)', () => {
  it('郵便番号の頭(〒…)を取り除く', () => {
    expect(formatAddress('〒605-0862 京都府京都市東山区清水1丁目294')).toBe(
      '京都府京都市東山区清水1丁目294',
    );
    expect(formatAddress('〒6050862 京都府京都市東山区清水1丁目294')).toBe(
      '京都府京都市東山区清水1丁目294',
    );
  });

  it('末尾の施設名(Title)を取り除く', () => {
    expect(
      formatAddress(
        '〒100-0005 東京都千代田区丸の内1丁目9 花形屋 丸の内店',
        '花形屋 丸の内店',
      ),
    ).toBe('東京都千代田区丸の内1丁目9');
  });

  it('施設名が住所の途中にあるときは、取り除かない', () => {
    expect(
      formatAddress('〒100-0005 東京都千代田区丸の内1丁目9', '丸の内'),
    ).toBe('東京都千代田区丸の内1丁目9');
  });

  it('郵便番号がないラベルは、そのまま(前後の空白だけ除く)', () => {
    expect(formatAddress('  熊本県熊本市中央区本丸1-1 ')).toBe(
      '熊本県熊本市中央区本丸1-1',
    );
  });

  it('空・未指定なら null', () => {
    expect(formatAddress(undefined)).toBeNull();
    expect(formatAddress('')).toBeNull();
    expect(formatAddress('〒100-0005 ')).toBeNull();
  });

  it('題(Title)が住所そのものなら、取り除かない(番地の住所の結果は、題が住所と同じ)', () => {
    expect(
      formatAddress(
        '〒605-0862 京都府京都市東山区清水1丁目294',
        '京都府京都市東山区清水1丁目294',
      ),
    ).toBe('京都府京都市東山区清水1丁目294');
  });
});

describe('AwsReverseGeocoder', () => {
  // 波括弧が必要: モック自体を返すと、vitest が、後片付けの関数として呼んでしまう
  beforeEach(() => {
    send.mockReset();
  });

  it('位置は [経度, 緯度] の順で、日本語・1 件だけを問い合わせる', async () => {
    send.mockResolvedValue({ ResultItems: [] });
    await new AwsReverseGeocoder().reverse(34.9949, 135.785);

    const command = send.mock.calls[0]![0] as { input: unknown };
    expect(command.input).toEqual({
      QueryPosition: [135.785, 34.9949],
      MaxResults: 1,
      Language: 'ja',
    });
  });

  it('先頭の結果の住所を、整形して返す', async () => {
    send.mockResolvedValue({
      ResultItems: [
        {
          PlaceType: 'PointAddress',
          Title: '京都府京都市東山区清水1丁目294',
          Address: { Label: '〒605-0862 京都府京都市東山区清水1丁目294' },
        },
      ],
    });
    await expect(
      new AwsReverseGeocoder().reverse(34.9949, 135.785),
    ).resolves.toBe('京都府京都市東山区清水1丁目294');
  });

  it('結果がなければ null(海上など)', async () => {
    send.mockResolvedValue({ ResultItems: [] });
    await expect(new AwsReverseGeocoder().reverse(0, 0)).resolves.toBeNull();
    send.mockResolvedValue({});
    await expect(new AwsReverseGeocoder().reverse(0, 0)).resolves.toBeNull();
  });
});
