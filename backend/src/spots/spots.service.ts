import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Visibility } from './dto/spot.dto.js';
import { SpotInputDto } from './dto/spot.dto.js';

const include = {
  tags: { include: { tag: true } },
  user: { select: { id: true, name: true } },
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
}

export interface SpotResponse {
  id: number;
  name: string;
  review: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  areas: string[];
  visibility: Visibility;
  author: { id: number; name: string };
  isMine: boolean;
  createdAt: Date;
  updatedAt: Date;
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
    return this.toResponse(spot, userId);
  }

  async get(id: number, viewerId?: number): Promise<SpotResponse> {
    const spot = await this.findViewable(id, viewerId);
    return this.toResponse(spot, viewerId);
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
    return this.toResponse(spot, userId);
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

  private toResponse(spot: SpotRecord, viewerId?: number): SpotResponse {
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
      createdAt: spot.createdAt,
      updatedAt: spot.updatedAt,
    };
  }
}
