import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';

export interface HealthStatus {
  status: 'ok';
  db: 'up';
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
