import { Module } from '@nestjs/common';
import { PhotoStorage } from './photo-storage.service.js';

// 画像の置き場(S3)。投稿(表示用の URL・削除)と、写真(アップロード)の両方が使う
@Module({
  providers: [PhotoStorage],
  exports: [PhotoStorage],
})
export class PhotoStorageModule {}
