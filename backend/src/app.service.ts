import { ApiProperty } from '@nestjs/swagger';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';

export class HealthStatus {
  @ApiProperty({ enum: ['ok'], description: 'アプリが動いている' })
  status: 'ok';

  @ApiProperty({
    enum: ['up'],
    description:
      'データベースに接続できている(できない場合は、この API が 500 を返す)',
  })
  db: 'up';
}

export class LiveStatus {
  @ApiProperty({ enum: ['ok'], description: 'アプリが動いている' })
  status: 'ok';
}

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        code: 'DB_UNAVAILABLE',
        message: 'Database is not reachable',
      });
    }
    return { status: 'ok', db: 'up' };
  }
}
