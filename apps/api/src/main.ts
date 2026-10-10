import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp, setupSwagger } from './bootstrap.js';
import { config } from './config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  setupSwagger(app);
  app.enableShutdownHooks();
  await app.listen(config.port, process.env.API_HOST ?? '127.0.0.1');
}
await bootstrap();
