import {
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { ApiErrors } from '../common/api-doc.js';
import { IdParamPipe } from '../common/id-param.pipe.js';
import { LikesService, LikeState } from './likes.service.js';

@ApiTags('likes')
@Controller('spots')
export class LikesController {
  constructor(private readonly likes: LikesService) {}

  @Post(':id/like')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'いいねする',
    description:
      '閲覧できる投稿だけが対象(閲覧できない投稿は 404)。すでにいいね済みでも同じ結果を返す(1 ユーザー 1 投稿につき 1 回)。自分の投稿には 400(CANNOT_LIKE_OWN_SPOT)。',
  })
  @ApiOkResponse({ type: LikeState })
  @ApiErrors(400, 401, 404)
  like(
    @Req() req: AuthenticatedRequest,
    @Param('id', IdParamPipe) id: number,
  ): Promise<LikeState> {
    return this.likes.like(id, req.user!.id);
  }

  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'いいねを取り消す',
    description: 'いいねしていなくても同じ結果を返す。',
  })
  @ApiOkResponse({ type: LikeState })
  @ApiErrors(401, 404)
  unlike(
    @Req() req: AuthenticatedRequest,
    @Param('id', IdParamPipe) id: number,
  ): Promise<LikeState> {
    return this.likes.unlike(id, req.user!.id);
  }
}
