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
import { UserIdParamPipe } from '../common/id-param.pipe.js';
import { FollowsService, FollowState } from './follows.service.js';

@ApiTags('users')
@Controller('users')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Post(':id/follow')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'フォローする',
    description:
      '承認は不要。すでにフォローしていても同じ結果を返す(何度実行しても同じ。同時に実行しても重複しない)。自分自身は 400(CANNOT_FOLLOW_SELF)。フォローすると、相手のフォロワー限定の投稿が見られるようになる。',
  })
  @ApiOkResponse({ type: FollowState })
  @ApiErrors(400, 401, 404)
  follow(
    @Req() req: AuthenticatedRequest,
    @Param('id', UserIdParamPipe) id: number,
  ): Promise<FollowState> {
    return this.follows.follow(req.user!.id, id);
  }

  @Delete(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'フォローを解除する',
    description:
      'フォローしていなくても同じ結果を返す。解除すると、相手のフォロワー限定の投稿は見られなくなる。',
  })
  @ApiOkResponse({ type: FollowState })
  @ApiErrors(401, 404)
  unfollow(
    @Req() req: AuthenticatedRequest,
    @Param('id', UserIdParamPipe) id: number,
  ): Promise<FollowState> {
    return this.follows.unfollow(req.user!.id, id);
  }
}
