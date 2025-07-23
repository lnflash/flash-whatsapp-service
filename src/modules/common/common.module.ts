import { Module, Global } from '@nestjs/common';
import { RequestDeduplicatorService } from './services/request-deduplicator.service';

@Global()
@Module({
  providers: [RequestDeduplicatorService],
  exports: [RequestDeduplicatorService],
})
export class CommonModule {}