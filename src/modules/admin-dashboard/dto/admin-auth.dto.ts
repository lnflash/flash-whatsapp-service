import { IsString, IsNotEmpty, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminLoginDto {
  @ApiProperty({
    description: 'Admin phone number',
    example: '+1234567890',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Invalid phone number format',
  })
  phoneNumber: string;

  @ApiProperty({
    description: 'Device fingerprint for security',
    required: false,
  })
  @IsString()
  deviceFingerprint?: string;

  @ApiProperty({
    description: 'Client IP address',
    required: false,
  })
  @IsString()
  ipAddress?: string;

  @ApiProperty({
    description: 'User agent string',
    required: false,
  })
  @IsString()
  userAgent?: string;
}

export class AdminVerifyOtpDto {
  @ApiProperty({
    description: 'Temporary session ID from login',
  })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({
    description: 'OTP verification code',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  otp: string;

  @ApiProperty({
    description: 'Device fingerprint for security',
    required: false,
  })
  @IsString()
  deviceFingerprint?: string;
}

export class AdminRefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class AdminTOTPVerifyDto {
  @ApiProperty({
    description: 'Session ID from OTP verification',
  })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({
    description: 'TOTP code from authenticator app',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  totpCode: string;

  @ApiProperty({
    description: 'Alternative token field',
    required: false,
  })
  @IsString()
  token?: string;

  @ApiProperty({
    description: 'Device fingerprint for security',
    required: false,
  })
  @IsString()
  deviceFingerprint?: string;

  @ApiProperty({
    description: 'Trust this device for future logins',
    required: false,
  })
  trustDevice?: boolean;
}

export class AdminSessionDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  expiresIn: number;

  @ApiProperty()
  phoneNumber: string;

  @ApiProperty()
  sessionId: string;

  @ApiProperty({ required: false })
  totpRequired?: boolean;

  @ApiProperty({ required: false })
  user?: any;

  @ApiProperty({ required: false })
  message?: string;
}
