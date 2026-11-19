import { Injectable } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { ApiError } from '../common/api-error.js';
import { DEFAULT_PAGE_SIZE } from '../common/page-query.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { retryOnWriteConflict } from '../prisma/retry.js';
import { LIST_STATUSES } from '../spots/list-status.js';
import type { ListStatusValue } from '../spots/list-status.js';
import { viewableSpotsWhere } from '../spots/spot-visibility.js';
import {
  SpotListItem,
  SpotsService,
  spotInclude,
} from '../spots/spots.service.js';
import type { SpotRecord } from '../spots/spots.service.js';
import type { ListMyListQueryDto } from './dto/list.dto.js';

export class ListEntryState {
  @ApiProperty({
    enum: LIST_STATUSES,
    nullable: true,
    description: '操作後の状態。リストから外した場合は null',
  })
  status: ListStatusValue | null;
}

export class ListCounts {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: '訪問済みの件数(閲覧できる投稿だけ)',
  })
  visited: number;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: '行きたいの件数(閲覧できる投稿だけ)',
  })
  wishlist: number;
}

export class MyListResponse {
  @ApiProperty({
    type: () => [SpotListItem],
    description: 'リストに入れた新しい順(登録の新しい順)',
  })
  items: SpotListItem[];

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      '次のページがなければ null。あれば、次のリクエストの cursor に渡す(投稿の ID ではなく、リストの行の ID。値の意味に依存しない)',
  })
  nextCursor: number | null;

  @ApiProperty({
    type: () => ListCounts,
    description: '状態ごとの件数(タブの表示用)',
  })
  counts: ListCounts;
}

const ownSpot = () =>
  new ApiError(
    400,
    'OWN_SPOT_IN_LIST',
    '自分の投稿は、自動で「訪問済み」になります。状態の変更や、リストから外すことはできません。',
  );

@Injectable()
export class ListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spots: SpotsService,
  ) {}

  // リストに入れる、または状態を変える(同じ状態でも、同じ結果を返す)。
  // 閲覧できる投稿だけが対象(閲覧できない投稿は 404)。自分の投稿は、自動で訪問済みなので変更できない
  async set(
    spotId: number,
    userId: number,
    status: ListStatusValue,
  ): Promise<ListEntryState> {
    const spot = await this.spots.findViewableSpot(spotId, userId);
    if (spot.userId === userId) throw ownSpot();
    // 同時に実行されても、一意制約(ユーザー × 投稿)で 1 行になる
    await retryOnWriteConflict(() =>
      this.prisma.userSpot.upsert({
        where: { userId_spotId: { userId, spotId } },
        create: { userId, spotId, status },
        update: { status },
      }),
    );
    return { status };
  }

  // リストから外す。リストにない投稿でも、同じ結果を返す
  async remove(spotId: number, userId: number): Promise<ListEntryState> {
    const spot = await this.spots.findViewableSpot(spotId, userId);
    if (spot.userId === userId) throw ownSpot();
    await retryOnWriteConflict(() =>
      this.prisma.userSpot.deleteMany({ where: { userId, spotId } }),
    );
    return { status: null };
  }

  // 自分のマイリスト。閲覧できる投稿だけを、登録の新しい順で返す。
  // 閲覧できなくなった投稿(非公開に変えられた、フォローを解除したなど)は、リストの行は残るが、見えない
  // (権限のない人に、投稿の存在や内容を見せない)。権限が戻れば、また見える
  async list(
    userId: number,
    query: ListMyListQueryDto,
  ): Promise<MyListResponse> {
    const status = query.status ?? 'visited';
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const viewable = { spot: viewableSpotsWhere(userId) };

    const [rows, visited, wishlist] = await Promise.all([
      this.prisma.userSpot.findMany({
        where: {
          userId,
          status,
          ...viewable,
          ...(query.cursor ? { id: { lt: query.cursor } } : {}),
        },
        include: { spot: { include: spotInclude } },
        orderBy: { id: 'desc' },
        // 次のページがあるかを判定するため 1 件多く取る
        take: limit + 1,
      }),
      this.prisma.userSpot.count({
        where: { userId, status: 'visited', ...viewable },
      }),
      this.prisma.userSpot.count({
        where: { userId, status: 'wishlist', ...viewable },
      }),
    ]);

    const page = rows.slice(0, limit);
    return {
      items: await Promise.all(
        page.map((r) =>
          this.spots.toListItem(r.spot as unknown as SpotRecord, userId),
        ),
      ),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
      counts: { visited, wishlist },
    };
  }
}
