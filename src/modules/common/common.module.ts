import { Module, Global } from '@nestjs/common';
import { RequestDeduplicator } from './services/request-deduplicator.service';

@Global()
@Module({
  providers: [RequestDeduplicator],
  exports: [RequestDeduplicator],
})
export class CommonModule {}