import { ApiError } from '../common/api-error.js';
import { PhotoStorage } from './photo-storage.service.js';

describe('PhotoStorage の設定', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('S3_BUCKET がないと、503(STORAGE_NOT_CONFIGURED)で、写真の機能だけが使えない', async () => {
    delete process.env['S3_BUCKET'];
    const storage = new PhotoStorage();
    await expect(storage.presignView('spots/1/a.png')).rejects.toMatchObject({
      constructor: ApiError,
      status: 503,
    });
    await expect(
      storage.presignUpload('spots/1/a.png', 'image/png', 10),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('署名付き URL は、バケット・キーを含み、期限と署名が付く(ネットワークには接続しない)', async () => {
    process.env['S3_BUCKET'] = 'bucket-x';
    process.env['S3_ENDPOINT'] = 'http://localhost:9090';
    process.env['AWS_ACCESS_KEY_ID'] = 'local';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'local';
    const storage = new PhotoStorage();

    const view = new URL(await storage.presignView('spots/1/a.png'));
    expect(view.pathname).toBe('/bucket-x/spots/1/a.png');
    expect(view.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(view.searchParams.get('X-Amz-Signature')).toBeTruthy();

    const upload = new URL(
      await storage.presignUpload('spots/1/a.png', 'image/png', 1234),
    );
    expect(upload.searchParams.get('X-Amz-Expires')).toBe('300');
    // 種類と大きさを署名に含める(別の種類・大きさの PUT は、S3 が拒否する)
    expect(upload.searchParams.get('X-Amz-SignedHeaders')).toContain(
      'content-length',
    );
    expect(upload.searchParams.get('X-Amz-SignedHeaders')).toContain(
      'content-type',
    );
  });
});

describe('PhotoStorage の表示用 URL(障害時)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('保存先が設定されていなくても、例外にせず null を返す(投稿の一覧・詳細を止めない)', async () => {
    delete process.env['S3_BUCKET'];
    const storage = new PhotoStorage();
    await expect(
      storage.presignViewOrNull('spots/1/a.png'),
    ).resolves.toBeNull();
  });

  it('設定があれば、署名付き URL を返す', async () => {
    process.env['S3_BUCKET'] = 'bucket-x';
    process.env['S3_ENDPOINT'] = 'http://localhost:9090';
    process.env['AWS_ACCESS_KEY_ID'] = 'local';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'local';
    const url = await new PhotoStorage().presignViewOrNull('spots/1/a.png');
    expect(url).toContain('/bucket-x/spots/1/a.png');
  });
});
