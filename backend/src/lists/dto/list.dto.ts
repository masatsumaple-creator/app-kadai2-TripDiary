import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { PageQueryDto, emptyToUndefined } from '../../common/page-query.dto.js';
import { LIST_STATUSES } from '../../spots/list-status.js';
import type { ListStatusValue } from '../../spots/list-status.js';

// マイリストに入れる(または状態を変える)ときの入力
export class SetListStatusDto {
  @ApiProperty({
    enum: LIST_STATUSES,
    description: 'visited: 訪問済み、wishlist: 行きたい',
    example: 'wishlist',
  })
  @IsIn(LIST_STATUSES, {
    message: '状態は visited か wishlist で指定してください。',
  })
  status: ListStatusValue;
}

// マイリストの一覧のクエリ(状態 + ページング)
export class ListMyListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    enum: LIST_STATUSES,
    default: 'visited',
    description: '表示する状態。省略すると visited(訪問済み)',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsIn(LIST_STATUSES, {
    message: 'status は visited か wishlist で指定してください。',
  })
  status?: ListStatusValue;
}
