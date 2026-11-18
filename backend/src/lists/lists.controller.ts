import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
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
import { ListMyListQueryDto, SetListStatusDto } from './dto/list.dto.js';
import {
  ListEntryState,
  ListsService,
  MyListResponse,
} from './lists.service.js';

@ApiTags('lists')
@Controller()
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Put('spots/:id/list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'マイリストに入れる / 状態を変える',
    description:
      '「行きたい」(wishlist)や「訪問済み」(visited)で、自分のリストに入れる。すでに入っている投稿の状態も、この API で変える(「行きたい」→「訪問済み」など)。閲覧できる投稿だけが対象(閲覧できない投稿は 404)。自分の投稿は、作成時に自動で「訪問済み」になるため、変更できない(400、OWN_SPOT_IN_LIST)。同じ状態で何度実行しても、同じ結果を返す。',
  })
  @ApiOkResponse({ type: ListEntryState })
  @ApiErrors(400, 401, 404)
  set(
    @Req() req: AuthenticatedRequest,
    @Param('id', IdParamPipe) id: number,
    @Body() dto: SetListStatusDto,
  ): Promise<ListEntryState> {
    return this.lists.set(id, req.user!.id, dto.status);
  }

  @Delete('spots/:id/list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'マイリストから外す',
    description:
      'リストにない投稿でも、同じ結果を返す。自分の投稿は外せない(400、OWN_SPOT_IN_LIST)。',
  })
  @ApiOkResponse({ type: ListEntryState })
  @ApiErrors(400, 401, 404)
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', IdParamPipe) id: number,
  ): Promise<ListEntryState> {
    return this.lists.remove(id, req.user!.id);
  }

  @Get('me/list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '自分のマイリスト',
    description:
      '状態(visited / wishlist)ごとの一覧を、リストに入れた新しい順で返す。閲覧できない投稿は含めない。カーソル方式のページング(nextCursor を、次のリクエストの cursor に渡す)。counts は、状態ごとの件数(タブの表示用)。リストは本人だけが見られる。',
  })
  @ApiOkResponse({ type: MyListResponse })
  @ApiErrors(400, 401)
  myList(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListMyListQueryDto,
  ): Promise<MyListResponse> {
    return this.lists.list(req.user!.id, query);
  }
}
