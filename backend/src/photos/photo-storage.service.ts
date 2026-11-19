import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ApiError } from '../common/api-error.js';
import {
  UPLOAD_URL_TTL_SECONDS,
  VIEW_URL_TTL_SECONDS,
} from './photo-config.js';

// 画像の置き場(S3)とのやり取り。画像のバイト列は、このサーバーを通さない
// (ブラウザが、署名付き URL で、S3 へ直接アップロード・取得する)。
//
// 設定(環境変数):
//   S3_BUCKET    写真のバケット名(必須)
//   S3_REGION    リージョン(既定は ap-northeast-1)
//   S3_ENDPOINT  S3 互換のサーバーの URL(ローカルの開発・テスト用。AWS では指定しない)
// 認証情報は、AWS の標準の方法(ECS ではタスクロール。ローカルでは AWS_ACCESS_KEY_ID・AWS_SECRET_ACCESS_KEY)
@Injectable()
export class PhotoStorage {
  private readonly logger = new Logger(PhotoStorage.name);
  private cached?: { client: S3Client; bucket: string };

  private get s3(): { client: S3Client; bucket: string } {
    if (this.cached) return this.cached;
    const bucket = process.env['S3_BUCKET'];
    if (!bucket) {
      throw new ApiError(
        503,
        'STORAGE_NOT_CONFIGURED',
        '写真の保存先が設定されていません。',
      );
    }
    const endpoint = process.env['S3_ENDPOINT'];
    this.cached = {
      bucket,
      client: new S3Client({
        region: process.env['S3_REGION'] || 'ap-northeast-1',
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      }),
    };
    return this.cached;
  }

  // アップロード用の URL。種類と大きさを署名に含めるため、別の種類・大きさでは S3 が拒否する
  async presignUpload(
    key: string,
    contentType: string,
    size: number,
  ): Promise<string> {
    const { client, bucket } = this.s3;
    return await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
      }),
      {
        expiresIn: UPLOAD_URL_TTL_SECONDS,
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
  }

  // 表示用の URL(期限つき)
  async presignView(key: string): Promise<string> {
    const { client, bucket } = this.s3;
    return await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: VIEW_URL_TTL_SECONDS },
    );
  }

  // 表示用の URL。作れないとき(保存先の設定の不備・一時的な障害)は null にして、ログに残す。
  // 投稿の一覧・詳細は、写真だけを出さずに、返す(写真の障害で、投稿が見られなくならないように)
  async presignViewOrNull(key: string): Promise<string | null> {
    try {
      return await this.presignView(key);
    } catch (e) {
      this.logger.warn(`Failed to presign a view URL: ${String(e)}`);
      return null;
    }
  }

  // アップロードされた画像の、実際の大きさと種類。なければ null
  async head(
    key: string,
  ): Promise<{ size: number; contentType: string | undefined } | null> {
    const { client, bucket } = this.s3;
    try {
      const res = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw e;
    }
  }

  // 画像を消す。失敗しても、呼び出し元の処理(投稿・写真の削除)は止めない
  // (DB の行が消えていれば、画像が残っても、利用者には見えない。ログに残す)
  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      const { client, bucket } = this.s3;
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    } catch (e) {
      this.logger.warn(
        `Failed to delete ${keys.length} object(s) from S3: ${String(e)}`,
      );
    }
  }
}
