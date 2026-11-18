import {
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { IdParamPipe } from '../common/id-param.pipe.js';
import { LikesService } from './likes.service.js';
import type { LikeState } from './likes.service.js';

@Controller('spots')
export class LikesController {
  constructor(private readonly likes: LikesService) {}

  @Post(':id/like')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  like(
    @Req() req: AuthenticatedRequest,
    @Param('id', IdParamPipe) id: number,
  ): Promise<LikeState> {
    return this.likes.like(id, req.user!.id);
  }

  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  unlike(
    @Req() req: AuthenticatedRequest,
    @Param('id', IdParamPipe) id: number,
  ): Promise<LikeState> {
    return this.likes.unlike(id, req.user!.id);
  }
}
