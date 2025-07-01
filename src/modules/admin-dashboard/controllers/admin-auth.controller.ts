import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminAuthService } from '../services/admin-auth.service';
import {
  AdminLoginDto,
  AdminVerifyOtpDto,
  AdminRefreshTokenDto,
  AdminSessionDto,
} from '../dto/admin-auth.dto';
import { AdminGuard } from '../guards/admin.guard';

@ApiTags('Admin Authentication')
@Controller('api/admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate admin login with phone number' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized phone number' })
  async login(@Body() loginDto: AdminLoginDto) {
    return this.adminAuthService.initiateLogin(loginDto);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and get access token' })
  @ApiResponse({ status: 200, description: 'Login successful', type: AdminSessionDto })
  @ApiResponse({ status: 401, description: 'Invalid OTP or session' })
  async verifyOtp(@Body() verifyDto: AdminVerifyOtpDto): Promise<AdminSessionDto> {
    return this.adminAuthService.verifyOtp(verifyDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed', type: AdminSessionDto })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() refreshDto: AdminRefreshTokenDto): Promise<AdminSessionDto> {
    return this.adminAuthService.refreshSession(refreshDto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout admin session' })
  @ApiResponse({ status: 204, description: 'Logged out successfully' })
  async logout(@Req() req: any) {
    await this.adminAuthService.logout(req.user.sessionId);
  }
}
