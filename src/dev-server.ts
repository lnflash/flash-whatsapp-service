import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

let app: any;
const logger = new Logger('DevServer');

async function bootstrap() {
  try {
    // Close existing app if it exists
    if (app) {
      logger.log('Closing existing application...');
      await app.close();
      // Give WhatsApp Web time to cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    app = await NestFactory.create(AppModule);
    
    // Enable CORS for development
    app.enableCors();
    
    const port = process.env.PORT || 3000;
    await app.listen(port);
    
    logger.log(`Application is running on: http://localhost:${port}`);
  } catch (error) {
    logger.error('Error during bootstrap:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.log('SIGTERM signal received: closing app');
  if (app) {
    await app.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.log('SIGINT signal received: closing app');
  if (app) {
    await app.close();
  }
  process.exit(0);
});

// Handle hot reload
if (module.hot) {
  module.hot.accept();
  module.hot.dispose(() => {
    if (app) {
      app.close();
    }
  });
}

bootstrap();