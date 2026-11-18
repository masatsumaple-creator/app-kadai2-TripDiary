import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { viewableSpotsWhere } from '../spots/spot-visibility.js';

export interface UserProfile {
  id: number;
  name: string;
  followerCount: number;
  followingCount: number;
  // 閲覧者が見られる投稿の数(他人の非公開などは数えない)
  spotCount: number;
  isMe: boolean;
  isFollowing: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // プロフィール。メールアドレスなどの個人情報は含めない
  async getProfile(id: number, viewerId?: number): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!user) {
      throw new ApiError(404, 'NOT_FOUND', 'ユーザーが見つかりません。');
    }

    const [followerCount, followingCount, spotCount, follow] =
      await Promise.all([
        this.prisma.follow.count({ where: { followeeId: id } }),
        this.prisma.follow.count({ where: { followerId: id } }),
        this.prisma.spot.count({
          where: { AND: [viewableSpotsWhere(viewerId), { userId: id }] },
        }),
        viewerId === undefined
          ? null
          : this.prisma.follow.findUnique({
              where: {
                followerId_followeeId: { followerId: viewerId, followeeId: id },
              },
            }),
      ]);

    return {
      id: user.id,
      name: user.name,
      followerCount,
      followingCount,
      spotCount,
      isMe: viewerId === id,
      isFollowing: follow !== null,
    };
  }
}
