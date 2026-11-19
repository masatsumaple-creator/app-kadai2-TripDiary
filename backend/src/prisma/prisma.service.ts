import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { resolveDatabaseUrl } from './database-url.js';

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

// 接続先は Prisma CLI と共通の mysql:// 形式(resolveDatabaseUrl)。アダプターは URL 文字列を
// そのまま受け取れないため、接続設定に分解して渡す。
function createAdapter(databaseUrl: string): PrismaMariaDb {
  const url = new URL(databaseUrl);
  return new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    // ローカルの MySQL 8(caching_sha2_password)で TLS なし接続するために必要
    allowPublicKeyRetrieval: LOCAL_HOSTS.includes(url.hostname),
  });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: createAdapter(resolveDatabaseUrl()) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
