import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FlashApiService } from './flash-api.service';
import { BalanceService } from './services/balance.service';
import { UsernameService } from './services/username.service';
import { PriceService } from './services/price.service';
import { InvoiceService } from './services/invoice.service';
import { SubscriptionService } from './services/subscription.service';
import { TransactionService } from './services/transaction.service';
import { PaymentService } from './services/payment.service';
import { PendingPaymentService } from './services/pending-payment.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [
    FlashApiService,
    BalanceService,
    UsernameService,
    PriceService,
    InvoiceService,
    SubscriptionService,
    TransactionService,
    PaymentService,
    PendingPaymentService,
  ],
  exports: [
    FlashApiService,
    BalanceService,
    UsernameService,
    PriceService,
    InvoiceService,
    SubscriptionService,
    TransactionService,
    PaymentService,
    PendingPaymentService,
  ],
})
export class FlashApiModule {}
