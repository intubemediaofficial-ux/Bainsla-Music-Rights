import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

export function configureApp(app: INestApplication) {
  const http = app.getHttpAdapter().getInstance();
  http.set('trust proxy', 'loopback');
  http.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  return app;
}

export function setupSwagger(app: INestApplication) {
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Music Rights Cloud API')
      .setDescription('Multi-tenant music copyright & ownership records. Cookie session auth; send X-CSRF-Token (value of mrc_csrf cookie) on mutating requests.')
      .setVersion('1.0')
      .addCookieAuth('mrc_session')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/docs/openapi.json' });
}
