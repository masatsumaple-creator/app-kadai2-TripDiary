import { ApiProperty } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { UserSummary } from '../common/api-doc.js';
import { DEFAULT_PAGE_SIZE } from '../common/page-query.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SpotsService } from '../spots/spots.service.js';
import type {
  CreateCommentDto,
  ListCommentsQueryDto,
} from './dto/comment.dto.js';

export class CommentResponse {
  @ApiProperty({ type: 'integer', example: 1 })
  id: number;

  @ApiProperty({
    type: 'string',
    description:
      '本文。HTML としては解釈されず、入力のまま返る(表示側で、文字として表示する)',
  })
  body: string;

  @ApiProperty({ type: () => UserSummary })
  author: UserSummary;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt: Date;

  // 閲覧者が削除できるか(コメントした本人、または投稿者)
  @ApiProperty({
    type: 'boolean',
    description:
      '閲覧者が削除できるか(コメントした本人、または、その投稿の投稿者)',
  })
  canDelete: boolean;
}

export class CommentListResponse {
  @ApiProperty({
    type: () => [CommentResponse],
    description: '古い順(ID の昇順)',
  })
  items: CommentResponse[];

  // 次のページがなければ null。あれば、次のリクエストの cursor に渡す
  @ApiProperty({
    type: 'integer',
    nullable: true,
    description:
      '次のページがなければ null。あれば、次のリクエストの cursor に渡す',
  })
  nextCursor: number | null;
}

interface CommentRecord {
  id: number;
  userId: number;
  body: string;
  createdAt: Date;
  user: { id: number; name: string };
}

const select = {
  id: true,
  userId: true,
  body: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
} as const;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spots: SpotsService,
  ) {}

  // 古い順(ID の昇順)。会話として上から読めるようにする。閲覧できる投稿のコメントだけ返す
  async list(
    spotId: number,
    query: ListCommentsQueryDto,
    viewerId?: number,
  ): Promise<CommentListResponse> {
    const spot = await this.spots.findViewableSpot(spotId, viewerId);
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const rows = (await this.prisma.comment.findMany({
      where: { spotId, ...(query.cursor ? { id: { gt: query.cursor } } : {}) },
      select,
      orderBy: { id: 'asc' },
      // 次のページがあるかを判定するため 1 件多く取る
      take: limit + 1,
    })) as CommentRecord[];

    const page = rows.slice(0, limit);
    return {
      items: page.map((c) => this.toResponse(c, spot.userId, viewerId)),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }

  // コメントする。閲覧できる投稿だけが対象。投稿者本人も、自分の投稿にコメントできる(質問への返信など)
  async create(
    spotId: number,
    userId: number,
    dto: CreateCommentDto,
  ): Promise<CommentResponse> {
    const spot = await this.spots.findViewableSpot(spotId, userId);
    const comment = (await this.prisma.comment.create({
      data: { spotId, userId, body: dto.body },
      select,
    })) as CommentRecord;
    return this.toResponse(comment, spot.userId, userId);
  }

  // 削除できるのは、コメントした本人と、その投稿の投稿者だけ。
  // 閲覧できない投稿、存在しないコメント、別の投稿のコメントは、すべて 404
  async remove(
    spotId: number,
    commentId: number,
    userId: number,
  ): Promise<void> {
    const spot = await this.spots.findViewableSpot(spotId, userId);
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, spotId },
      select: { id: true, userId: true },
    });
    if (!comment) {
      throw new ApiError(404, 'NOT_FOUND', 'コメントが見つかりません。');
    }
    if (comment.userId !== userId && spot.userId !== userId) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'このコメントを削除する権限がありません。',
      );
    }
    await this.prisma.comment.delete({ where: { id: commentId } });
  }

  private toResponse(
    c: CommentRecord,
    spotOwnerId: number,
    viewerId?: number,
  ): CommentResponse {
    return {
      id: c.id,
      body: c.body,
      author: c.user,
      createdAt: c.createdAt,
      canDelete:
        viewerId !== undefined &&
        (c.userId === viewerId || spotOwnerId === viewerId),
    };
  }
}
