import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
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
import { CommentIdParamPipe, IdParamPipe } from '../common/id-param.pipe.js';
import {
  CommentsService,
  CommentListResponse,
  CommentResponse,
} from './comments.service.js';
import { CreateCommentDto, ListCommentsQueryDto } from './dto/comment.dto.js';

@ApiTags('comments')
@Controller('spots/:spotId/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  // 閲覧できる投稿のコメントは、未ログインでも見られる
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOptionalBearerAuth()
  @ApiOperation({
    summary: 'コメントの一覧(古い順)',
    description:
      'ログインは任意。閲覧できる投稿のコメントだけが読める(閲覧できない投稿は 404)。古い順(ID の昇順)で、カーソル方式のページング(nextCursor を、次のリクエストの cursor に渡す)。各コメントの canDelete は、閲覧者が削除できるか。',
  })
  @ApiOkResponse({ type: CommentListResponse })
  @ApiErrors(400, 401, 404)
  list(
    @Req() req: AuthenticatedRequest,
    @Param('spotId', IdParamPipe) spotId: number,
    @Query() query: ListCommentsQueryDto,
  ): Promise<CommentListResponse> {
    return this.comments.list(spotId, query, req.user?.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'コメントを投稿',
    description:
      '閲覧できる投稿だけが対象。投稿者本人も、自分の投稿にコメントできる(質問への返信など)。コメントした人は、常にログイン中のユーザー。',
  })
  @ApiCreatedResponse({ type: CommentResponse })
  @ApiErrors(400, 401, 404)
  create(
    @Req() req: AuthenticatedRequest,
    @Param('spotId', IdParamPipe) spotId: number,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentResponse> {
    return this.comments.create(spotId, req.user!.id, dto);
  }

  @Delete(':commentId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'コメントを削除',
    description:
      '削除できるのは、コメントした本人と、その投稿の投稿者だけ(それ以外は 403)。閲覧できない投稿、存在しないコメント、別の投稿のコメントは 404。',
  })
  @ApiNoContentResponse({ description: '削除した' })
  @ApiErrors(401, 403, 404)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('spotId', IdParamPipe) spotId: number,
    @Param('commentId', CommentIdParamPipe) commentId: number,
  ): Promise<void> {
    await this.comments.remove(spotId, commentId, req.user!.id);
  }
}
