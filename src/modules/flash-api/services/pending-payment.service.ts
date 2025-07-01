import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export interface PendingPayment {
  id: string;
  senderId: string;
  senderUsername: string;
  senderPhone: string;
  recipientPhone: string;
  recipientName?: string;
  amountCents: number;
  claimCode: string;
  status: 'pending' | 'claimed' | 'expired' | 'cancelled';
  createdAt: string;
  expiresAt: string;
  claimedAt?: string;
  claimedById?: string;
  memo?: string;
  escrowTransactionId?: string; // Transaction ID from sender to admin wallet
}

@Injectable()
export class PendingPaymentService {
  private readonly logger = new Logger(PendingPaymentService.name);
  private readonly PENDING_PAYMENT_PREFIX = 'pending_payment:';
  private readonly PENDING_BY_PHONE_PREFIX = 'pending_by_phone:';
  private readonly PENDING_BY_SENDER_PREFIX = 'pending_by_sender:';
  private readonly DEFAULT_EXPIRY_DAYS = 30;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Create a pending payment
   */
  async createPendingPayment(params: {
    senderId: string;
    senderUsername: string;
    senderPhone: string;
    recipientPhone: string;
    recipientName?: string;
    amountCents: number;
    memo?: string;
    escrowTransactionId?: string;
  }): Promise<PendingPayment> {
    try {
      const payment: PendingPayment = {
        id: uuidv4(),
        senderId: params.senderId,
        senderUsername: params.senderUsername,
        senderPhone: params.senderPhone,
        recipientPhone: params.recipientPhone.replace(/\D/g, ''), // Normalize phone
        recipientName: params.recipientName,
        amountCents: params.amountCents,
        claimCode: this.generateClaimCode(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + this.DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString(),
        memo: params.memo,
        escrowTransactionId: params.escrowTransactionId,
      };

      // Store in Redis with expiry
      const key = `${this.PENDING_PAYMENT_PREFIX}${payment.id}`;
      const ttl = this.DEFAULT_EXPIRY_DAYS * 24 * 60 * 60; // 30 days in seconds
      await this.redisService.set(key, JSON.stringify(payment), ttl);

      // Create indexes for lookup
      await this.addToPhoneIndex(payment.recipientPhone, payment.id);
      await this.addToSenderIndex(payment.senderId, payment.id);

      return payment;
    } catch (error) {
      this.logger.error(`Error creating pending payment: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Create a pending payment with a specific claim code
   */
  async createPendingPaymentWithCode(params: {
    senderId: string;
    senderUsername: string;
    senderPhone: string;
    recipientPhone: string;
    recipientName?: string;
    amountCents: number;
    memo?: string;
    claimCode: string;
    escrowTransactionId?: string;
  }): Promise<PendingPayment> {
    try {
      const payment: PendingPayment = {
        id: uuidv4(),
        senderId: params.senderId,
        senderUsername: params.senderUsername,
        senderPhone: params.senderPhone,
        recipientPhone: params.recipientPhone.replace(/\D/g, ''), // Normalize phone
        recipientName: params.recipientName,
        amountCents: params.amountCents,
        claimCode: params.claimCode, // Use provided claim code
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + this.DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString(),
        memo: params.memo,
        escrowTransactionId: params.escrowTransactionId,
      };

      // Store in Redis with expiry
      const key = `${this.PENDING_PAYMENT_PREFIX}${payment.id}`;
      const ttl = this.DEFAULT_EXPIRY_DAYS * 24 * 60 * 60; // 30 days in seconds
      await this.redisService.set(key, JSON.stringify(payment), ttl);

      // Create indexes for lookup
      await this.addToPhoneIndex(payment.recipientPhone, payment.id);
      await this.addToSenderIndex(payment.senderId, payment.id);

      return payment;
    } catch (error) {
      this.logger.error(`Error creating pending payment: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get pending payments for a phone number
   */
  async getPendingPaymentsByPhone(phone: string): Promise<PendingPayment[]> {
    try {
      const normalizedPhone = phone.replace(/\D/g, '');
      const indexKey = `${this.PENDING_BY_PHONE_PREFIX}${normalizedPhone}`;
      const paymentIds = await this.redisService.get(indexKey);

      if (!paymentIds) {
        return [];
      }

      const ids = JSON.parse(paymentIds) as string[];
      const payments: PendingPayment[] = [];

      for (const id of ids) {
        const payment = await this.getPendingPayment(id);
        if (payment && payment.status === 'pending') {
          payments.push(payment);
        }
      }

      return payments;
    } catch (error) {
      this.logger.error(`Error getting pending payments by phone: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get pending payments sent by a user
   */
  async getPendingPaymentsBySender(senderId: string): Promise<PendingPayment[]> {
    try {
      const indexKey = `${this.PENDING_BY_SENDER_PREFIX}${senderId}`;
      const paymentIds = await this.redisService.get(indexKey);

      if (!paymentIds) {
        return [];
      }

      const ids = JSON.parse(paymentIds) as string[];
      const payments: PendingPayment[] = [];

      for (const id of ids) {
        const payment = await this.getPendingPayment(id);
        if (payment) {
          payments.push(payment);
        }
      }

      return payments;
    } catch (error) {
      this.logger.error(`Error getting pending payments by sender: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Get a specific pending payment
   */
  async getPendingPayment(paymentId: string): Promise<PendingPayment | null> {
    try {
      const key = `${this.PENDING_PAYMENT_PREFIX}${paymentId}`;
      const data = await this.redisService.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as PendingPayment;
    } catch (error) {
      this.logger.error(`Error getting pending payment: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Claim a pending payment
   */
  async claimPendingPayment(
    paymentId: string,
    claimedById: string,
  ): Promise<PendingPayment | null> {
    try {
      const payment = await this.getPendingPayment(paymentId);

      if (!payment) {
        this.logger.warn(`Pending payment ${paymentId} not found`);
        return null;
      }

      if (payment.status !== 'pending') {
        this.logger.warn(
          `Pending payment ${paymentId} is not in pending status: ${payment.status}`,
        );
        return null;
      }

      // Check if expired
      if (new Date(payment.expiresAt) < new Date()) {
        payment.status = 'expired';
        await this.updatePendingPayment(payment);
        this.logger.warn(`Pending payment ${paymentId} has expired`);
        return null;
      }

      // Update payment status
      payment.status = 'claimed';
      payment.claimedAt = new Date().toISOString();
      payment.claimedById = claimedById;

      await this.updatePendingPayment(payment);

      // Remove from pending indexes
      await this.removeFromPhoneIndex(payment.recipientPhone, payment.id);

      return payment;
    } catch (error) {
      this.logger.error(`Error claiming pending payment: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Cancel a pending payment
   */
  async cancelPendingPayment(paymentId: string, senderId: string): Promise<boolean> {
    try {
      const payment = await this.getPendingPayment(paymentId);

      if (!payment) {
        return false;
      }

      if (payment.senderId !== senderId) {
        this.logger.warn(
          `User ${senderId} cannot cancel payment ${paymentId} sent by ${payment.senderId}`,
        );
        return false;
      }

      if (payment.status !== 'pending') {
        this.logger.warn(`Cannot cancel payment ${paymentId} with status ${payment.status}`);
        return false;
      }

      payment.status = 'cancelled';
      await this.updatePendingPayment(payment);

      // Remove from indexes
      await this.removeFromPhoneIndex(payment.recipientPhone, payment.id);

      return true;
    } catch (error) {
      this.logger.error(`Error cancelling pending payment: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Generate a secure claim code
   */
  private generateClaimCode(): string {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  /**
   * Update a pending payment
   */
  private async updatePendingPayment(payment: PendingPayment): Promise<void> {
    const key = `${this.PENDING_PAYMENT_PREFIX}${payment.id}`;
    const ttl = Math.floor((new Date(payment.expiresAt).getTime() - Date.now()) / 1000);

    if (ttl > 0) {
      await this.redisService.set(key, JSON.stringify(payment), ttl);
    } else {
      await this.redisService.del(key);
    }
  }

  /**
   * Add payment ID to phone index
   */
  private async addToPhoneIndex(phone: string, paymentId: string): Promise<void> {
    const indexKey = `${this.PENDING_BY_PHONE_PREFIX}${phone}`;
    const existing = await this.redisService.get(indexKey);

    let ids: string[] = existing ? JSON.parse(existing) : [];
    if (!ids.includes(paymentId)) {
      ids.push(paymentId);
      await this.redisService.set(
        indexKey,
        JSON.stringify(ids),
        this.DEFAULT_EXPIRY_DAYS * 24 * 60 * 60,
      );
    }
  }

  /**
   * Add payment ID to sender index
   */
  private async addToSenderIndex(senderId: string, paymentId: string): Promise<void> {
    const indexKey = `${this.PENDING_BY_SENDER_PREFIX}${senderId}`;
    const existing = await this.redisService.get(indexKey);

    let ids: string[] = existing ? JSON.parse(existing) : [];
    if (!ids.includes(paymentId)) {
      ids.push(paymentId);
      await this.redisService.set(
        indexKey,
        JSON.stringify(ids),
        this.DEFAULT_EXPIRY_DAYS * 24 * 60 * 60,
      );
    }
  }

  /**
   * Remove payment ID from phone index
   */
  private async removeFromPhoneIndex(phone: string, paymentId: string): Promise<void> {
    const indexKey = `${this.PENDING_BY_PHONE_PREFIX}${phone}`;
    const existing = await this.redisService.get(indexKey);

    if (existing) {
      let ids: string[] = JSON.parse(existing);
      ids = ids.filter((id) => id !== paymentId);

      if (ids.length > 0) {
        await this.redisService.set(
          indexKey,
          JSON.stringify(ids),
          this.DEFAULT_EXPIRY_DAYS * 24 * 60 * 60,
        );
      } else {
        await this.redisService.del(indexKey);
      }
    }
  }

  /**
   * Format pending payment for display
   */
  formatPendingPaymentMessage(payment: PendingPayment): string {
    const amountUsd = (payment.amountCents / 100).toFixed(2);
    const expiresIn = Math.ceil(
      (new Date(payment.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    return (
      `💰 *You have money waiting for you!*\n\n` +
      `@${payment.senderUsername} sent you $${amountUsd} USD\n` +
      `${payment.memo ? `Message: "${payment.memo}"\n` : ''}` +
      `\n🎯 *To claim your money:*\n` +
      `1. Reply with the word "link"\n` +
      `2. I'll help you create a Flash account\n` +
      `3. Your $${amountUsd} will be instantly credited!\n\n` +
      `⏱️ This payment expires in ${expiresIn} days\n` +
      `🔑 Claim code: ${payment.claimCode}\n\n` +
      `Flash is a Bitcoin wallet that lets you send and receive money instantly. Your funds are waiting for you!`
    );
  }
}
