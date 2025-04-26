import { IsNotEmpty, IsString, Length, IsOptional } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  otpCode: string;

  @IsString()
  @IsOptional()
  whatsappId?: string;
}