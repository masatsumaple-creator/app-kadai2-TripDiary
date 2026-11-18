import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService, HealthStatus } from './app.service.js';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

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
