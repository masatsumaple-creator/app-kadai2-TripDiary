import { ApiProperty } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { UserSummary } from '../common/api-doc.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { viewableSpotsWhere } from './spot-visibility.js';
import { SpotInputDto, VISIBILITIES } from './dto/spot.dto.js';
import type { Visibility } from './dto/spot.dto.js';
import { DEFAULT_PAGE_SIZE } from '../common/page-query.dto.js';
import { ListSpotsQueryDto } from './dto/list-spots.dto.js';

const include = {
  tags: { include: { tag: true } },
  user: { select: { id: true, name: true } },
  _count: { select: { likes: true, comments: true } },
} as const;

interface SpotRecord {
  id: number;
  userId: number;
  name: string;
  review: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  visibility: Visibility;
  createdAt: Date;
  updatedAt: Date;
  tags: { tagId: number; tag: { name: string } }[];
  user: { id: number; name: string };
  _count: { likes: number; comments: number };
}

export class SpotResponse {
  @ApiProperty({ type: 'integer', example: 1 })
  id: number;

  @ApiProperty({ type: 'string', example: '清水寺' })
  name: string;

  @ApiProperty({ type: 'string', nullable: true, description: '感想' })
  review: string | null;

  @ApiProperty({ type: 'string', nullable: true, description: '住所' })
  address: string | null;

  @ApiProperty({
    type: 'number',
    nullable: true,
    description: '緯度(閲覧できない人には、そもそも投稿ごと返さない)',
  })
  latitude: number | null;

  @ApiProperty({ type: 'number', nullable: true, description: '経度' })
  longitude: number | null;

  @ApiProperty({
    type: [String],
    description: 'エリアタグ(都道府県名)。都道府県の並び順(JIS コード順)',
    example: ['京都府'],
  })
  areas: string[];

  @ApiProperty({ enum: VISIBILITIES })
  visibility: Visibility;

  @ApiProperty({ type: () => UserSummary })
  author: UserSummary;

  @ApiProperty({ type: 'boolean', description: '閲覧者本人の投稿か' })
  isMine: boolean;

  @ApiProperty({ type: 'integer', minimum: 0 })
  likeCount: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  commentCount: number;

  // 閲覧者がいいね済みか(未ログインは false)
  @ApiProperty({
    type: 'boolean',
    description: '閲覧者がいいね済みか(未ログインは false)',
  })
  liked: boolean;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt: Date;
}

// 一覧用の要約。感想・住所・緯度経度は含めない(詳細で取得する)
export class SpotListItem {
  @ApiProperty({ type: 'integer', example: 1 })
  id: number;

  @ApiProperty({ type: 'string', example: '清水寺' })
  name: string;

  @ApiProperty({ type: [String], example: ['京都府'] })
  areas: string[];

  @ApiProperty({ enum: VISIBILITIES })
  visibility: Visibility;

  @ApiProperty({ type: () => UserSummary })
  author: UserSummary;

  @ApiProperty({ type: 'boolean', description: '閲覧者本人の投稿か' })
  isMine: boolean;

  @ApiProperty({ type: 'integer', minimum: 0 })
  likeCount: number;

  @ApiProperty({ type: 'integer', minimum: 0 })
  commentCount: number;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt: Date;
}

export class SpotListResponse {
  @ApiProperty({ type: () => [SpotListItem], description: '新着順(ID の降順)' })
  items: SpotListItem[];

  // 次のページがなければ null。あれば、次のリクエストの cursor に渡す
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      '次のページがなければ null。あれば、次のリクエストの cursor に渡す',
  })
  nextCursor: number | null;
}

const notFound = () => new ApiError(404, 'NOT_FOUND', '投稿が見つかりません。');

@Injectable()
export class SpotsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, dto: SpotInputDto): Promise<SpotResponse> {
    const tagIds = await this.resolveTagIds(dto.areas);
    const spot = await this.prisma.spot.create({
      data: {
        userId,
        ...this.fields(dto),
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
      include,
    });
    // 作ったばかりなので、いいねもコメントもない
    return this.toResponse(spot, userId, false);
  }

  // 新着順(ID の降順)の一覧。詳細と同じ公開範囲の規則で、閲覧できる投稿だけを返す。
  // ID は投稿順に増えるため、created_at ではなく ID をカーソルにする(同時刻でも重複・抜けが出ない)
  async list(
    query: ListSpotsQueryDto,
    viewerId?: number,
  ): Promise<SpotListResponse> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    if (query.area !== undefined) await this.assertAreaExists(query.area);

    // フォロー中の投稿は、ログイン中のユーザーが必要
    if (query.following === 'true' && viewerId === undefined) {
      throw new ApiError(401, 'UNAUTHORIZED', 'ログインが必要です。');
    }

    const rows = (await this.prisma.spot.findMany({
      where: {
        AND: [
          viewableSpotsWhere(viewerId),
          query.area ? { tags: { some: { tag: { name: query.area } } } } : {},
          query.author ? { userId: query.author } : {},
          // 投稿者をフォローしている(自分自身はフォローできないため、自分の投稿は含まれない)
          query.following === 'true'
            ? { user: { followers: { some: { followerId: viewerId } } } }
            : {},
          query.cursor ? { id: { lt: query.cursor } } : {},
        ],
      },
      include,
      orderBy: { id: 'desc' },
      // 次のページがあるかを判定するため 1 件多く取る
      take: limit + 1,
    })) as SpotRecord[];

    const page = rows.slice(0, limit);
    return {
      items: page.map((s) => this.toListItem(s, viewerId)),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }

  async get(id: number, viewerId?: number): Promise<SpotResponse> {
    const spot = await this.findViewable(id, viewerId);
    return this.toResponse(spot, viewerId, await this.isLiked(id, viewerId));
  }

  // いいね・コメントなど、投稿に付く操作の前に、閲覧できる投稿かを確かめる。
  // 閲覧できない投稿は、存在しない投稿と同じ 404 にする
  async findViewableSpot(
    id: number,
    viewerId?: number,
  ): Promise<{ id: number; userId: number }> {
    const spot = await this.findViewable(id, viewerId);
    return { id: spot.id, userId: spot.userId };
  }

  // 全項目を置き換える。エリアタグも指定したものに入れ替える
  async update(
    id: number,
    userId: number,
    dto: SpotInputDto,
  ): Promise<SpotResponse> {
    await this.findOwned(id, userId);
    const tagIds = await this.resolveTagIds(dto.areas);
    const spot = await this.prisma.spot.update({
      where: { id },
      data: {
        ...this.fields(dto),
        tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) },
      },
      include,
    });
    return this.toResponse(spot, userId, await this.isLiked(id, userId));
  }

  async remove(id: number, userId: number): Promise<void> {
    await this.findOwned(id, userId);
    await this.prisma.spot.delete({ where: { id } });
  }

  // 閲覧できない投稿は、存在しない場合と同じ 404 にする(存在を知らせない)
  private async findViewable(
    id: number,
    viewerId?: number,
  ): Promise<SpotRecord> {
    const spot = (await this.prisma.spot.findUnique({
      where: { id },
      include,
    })) as SpotRecord | null;
    if (!spot || !(await this.canView(spot, viewerId))) throw notFound();
    return spot;
  }

  // 本人だけが変更できる。閲覧できない人には 404、閲覧できるが本人でない人には 403
  private async findOwned(id: number, userId: number): Promise<SpotRecord> {
    const spot = await this.findViewable(id, userId);
    if (spot.userId !== userId) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'この投稿を変更する権限がありません。',
      );
    }
    return spot;
  }

  private async canView(
    spot: Pick<SpotRecord, 'userId' | 'visibility'>,
    viewerId?: number,
  ): Promise<boolean> {
    if (viewerId !== undefined && spot.userId === viewerId) return true;
    switch (spot.visibility) {
      case 'public':
        return true;
      case 'private':
        return false;
      case 'followers': {
        if (viewerId === undefined) return false;
        const follow = await this.prisma.follow.findUnique({
          where: {
            followerId_followeeId: {
              followerId: viewerId,
              followeeId: spot.userId,
            },
          },
        });
        return follow !== null;
      }
    }
  }

  private async assertAreaExists(area: string): Promise<void> {
    const tag = await this.prisma.areaTag.findUnique({ where: { name: area } });
    if (!tag) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        '入力内容に誤りがあります。',
        {
          area: [`存在しないエリアタグです: ${area}`],
        },
      );
    }
  }

  private toListItem(spot: SpotRecord, viewerId?: number): SpotListItem {
    return {
      id: spot.id,
      name: spot.name,
      areas: [...spot.tags]
        .sort((a, b) => a.tagId - b.tagId)
        .map((t) => t.tag.name),
      visibility: spot.visibility,
      author: spot.user,
      isMine: viewerId !== undefined && spot.userId === viewerId,
      likeCount: spot._count.likes,
      commentCount: spot._count.comments,
      createdAt: spot.createdAt,
    };
  }

  private async isLiked(spotId: number, viewerId?: number): Promise<boolean> {
    if (viewerId === undefined) return false;
    const like = await this.prisma.like.findUnique({
      where: { userId_spotId: { userId: viewerId, spotId } },
    });
    return like !== null;
  }

  // 都道府県名から ID を引く。マスタにない名前は入力エラーにする
  private async resolveTagIds(areas: string[]): Promise<number[]> {
    const tags = await this.prisma.areaTag.findMany({
      where: { name: { in: areas } },
    });
    const byName = new Map(tags.map((t) => [t.name, t.id]));
    const unknown = areas.filter((a) => !byName.has(a));
    if (unknown.length > 0) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        '入力内容に誤りがあります。',
        {
          areas: [`存在しないエリアタグです: ${unknown.join('、')}`],
        },
      );
    }
    return areas.map((a) => byName.get(a)!);
  }

  private fields(dto: SpotInputDto) {
    return {
      name: dto.name,
      review: dto.review ?? null,
      address: dto.address ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      visibility: dto.visibility,
    };
  }

  private toResponse(
    spot: SpotRecord,
    viewerId: number | undefined,
    liked: boolean,
  ): SpotResponse {
    return {
      id: spot.id,
      name: spot.name,
      review: spot.review,
      address: spot.address,
      latitude: spot.latitude,
      longitude: spot.longitude,
      areas: [...spot.tags]
        .sort((a, b) => a.tagId - b.tagId)
        .map((t) => t.tag.name),
      visibility: spot.visibility,
      author: spot.user,
      isMine: viewerId !== undefined && spot.userId === viewerId,
      likeCount: spot._count.likes,
      commentCount: spot._count.comments,
      liked,
      createdAt: spot.createdAt,
      updatedAt: spot.updatedAt,
    };
  }
}
