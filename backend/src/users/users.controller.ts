import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { ApiErrors, ApiOptionalBearerAuth } from '../common/api-doc.js';
import { UserIdParamPipe } from '../common/id-param.pipe.js';
import { UsersService, UserProfile } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // プロフィールは、未ログインでも見られる
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOptionalBearerAuth()
  @ApiOperation({
    summary: 'プロフィール',
    description:
      'ログインは任意。表示名、フォロー数・フォロワー数、閲覧者が見られる投稿の数を返す。メールアドレスなどの個人情報は含めない。そのユーザーの投稿一覧は、GET /api/spots?author=<ID> で取得する。',
  })
  @ApiOkResponse({ type: UserProfile })
  @ApiErrors(401, 404)
  getProfile(
    @Req() req: AuthenticatedRequest,
    @Param('id', UserIdParamPipe) id: number,
  ): Promise<UserProfile> {
    return this.users.getProfile(id, req.user?.id);
  }
}
