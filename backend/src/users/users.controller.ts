import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { UserIdParamPipe } from '../common/id-param.pipe.js';
import { UsersService } from './users.service.js';
import type { UserProfile } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // プロフィールは、未ログインでも見られる
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  getProfile(
    @Req() req: AuthenticatedRequest,
    @Param('id', UserIdParamPipe) id: number,
  ): Promise<UserProfile> {
    return this.users.getProfile(id, req.user?.id);
  }
}
