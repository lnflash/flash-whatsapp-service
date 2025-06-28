import { IsString, IsNotEmpty, IsOptional, MaxLength, IsISO8601, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CloudMessageDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'From must be a valid phone number in international format',
  })
  @Transform(({ value }) => value?.trim())
  from: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096, {
    message: 'Message text must not exceed 4096 characters',
  })
  @Transform(({ value }) => value?.trim())
  text: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100, {
    message: 'Message ID must not exceed 100 characters',
  })
  messageId: string;

  @IsISO8601()
  @IsNotEmpty()
  timestamp: string;

  @IsString()
  @IsOptional()
  @MaxLength(100, {
    message: 'Name must not exceed 100 characters',
  })
  @Transform(({ value }) => value?.trim())
  name?: string;
}
