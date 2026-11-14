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
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { IdParamPipe } from '../common/id-param.pipe.js';
import { ListSpotsQueryDto } from './dto/list-spots.dto.js';
import { SpotInputDto } from './dto/spot.dto.js';
import { SpotsService } from './spots.service.js';
import type { SpotListResponse, SpotResponse } from './spots.service.js';

@Controller('spots')
export class SpotsController {
  constructor(private readonly spots: SpotsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SpotInputDto,
  ): Promise<SpotResponse> {
    return this.spots.create(req.user!.id, dto);
  }

  // 新着一覧。閲覧できる投稿だけを返す(未ログインなら公開のみ)
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListSpotsQueryDto,
  ): Promise<SpotListResponse> {
    return this.spots.list(query, req.user?.id);
  }

  // 公開投稿は未ログインでも見られる。公開範囲に合わない場合は 404
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id', IdParamPipe) id: number,
  ): Promise<SpotResponse> {
    return this.spots.get(id, req.user?.id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
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
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', IdParamPipe) id: number,
  ): Promise<void> {
    await this.spots.remove(id, req.user!.id);
  }
}
