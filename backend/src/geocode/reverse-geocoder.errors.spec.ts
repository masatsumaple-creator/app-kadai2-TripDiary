// AWS が失敗したときの動き。成功時の動きは reverse-geocoder.spec.ts
// (失敗する側だけを、別のファイルにして、モックの状態が、成功時のテストに影響しないようにしてある)
const send = vi.fn();
vi.mock('@aws-sdk/client-geo-places', () => ({
  GeoPlacesClient: class {
    send = send;
  },
  ReverseGeocodeCommand: class {
    constructor(public readonly input: unknown) {}
  },
}));

const { AwsReverseGeocoder } = await import('./reverse-geocoder.js');

describe('AwsReverseGeocoder(失敗時)', () => {
  it('AWS のエラーは、握りつぶさず、そのまま投げる(API 側が 502 にする)', async () => {
    send.mockImplementation(() => Promise.reject(new Error('AccessDenied')));
    let caught: unknown;
    try {
      await new AwsReverseGeocoder().reverse(1, 1);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('AccessDenied');
  });
});
