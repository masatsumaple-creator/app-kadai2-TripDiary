import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { ApiErrors, ApiOptionalBearerAuth } from '../common/api-doc.js';
import { IdParamPipe } from '../common/id-param.pipe.js';
import { ListSpotsQueryDto } from './dto/list-spots.dto.js';
import { SpotInputDto } from './dto/spot.dto.js';
import {
  SpotsService,
  SpotListResponse,
  SpotResponse,
} from './spots.service.js';

@ApiTags('spots')
@Controller('spots')
export class SpotsController {
  constructor(private readonly spots: SpotsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '投稿を作成',
    description:
      '投稿者は、常にログイン中のユーザーになる(リクエストでは指定できない。指定すると 400)。',
  })
  @ApiCreatedResponse({ type: SpotResponse })
  @ApiErrors(400, 401)
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SpotInputDto,
  ): Promise<SpotResponse> {
    return this.spots.create(req.user!.id, dto);
  }

  // 新着一覧。閲覧できる投稿だけを返す(未ログインなら公開のみ)
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOptionalBearerAuth()
  @ApiOperation({
    summary: '投稿の一覧(新着順)',
    description:
      'ログインは任意。閲覧できる投稿だけを返す(未ログイン: 公開のみ。ログイン済み: 公開 + 自分の投稿 + フォローしている人のフォロワー限定)。カーソル方式のページング: 応答の nextCursor を、次のリクエストの cursor に渡す(null なら最後のページ)。トークンを付けたのに不正・期限切れなら 401(未ログイン扱いにはしない)。',
  })
  @ApiOkResponse({ type: SpotListResponse })
  @ApiErrors(400, 401)
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListSpotsQueryDto,
  ): Promise<SpotListResponse> {
    return this.spots.list(query, req.user?.id);
  }

  // 公開投稿は未ログインでも見られる。公開範囲に合わない場合は 404
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOptionalBearerAuth()
  @ApiOperation({
    summary: '投稿の詳細',
    description:
      'ログインは任意。閲覧できない投稿は、存在しない投稿と同じ 404 を返す(存在を知らせない)。',
  })
  @ApiOkResponse({ type: SpotResponse })
  @ApiErrors(401, 404)
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id', IdParamPipe) id: number,
  ): Promise<SpotResponse> {
    return this.spots.get(id, req.user?.id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '投稿を更新(全項目を置き換える)',
    description:
      '本人だけ。省略した項目は未入力(null)になる。閲覧できない投稿は 404、閲覧できるが本人でない投稿は 403。',
  })
  @ApiOkResponse({ type: SpotResponse })
  @ApiErrors(400, 401, 403, 404)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', IdParamPipe) id: number,
    @Body() dto: SpotInputDto,
  ): Promise<SpotResponse> {
    return this.spots.update(id, req.user!.id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '投稿を削除',
    description:
      '本人だけ。いいね・コメント・エリアタグの紐づけも一緒に消える。',
  })
  @ApiNoContentResponse({ description: '削除した' })
  @ApiErrors(401, 403, 404)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', IdParamPipe) id: number,
  ): Promise<void> {
    await this.spots.remove(id, req.user!.id);
  }
}
