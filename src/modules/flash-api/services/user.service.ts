import { Injectable, Logger } from '@nestjs/common';
import { FlashApiService } from '../flash-api.service';

export interface User {
  id: string;
  username?: string;
  phone?: string;
  email?: string;
}

export interface SetUsernameResult {
  success: boolean;
  error?: string;
}

/**
 * User Service
 * Manages user operations with Flash API
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly flashApiService: FlashApiService) {}

  /**
   * Get user details
   */
  async getUser(userId: string): Promise<User | null> {
    try {
      // Mock implementation
      return {
        id: userId,
        username: 'testuser',
        phone: '18764250250',
      };
    } catch (error) {
      this.logger.error('Failed to get user:', error);
      return null;
    }
  }

  /**
   * Set username
   */
  async setUsername(_userId: string, _username: string): Promise<SetUsernameResult> {
    // Mock implementation
    // In production, this would make an API call to Flash
    try {
      // Check if username is available
      // const isAvailable = await this.flashApiService.checkUsernameAvailability(username);
      // if (!isAvailable) {
      //   return {
      //     success: false,
      //     error: 'Username is already taken',
      //   };
      // }
      // await this.flashApiService.setUsername(userId, username);

      return {
        success: true,
      };
      // eslint-disable-next-line no-unreachable
    } catch (error) {
      this.logger.error('Failed to set username:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
