import { isSwaggerEnabled } from './openapi.js';

describe('isSwaggerEnabled', () => {
  it('本番以外では、既定で公開する', () => {
    expect(isSwaggerEnabled({})).toBe(true);
    expect(isSwaggerEnabled({ NODE_ENV: 'development' })).toBe(true);
  });

  it('本番では、既定で公開しない', () => {
    expect(isSwaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('SWAGGER_ENABLED が優先される', () => {
    expect(
      isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }),
    ).toBe(true);
    expect(
      isSwaggerEnabled({ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' }),
    ).toBe(false);
    expect(isSwaggerEnabled({ SWAGGER_ENABLED: 'yes' })).toBe(false);
  });

  it('空文字は未設定として扱う', () => {
    expect(
      isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: '' }),
    ).toBe(false);
  });
});
