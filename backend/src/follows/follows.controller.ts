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
import { UserIdParamPipe } from '../common/id-param.pipe.js';
import { FollowsService } from './follows.service.js';
import type { FollowState } from './follows.service.js';

@Controller('users')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Post(':id/follow')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  follow(
    @Req() req: AuthenticatedRequest,
    @Param('id', UserIdParamPipe) id: number,
  ): Promise<FollowState> {
    return this.follows.follow(req.user!.id, id);
  }

  @Delete(':id/follow')
  @UseGuards(JwtAuthGuard)
  unfollow(
    @Req() req: AuthenticatedRequest,
    @Param('id', UserIdParamPipe) id: number,
  ): Promise<FollowState> {
    return this.follows.unfollow(req.user!.id, id);
  }
}
