import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventsService } from './events.service';
import { EventDispatcherService } from './services/event-dispatcher.service';
import { QueueMonitorService } from './services/queue-monitor.service';
import { EventReplayService } from './services/event-replay.service';
import { CommonModule } from '../common/common.module';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),
    CommonModule,
    RedisModule,
  ],
  providers: [EventsService, EventDispatcherService, QueueMonitorService, EventReplayService],
  exports: [
    EventsService,
    EventEmitterModule,
    EventDispatcherService,
    QueueMonitorService,
    EventReplayService,
  ],
})
export class EventsModule {}
