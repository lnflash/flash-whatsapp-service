import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsPhoneNumber, IsSanitizedText } from '../../../common/validators/custom-validators';

export class SendTestMessageDto {
  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber()
  @Transform(({ value }) => value?.trim())
  to: string;

  @IsString()
  @IsOptional()
  @MaxLength(4096, {
    message: 'Message must not exceed 4096 characters',
  })
  @IsSanitizedText()
  @Transform(({ value }) => value?.trim() || 'Hello from Pulse!')
  message?: string = 'Hello from Pulse!';
}
