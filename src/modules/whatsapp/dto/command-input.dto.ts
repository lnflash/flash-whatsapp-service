import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  MaxLength,
  Matches,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class BaseCommandDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  @Transform(({ value }) => value?.trim())
  rawCommand: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'WhatsApp ID must be a valid phone number',
  })
  whatsappId: string;
}

export class SendCommandDto extends BaseCommandDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^((\+?[1-9]\d{1,14})|([a-z0-9_.]{3,16}))$/i, {
    message: 'Recipient must be a valid phone number or username',
  })
  @Transform(({ value }) => value?.trim().toLowerCase())
  recipient: string;

  @IsNumber()
  @Type(() => Number)
  @Min(0.01, { message: 'Amount must be at least $0.01' })
  @Max(1000, { message: 'Amount must not exceed $1000' })
  amount: number;

  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'Memo must not exceed 1000 characters' })
  @Transform(({ value }) => value?.trim())
  memo?: string;
}

export class ReceiveCommandDto extends BaseCommandDto {
  @IsNumber()
  @Type(() => Number)
  @Min(0.01, { message: 'Amount must be at least $0.01' })
  @Max(1000, { message: 'Amount must not exceed $1000' })
  amount: number;

  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'Memo must not exceed 1000 characters' })
  @Transform(({ value }) => value?.trim())
  memo?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(60, { message: 'Expiry must be at least 60 seconds' })
  @Max(86400, { message: 'Expiry must not exceed 24 hours (86400 seconds)' })
  expirySeconds?: number;
}

export class PayInvoiceCommandDto extends BaseCommandDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^lnbc[a-z0-9]+$/i, {
    message: 'Must be a valid Lightning invoice',
  })
  invoice: string;
}

export class ContactCommandDto extends BaseCommandDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(add|remove|list)$/i, {
    message: 'Action must be add, remove, or list',
  })
  @Transform(({ value }) => value?.toLowerCase())
  action: string;

  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Contact must be a valid phone number',
  })
  contactNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'Contact name must not exceed 50 characters' })
  @Transform(({ value }) => value?.trim())
  contactName?: string;
}

export class AdminCommandDto extends BaseCommandDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(status|disconnect|reconnect|users|metrics|clear-cache|test-error)$/i, {
    message: 'Invalid admin command',
  })
  @Transform(({ value }) => value?.toLowerCase())
  adminAction: string;

  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  forceDisconnect?: boolean;
}
