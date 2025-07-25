import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { SanitizeInterceptor } from './common/interceptors/sanitize.interceptor';
import { Request, Response } from 'express';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Disable default body parser to configure our own
  });
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;

  // Configure request size limits
  const maxRequestSize = configService.get<string>('MAX_REQUEST_SIZE') || '10mb';
  const maxJsonSize = configService.get<string>('MAX_JSON_SIZE') || '1mb';
  const maxUrlEncodedSize = configService.get<string>('MAX_URL_ENCODED_SIZE') || '1mb';

  app.use(express.json({ limit: maxJsonSize }));
  app.use(express.urlencoded({ extended: true, limit: maxUrlEncodedSize }));
  app.use(express.raw({ limit: maxRequestSize }));
  app.use(express.text({ limit: maxRequestSize }));

  // Apply global middlewares with custom CSP for admin dashboard
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.jsdelivr.net',
            'https://fonts.googleapis.com',
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
        },
      },
    }),
  );

  // Apply global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Apply global filters
  app.useGlobalFilters(new GlobalExceptionFilter(configService), new HttpExceptionFilter());

  // Apply global interceptors
  app.useGlobalInterceptors(new SanitizeInterceptor(), new LoggingInterceptor());

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Flash WhatsApp Admin API')
    .setDescription('Admin dashboard API for Flash WhatsApp service')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Admin Authentication', 'Admin login and session management')
    .addTag('Admin Dashboard', 'Dashboard operations and monitoring')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Serve static files for admin dashboard
  app.use('/admin', express.static(join(__dirname, '..', 'public', 'admin')));

  // Serve favicon and other static files from public directory
  app.use(express.static(join(__dirname, '..', 'public')));

  // Configure CORS properly
  const allowedOrigins = configService.get<string>('CORS_ALLOWED_ORIGINS')?.split(',') || [];
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) {
        return callback(null, true);
      }

      // In production, only allow specified origins
      if (isProduction) {
        if (allowedOrigins.length === 0) {
          // No origins configured, deny all
          return callback(new Error('CORS not configured'), false);
        }
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'), false);
      }

      // In development, allow localhost origins
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }

      // Check against allowed origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
    maxAge: 86400, // 24 hours
  });

  // Add health check endpoint
  app.use('/health', (req: Request, res: Response) => {
    res.status(200).send({ status: 'ok' });
  });

  // Enable shutdown hooks
  app.enableShutdownHooks();

  // Start the application
  await app.listen(port);
  logger.log(`Application is running on: ${await app.getUrl()}`);

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM signal received: closing HTTP server');
    await app.close();
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT signal received: closing HTTP server');
    await app.close();
  });
}

const logger = new Logger('Bootstrap');
bootstrap().catch((err) => {
  logger.error('Error starting application:', err);
  process.exit(1);
});
