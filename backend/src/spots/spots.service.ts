import { ApiProperty } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { UserSummary } from '../common/api-doc.js';
import { PhotoStorage } from '../photos/photo-storage.service.js';
import { PhotoResponse } from '../photos/photo.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { retryOnWriteConflict } from '../prisma/retry.js';
import type { Prisma } from '../generated/prisma/client.js';
import { viewableSpotsWhere } from './spot-visibility.js';
import { LIST_STATUSES } from './list-status.js';
import type { ListStatusValue } from './list-status.js';
import { SpotInputDto, VISIBILITIES } from './dto/spot.dto.js';
import type { Visibility } from './dto/spot.dto.js';
import { DEFAULT_PAGE_SIZE } from '../common/page-query.dto.js';
import { ListSpotsQueryDto } from './dto/list-spots.dto.js';
import {
  MAP_SPOTS_LIMIT,
  MapSpotsQueryDto,
  MapSpotsResponse,
} from './dto/map-spots.dto.js';

// 投稿の取得時に含める関連(一覧・詳細・マイリストで共通)
export const spotInclude = {
  tags: { include: { tag: true } },
  user: { select: { id: true, name: true } },
  _count: { select: { likes: true, comments: true } },
  // 表示できる写真(アップロードの完了を確認できたもの)だけ。先頭が、一覧の代表の写真
  photos: {
    where: { status: 'ready' },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, s3Key: true },
  },
} as const;

export interface SpotRecord {
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
  photos: { id: number; s3Key: string }[];
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

  @ApiProperty({
    type: () => [PhotoResponse],
    description: '写真(表示順。最大 20 枚)。URL は期限つき',
  })
  photos: PhotoResponse[];

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

  @ApiProperty({
    enum: LIST_STATUSES,
    nullable: true,
    description:
      '閲覧者のマイリストでの状態(visited: 訪問済み、wishlist: 行きたい、null: リストにない・未ログイン)。自分の投稿は、常に visited',
  })
  listStatus: ListStatusValue | null;

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

  @ApiProperty({
    type: 'string',
    nullable: true,
    description:
      '代表の写真(先頭の 1 枚)の URL。写真がなければ null。URL は期限つき',
  })
  coverPhotoUrl: string | null;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PhotoStorage,
  ) {}

  async create(userId: number, dto: SpotInputDto): Promise<SpotResponse> {
    const tagIds = await this.resolveTagIds(dto.areas);
    const spot = await retryOnWriteConflict(() =>
      this.prisma.spot.create({
        data: {
          userId,
          ...this.fields(dto),
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
          // 自分の投稿は、自動で「訪問済み」(同じ操作の中で作るので、投稿だけが残ることはない)
          userSpots: { create: { userId, status: 'visited' } },
        },
        include: spotInclude,
      }),
    );
    // 作ったばかりなので、いいねもコメントもない。自分の投稿なので、リストは「訪問済み」
    return await this.toResponse(spot, userId, false, 'visited');
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
      include: spotInclude,
      orderBy: { id: 'desc' },
      // 次のページがあるかを判定するため 1 件多く取る
      take: limit + 1,
    })) as SpotRecord[];

    const page = rows.slice(0, limit);
    return {
      items: await Promise.all(page.map((s) => this.toListItem(s, viewerId))),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }

  // 地図の表示範囲の中の、閲覧できる投稿(位置のあるものだけ)。一覧・詳細と同じ公開範囲の規則。
  // 範囲内に MAP_SPOTS_LIMIT 件を超えるときは、新しいものから MAP_SPOTS_LIMIT 件にして、truncated を true にする
  async listInBounds(
    query: MapSpotsQueryDto,
    viewerId?: number,
  ): Promise<MapSpotsResponse> {
    if (query.swLat > query.neLat) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        '入力内容に誤りがあります。',
        {
          swLat: ['南西の緯度は、北東の緯度以下にしてください。'],
        },
      );
    }
    if (query.area !== undefined) await this.assertAreaExists(query.area);

    // 経度は、日付変更線をまたぐ範囲(南西の経度 > 北東の経度)なら、「南西以東、または、北東以西」
    const longitude: Prisma.SpotWhereInput =
      query.swLng <= query.neLng
        ? { longitude: { gte: query.swLng, lte: query.neLng } }
        : {
            OR: [
              { longitude: { gte: query.swLng } },
              { longitude: { lte: query.neLng } },
            ],
          };

    const rows = await this.prisma.spot.findMany({
      where: {
        AND: [
          viewableSpotsWhere(viewerId),
          { latitude: { gte: query.swLat, lte: query.neLat } },
          longitude,
          query.area ? { tags: { some: { tag: { name: query.area } } } } : {},
        ],
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        visibility: true,
        tags: { select: { tagId: true, tag: { select: { name: true } } } },
      },
      orderBy: { id: 'desc' },
      // 省いた分があるかを判定するため、1 件多く取る
      take: MAP_SPOTS_LIMIT + 1,
    });

    return {
      items: rows.slice(0, MAP_SPOTS_LIMIT).map((s) => ({
        id: s.id,
        name: s.name,
        // 検索条件で、位置のあるものだけに絞っている
        latitude: s.latitude!,
        longitude: s.longitude!,
        areas: [...s.tags]
          .sort((a, b) => a.tagId - b.tagId)
          .map((t) => t.tag.name),
        visibility: s.visibility,
      })),
      truncated: rows.length > MAP_SPOTS_LIMIT,
    };
  }

  async get(id: number, viewerId?: number): Promise<SpotResponse> {
    const spot = await this.findViewable(id, viewerId);
    const [liked, listStatus] = await Promise.all([
      this.isLiked(id, viewerId),
      this.listStatusOf(id, viewerId),
    ]);
    return await this.toResponse(spot, viewerId, liked, listStatus);
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
    const spot = await retryOnWriteConflict(() =>
      this.prisma.spot.update({
        where: { id },
        data: {
          ...this.fields(dto),
          tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) },
        },
        include: spotInclude,
      }),
    );
    const [liked, listStatus] = await Promise.all([
      this.isLiked(id, userId),
      this.listStatusOf(id, userId),
    ]);
    return await this.toResponse(spot, userId, liked, listStatus);
  }

  async remove(id: number, userId: number): Promise<void> {
    await this.findOwned(id, userId);
    // 写真の行は、投稿と一緒に消える(DB の連動)。画像(S3)は、その後に消す
    const photos = await this.prisma.photo.findMany({
      where: { spotId: id },
      select: { s3Key: true },
    });
    await retryOnWriteConflict(() =>
      this.prisma.spot.delete({ where: { id } }),
    );
    await this.storage.remove(photos.map((p) => p.s3Key));
  }

  // 閲覧できない投稿は、存在しない場合と同じ 404 にする(存在を知らせない)
  private async findViewable(
    id: number,
    viewerId?: number,
  ): Promise<SpotRecord> {
    const spot = (await this.prisma.spot.findUnique({
      where: { id },
      include: spotInclude,
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

  async toListItem(spot: SpotRecord, viewerId?: number): Promise<SpotListItem> {
    const cover = spot.photos[0];
    return {
      id: spot.id,
      name: spot.name,
      areas: [...spot.tags]
        .sort((a, b) => a.tagId - b.tagId)
        .map((t) => t.tag.name),
      visibility: spot.visibility,
      author: spot.user,
      isMine: viewerId !== undefined && spot.userId === viewerId,
      coverPhotoUrl: cover
        ? await this.storage.presignViewOrNull(cover.s3Key)
        : null,
      likeCount: spot._count.likes,
      commentCount: spot._count.comments,
      createdAt: spot.createdAt,
    };
  }

  // 閲覧者のリストの状態(リストにない・未ログインは null)
  private async listStatusOf(
    spotId: number,
    viewerId?: number,
  ): Promise<ListStatusValue | null> {
    if (viewerId === undefined) return null;
    const entry = await this.prisma.userSpot.findUnique({
      where: { userId_spotId: { userId: viewerId, spotId } },
      select: { status: true },
    });
    return entry?.status ?? null;
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

  private async toResponse(
    spot: SpotRecord,
    viewerId: number | undefined,
    liked: boolean,
    listStatus: ListStatusValue | null,
  ): Promise<SpotResponse> {
    // URL を作れなかった写真は、出さない(投稿は返す)
    const photos = (
      await Promise.all(
        spot.photos.map(async (p) => ({
          id: p.id,
          url: await this.storage.presignViewOrNull(p.s3Key),
        })),
      )
    ).filter((p): p is PhotoResponse => p.url !== null);
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
      photos,
      likeCount: spot._count.likes,
      commentCount: spot._count.comments,
      liked,
      listStatus,
      createdAt: spot.createdAt,
      updatedAt: spot.updatedAt,
    };
  }
}
