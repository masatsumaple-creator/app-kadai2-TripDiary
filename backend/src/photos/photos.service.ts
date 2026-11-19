import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { retryOnWriteConflict } from '../prisma/retry.js';
import { SpotsService } from '../spots/spots.service.js';
import {
  PENDING_TTL_MS,
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_COUNT,
} from './photo-config.js';
import { PhotoStorage } from './photo-storage.service.js';
import type {
  CreatePhotoUploadDto,
  PhotoResponse,
  PhotoUploadResponse,
} from './photo.dto.js';

const notFound = () => new ApiError(404, 'NOT_FOUND', '写真が見つかりません。');

// 写真のアップロードは、3 段階:
//  1. createUpload   … 署名付き URL を発行する(DB に pending の行を作る)
//  2. ブラウザが、その URL へ画像を直接 PUT する(このサーバーは通らない)
//  3. complete       … 画像が実際に置かれたこと(大きさ・種類)を確かめて、ready にする(ここから表示される)
// 本人の投稿にだけ、付けられる・外せる。
@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spots: SpotsService,
    private readonly storage: PhotoStorage,
  ) {}

  async createUpload(
    spotId: number,
    userId: number,
    dto: CreatePhotoUploadDto,
  ): Promise<PhotoUploadResponse> {
    await this.assertOwner(spotId, userId);
    await this.purgeStalePending(spotId);

    const key = `spots/${spotId}/${randomUUID()}.${PHOTO_CONTENT_TYPES[dto.contentType]}`;
    const photo = await retryOnWriteConflict(async () => {
      const last = await this.prisma.photo.aggregate({
        where: { spotId },
        _max: { sortOrder: true },
      });
      return this.prisma.photo.create({
        data: {
          spotId,
          s3Key: key,
          contentType: dto.contentType,
          status: 'pending',
          sortOrder: (last._max.sortOrder ?? 0) + 1,
        },
      });
    });

    // 上限は、作った後にも数える(同時に発行されても、20 枚を超えないように)
    if ((await this.countActive(spotId)) > PHOTO_MAX_COUNT) {
      await this.prisma.photo.delete({ where: { id: photo.id } });
      throw new ApiError(
        400,
        'PHOTO_LIMIT_EXCEEDED',
        `写真は、1 投稿に最大 ${PHOTO_MAX_COUNT} 枚までです。`,
      );
    }

    return {
      photoId: photo.id,
      uploadUrl: await this.storage.presignUpload(
        key,
        dto.contentType,
        dto.size,
      ),
      headers: { 'Content-Type': dto.contentType },
    };
  }

  async complete(
    spotId: number,
    photoId: number,
    userId: number,
  ): Promise<PhotoResponse> {
    await this.assertOwner(spotId, userId);
    const photo = await this.prisma.photo.findFirst({
      where: { id: photoId, spotId },
    });
    if (!photo) throw notFound();

    if (photo.status === 'ready') {
      return {
        id: photo.id,
        url: await this.storage.presignView(photo.s3Key),
      };
    }

    // 申告された値ではなく、置かれた画像の実際の値で確かめる
    const object = await this.storage.head(photo.s3Key);
    if (!object) {
      throw new ApiError(
        400,
        'UPLOAD_NOT_FOUND',
        '写真のアップロードが確認できません。もう一度お試しください。',
      );
    }
    if (
      object.size < 1 ||
      object.size > PHOTO_MAX_BYTES ||
      object.contentType !== photo.contentType
    ) {
      await this.discard(photo);
      throw new ApiError(
        400,
        'INVALID_UPLOAD',
        '写真の大きさまたは形式が正しくありません。',
      );
    }

    await retryOnWriteConflict(() =>
      this.prisma.photo.update({
        where: { id: photo.id },
        data: { status: 'ready' },
      }),
    );
    return { id: photo.id, url: await this.storage.presignView(photo.s3Key) };
  }

  async remove(spotId: number, photoId: number, userId: number): Promise<void> {
    await this.assertOwner(spotId, userId);
    const photo = await this.prisma.photo.findFirst({
      where: { id: photoId, spotId },
    });
    if (!photo) throw notFound();
    await this.discard(photo);
  }

  // 閲覧できない投稿は 404(存在を知らせない)、閲覧できるが本人でなければ 403
  private async assertOwner(spotId: number, userId: number): Promise<void> {
    const spot = await this.spots.findViewableSpot(spotId, userId);
    if (spot.userId !== userId) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'この投稿の写真を変更する権限がありません。',
      );
    }
  }

  // 有効な写真の数(ready と、期限内の pending)
  private countActive(spotId: number): Promise<number> {
    return this.prisma.photo.count({
      where: {
        spotId,
        OR: [
          { status: 'ready' },
          { createdAt: { gt: new Date(Date.now() - PENDING_TTL_MS) } },
        ],
      },
    });
  }

  // アップロードが完了しないまま、期限を過ぎた pending を、画像ごと消す
  private async purgeStalePending(spotId: number): Promise<void> {
    const stale = await this.prisma.photo.findMany({
      where: {
        spotId,
        status: 'pending',
        createdAt: { lte: new Date(Date.now() - PENDING_TTL_MS) },
      },
      select: { id: true, s3Key: true },
    });
    if (stale.length === 0) return;
    await this.prisma.photo.deleteMany({
      where: { id: { in: stale.map((p) => p.id) } },
    });
    await this.storage.remove(stale.map((p) => p.s3Key));
  }

  // DB の行を先に消し(利用者から見えなくなる)、画像を消す
  private async discard(photo: { id: number; s3Key: string }): Promise<void> {
    await retryOnWriteConflict(() =>
      this.prisma.photo.delete({ where: { id: photo.id } }),
    );
    await this.storage.remove([photo.s3Key]);
  }
}
