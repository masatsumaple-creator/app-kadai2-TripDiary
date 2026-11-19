import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService, HealthStatus, LiveStatus } from './app.service.js';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health/live')
  @ApiOperation({
    summary: '生存確認',
    description:
      'アプリのプロセスが応答できるかだけを確認する。ログイン不要。DB には依存せず、常に 200(ロードバランサーのヘルスチェック用)。',
  })
  @ApiOkResponse({ type: LiveStatus })
  getLive(): LiveStatus {
    return { status: 'ok' };
  }

  @Get('health')
  @ApiOperation({
    summary: 'ヘルスチェック',
    description:
      'アプリと DB の状態を確認する。ログイン不要。DB に接続できないときは 500。',
  })
  @ApiOkResponse({ type: HealthStatus })
  getHealth(): Promise<HealthStatus> {
    return this.appService.getHealth();
  }
}
