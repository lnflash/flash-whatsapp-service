import { IsString, IsOptional, IsEnum, IsBoolean, IsDate, IsArray } from 'class-validator';
import { MessageType } from '../interfaces/messaging-platform.interface';

export class IncomingMessageDto {
  @IsString()
  id: string;

  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsDate()
  timestamp: Date;

  @IsEnum(MessageType)
  type: MessageType;

  @IsString()
  @IsOptional()
  text?: string;

  @IsBoolean()
  isGroup: boolean;

  @IsString()
  @IsOptional()
  groupId?: string;

  @IsString()
  platform: string;
}

export class SendMessageDto {
  @IsString()
  to: string;

  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  platform?: string;

  @IsArray()
  @IsOptional()
  mentions?: string[];
}

export class SendMediaDto {
  @IsString()
  to: string;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  caption?: string;

  @IsString()
  type: 'image' | 'video' | 'audio' | 'document';

  @IsString()
  @IsOptional()
  platform?: string;
}
