import { IsNotEmpty, IsString, IsMobilePhone, ValidateIf, IsOptional } from 'class-validator';

export class AccountLinkRequestDto {
  @IsString()
  @IsNotEmpty()
  whatsappId: string;

  @IsMobilePhone(undefined, { strictMode: true })
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsOptional()
  flashUserId?: string;

  @IsString()
  @ValidateIf(o => o.otpCode !== undefined)
  otpCode?: string;

  @IsString()
  @IsOptional()
  sessionId?: string;
}