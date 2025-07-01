import {
  IsNotEmpty,
  IsEnum,
  IsString,
  IsOptional,
  ValidateNested,
  IsBoolean,
  IsNumber,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum NotificationType {
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_SENT = 'payment_sent',
  ACCOUNT_ACTIVITY = 'account_activity',
  SECURITY_ALERT = 'security_alert',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
}

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum NotificationChannel {
  WHATSAPP = 'whatsapp',
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  ALL = 'all',
}

// Data for payment-related notifications
export class PaymentData {
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  senderName?: string;

  @IsString()
  @IsOptional()
  receiverName?: string;

  @IsISO8601()
  @IsNotEmpty()
  timestamp: string;

  @IsString()
  @IsOptional()
  memo?: string;
}

// Base notification DTO
export class NotificationDto {
  @IsEnum(NotificationType)
  @IsNotEmpty()
  type: NotificationType;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsEnum(NotificationPriority)
  @IsOptional()
  priority?: NotificationPriority = NotificationPriority.MEDIUM;

  @IsEnum(NotificationChannel, { each: true })
  @IsOptional()
  channels?: NotificationChannel[] = [NotificationChannel.WHATSAPP];

  @IsBoolean()
  @IsOptional()
  requiresAction?: boolean = false;

  @IsISO8601()
  @IsOptional()
  expiresAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentData)
  paymentData?: PaymentData;

  @IsOptional()
  additionalData?: Record<string, any>;
}

// DTO for sending notifications
export class SendNotificationDto {
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => NotificationDto)
  notification: NotificationDto;

  @IsBoolean()
  @IsOptional()
  skipPreferences?: boolean = false;
}

// DTO for updating notification preferences
export class NotificationPreferencesDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsBoolean()
  @IsOptional()
  paymentReceived?: boolean = true;

  @IsBoolean()
  @IsOptional()
  paymentSent?: boolean = true;

  @IsBoolean()
  @IsOptional()
  accountActivity?: boolean = true;

  @IsBoolean()
  @IsOptional()
  securityAlert?: boolean = true;

  @IsBoolean()
  @IsOptional()
  systemAnnouncement?: boolean = true;

  @IsEnum(NotificationChannel, { each: true })
  @IsOptional()
  preferredChannels?: NotificationChannel[] = [NotificationChannel.WHATSAPP];
}
