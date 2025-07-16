import { Module, DynamicModule, Type, Global } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingPlatform } from './interfaces/messaging-platform.interface';
import { MESSAGING_PLATFORM, MESSAGING_OPTIONS } from './messaging.constants';

export interface MessagingModuleOptions {
  platform?: string;
  platforms?: Record<string, Type<MessagingPlatform>>;
}

@Global()
@Module({})
export class MessagingModule {
  static forRoot(platformClass: Type<MessagingPlatform>): DynamicModule {
    return {
      module: MessagingModule,
      providers: [
        MessagingService,
        {
          provide: MESSAGING_PLATFORM,
          useClass: platformClass,
        },
      ],
      exports: [MessagingService, MESSAGING_PLATFORM],
    };
  }

  static forRootAsync(options: MessagingModuleOptions): DynamicModule {
    return {
      module: MessagingModule,
      providers: [
        MessagingService,
        {
          provide: MESSAGING_OPTIONS,
          useValue: options,
        },
      ],
      exports: [MessagingService, MESSAGING_OPTIONS],
    };
  }
}
