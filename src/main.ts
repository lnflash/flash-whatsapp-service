import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;

  // Apply global middlewares
  app.use(helmet());

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
  app.useGlobalFilters(new HttpExceptionFilter());

  // Apply global interceptors
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Enable CORS
  app.enableCors();

  // Add health check endpoint
  app.use('/health', (req: Request, res: Response) => {
    res.status(200).send({ status: 'ok' });
  });

  // Enable shutdown hooks
  app.enableShutdownHooks();

  // Start the application
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`Application is running on: ${await app.getUrl()}`);

  // Handle graceful shutdown
  const logger = new Logger('Bootstrap');
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
