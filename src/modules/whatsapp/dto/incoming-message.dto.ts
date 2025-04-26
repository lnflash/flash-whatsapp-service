import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class IncomingMessageDto {
  @IsString()
  @IsNotEmpty()
  MessageSid: string;

  @IsString()
  @IsNotEmpty()
  From: string;

  @IsString()
  @IsOptional()
  To?: string;

  @IsString()
  @IsNotEmpty()
  Body: string;

  @IsString()
  @IsOptional()
  ProfileName?: string;

  @IsString()
  @IsOptional()
  WaId?: string;

  @IsString()
  @IsOptional()
  SmsStatus?: string;

  @IsString()
  @IsOptional()
  NumMedia?: string;
}