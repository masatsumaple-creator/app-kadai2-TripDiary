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
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { CommentIdParamPipe, IdParamPipe } from '../common/id-param.pipe.js';
import { CommentsService } from './comments.service.js';
import type {
  CommentListResponse,
  CommentResponse,
} from './comments.service.js';
import { CreateCommentDto, ListCommentsQueryDto } from './dto/comment.dto.js';

@Controller('spots/:spotId/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  // 閲覧できる投稿のコメントは、未ログインでも見られる
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(
    @Req() req: AuthenticatedRequest,
    @Param('spotId', IdParamPipe) spotId: number,
    @Query() query: ListCommentsQueryDto,
  ): Promise<CommentListResponse> {
    return this.comments.list(spotId, query, req.user?.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
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
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('spotId', IdParamPipe) spotId: number,
    @Param('commentId', CommentIdParamPipe) commentId: number,
  ): Promise<void> {
    await this.comments.remove(spotId, commentId, req.user!.id);
  }
}
