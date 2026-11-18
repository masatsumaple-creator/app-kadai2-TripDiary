import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { setupSwaggerUi } from './openapi/openapi.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  // API 仕様書を公開する: Swagger UI は /api/docs、JSON は /api/docs-json
  setupSwaggerUi(app);
  await app.listen(process.env['PORT'] ?? 3000);
}
await bootstrap();
