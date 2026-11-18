import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { PageQueryDto } from '../../common/page-query.dto.js';

export const COMMENT_MAX_LENGTH = 500;

export class CreateCommentDto {
  // 前後の空白を除いてから検証する(空白だけのコメントは受け付けない)
  @ApiProperty({
    type: 'string',
    minLength: 1,
    maxLength: COMMENT_MAX_LENGTH,
    description:
      'コメント本文(前後の空白は除く)。HTML としては解釈されず、入力のまま返る',
    example: '来月行く予定です。おすすめの時間帯は?',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'コメントを入力してください。' })
  @Length(1, COMMENT_MAX_LENGTH, {
    message: `コメントは 1〜${COMMENT_MAX_LENGTH} 文字で入力してください。`,
  })
  body: string;
}

// コメント一覧のページング(cursor、limit)
export class ListCommentsQueryDto extends PageQueryDto {}
