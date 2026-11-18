import { ApiProperty } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { retryOnWriteConflict } from '../prisma/retry.js';
import { SpotsService } from '../spots/spots.service.js';

export class LikeState {
  @ApiProperty({
    type: 'boolean',
    description: '操作後に、ログイン中のユーザーがいいね済みか',
  })
  liked: boolean;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: '操作後の、投稿のいいね数',
  })
  likeCount: number;
}

@Injectable()
export class LikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spots: SpotsService,
  ) {}

  // いいねする。閲覧できる投稿だけが対象(閲覧できない投稿は 404)。
  // すでにいいね済みでも同じ結果を返す(何度実行しても同じ。同時に実行しても重複しない)
  async like(spotId: number, userId: number): Promise<LikeState> {
    const spot = await this.spots.findViewableSpot(spotId, userId);
    if (spot.userId === userId) {
      throw new ApiError(
        400,
        'CANNOT_LIKE_OWN_SPOT',
        '自分の投稿にはいいねできません。',
      );
    }
    await retryOnWriteConflict(() =>
      this.prisma.like.createMany({
        data: [{ userId, spotId }],
        skipDuplicates: true,
      }),
    );
    return this.state(spotId, userId);
  }

  // いいねを取り消す。いいねしていなくても同じ結果を返す
  async unlike(spotId: number, userId: number): Promise<LikeState> {
    await this.spots.findViewableSpot(spotId, userId);
    await retryOnWriteConflict(() =>
      this.prisma.like.deleteMany({ where: { userId, spotId } }),
    );
    return this.state(spotId, userId);
  }

  private async state(spotId: number, userId: number): Promise<LikeState> {
    const [likeCount, mine] = await Promise.all([
      this.prisma.like.count({ where: { spotId } }),
      this.prisma.like.count({ where: { spotId, userId } }),
    ]);
    return { liked: mine > 0, likeCount };
  }
}
