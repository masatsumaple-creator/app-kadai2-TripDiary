import {
  Body,
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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { ApiErrors } from '../common/api-doc.js';
import { IdParamPipe, PhotoIdParamPipe } from '../common/id-param.pipe.js';
import {
  CreatePhotoUploadDto,
  PHOTO_LIMIT_DESCRIPTION,
  PhotoResponse,
  PhotoUploadResponse,
} from './photo.dto.js';
import { PhotosService } from './photos.service.js';

@ApiTags('photos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spots/:spotId/photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Post()
  @ApiOperation({
    summary: '写真のアップロードを始める',
    description: `署名付き URL を発行する。応答の uploadUrl へ、画像を PUT し(headers のとおりのヘッダーを付ける)、そのあと「アップロードの完了」を呼ぶ。画像は、このサーバーを通らない。本人の投稿だけ。${PHOTO_LIMIT_DESCRIPTION}、1 枚 5MB 以下、JPEG・PNG・WebP。`,
  })
  @ApiCreatedResponse({ type: PhotoUploadResponse })
  @ApiErrors(400, 401, 403, 404)
  createUpload(
    @Req() req: AuthenticatedRequest,
    @Param('spotId', IdParamPipe) spotId: number,
    @Body() dto: CreatePhotoUploadDto,
  ): Promise<PhotoUploadResponse> {
    return this.photos.createUpload(spotId, req.user!.id, dto);
  }

  @Post(':photoId/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: '写真のアップロードの完了',
    description:
      '画像が実際に置かれたこと(大きさ・形式)を確かめて、写真として表示できるようにする。確認できなければ 400(アップロードされていない、または、大きさ・形式が正しくない。後者は、画像も消す)。同じ写真に、もう一度呼んでもよい。',
  })
  @ApiOkResponse({ type: PhotoResponse })
  @ApiErrors(400, 401, 403, 404)
  complete(
    @Req() req: AuthenticatedRequest,
    @Param('spotId', IdParamPipe) spotId: number,
    @Param('photoId', PhotoIdParamPipe) photoId: number,
  ): Promise<PhotoResponse> {
    return this.photos.complete(spotId, photoId, req.user!.id);
  }

  @Delete(':photoId')
  @HttpCode(204)
  @ApiOperation({
    summary: '写真を削除',
    description: '本人の投稿だけ。画像も消す。',
  })
  @ApiNoContentResponse({ description: '削除した' })
  @ApiErrors(401, 403, 404)
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('spotId', IdParamPipe) spotId: number,
    @Param('photoId', PhotoIdParamPipe) photoId: number,
  ): Promise<void> {
    return this.photos.remove(spotId, photoId, req.user!.id);
  }
}
