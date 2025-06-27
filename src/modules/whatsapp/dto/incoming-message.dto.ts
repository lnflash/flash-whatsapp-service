import { IsString, IsOptional } from 'class-validator';

export class IncomingMessageDto {
  @IsString()
  MessageSid: string;

  @IsString()
  From: string;

  @IsString()
  Body: string;

  @IsOptional()
  @IsString()
  ProfileName?: string;

  @IsOptional()
  @IsString()
  WaId?: string;
}
