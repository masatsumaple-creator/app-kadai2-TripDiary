import { ApiProperty } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { retryOnWriteConflict } from '../prisma/retry.js';

export class FollowState {
  @ApiProperty({
    type: 'boolean',
    description: '操作後に、ログイン中のユーザーがフォローしているか',
  })
  isFollowing: boolean;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: '操作後の、相手のフォロワー数',
  })
  followerCount: number;
}

const userNotFound = () =>
  new ApiError(404, 'NOT_FOUND', 'ユーザーが見つかりません。');

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  // フォローする。すでにフォローしていても同じ結果を返す(何度実行しても同じ)
  async follow(followerId: number, followeeId: number): Promise<FollowState> {
    if (followerId === followeeId) {
      throw new ApiError(
        400,
        'CANNOT_FOLLOW_SELF',
        '自分自身はフォローできません。',
      );
    }
    await this.assertUserExists(followeeId);
    // 同時に 2 回呼ばれても、一意制約(組み合わせは 1 つ)で重複せず、エラーにもしない
    await retryOnWriteConflict(() =>
      this.prisma.follow.createMany({
        data: [{ followerId, followeeId }],
        skipDuplicates: true,
      }),
    );
    return this.state(followerId, followeeId);
  }

  // フォローを解除する。フォローしていなくても同じ結果を返す
  async unfollow(followerId: number, followeeId: number): Promise<FollowState> {
    await this.assertUserExists(followeeId);
    await retryOnWriteConflict(() =>
      this.prisma.follow.deleteMany({ where: { followerId, followeeId } }),
    );
    return this.state(followerId, followeeId);
  }

  private async state(
    followerId: number,
    followeeId: number,
  ): Promise<FollowState> {
    const [followerCount, isFollowing] = await Promise.all([
      this.prisma.follow.count({ where: { followeeId } }),
      this.prisma.follow.count({ where: { followerId, followeeId } }),
    ]);
    return { isFollowing: isFollowing > 0, followerCount };
  }

  private async assertUserExists(id: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw userNotFound();
  }
}
