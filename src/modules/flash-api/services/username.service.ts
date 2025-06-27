import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FlashApiService } from '../flash-api.service';

interface UserUpdateUsernameResult {
  errors?: Array<{ code: string }>;
  user?: {
    id: string;
    username: string;
  };
}

@Injectable()
export class UsernameService {
  private readonly logger = new Logger(UsernameService.name);

  constructor(private readonly flashApiService: FlashApiService) {}

  /**
   * Get current username for user
   */
  async getUsername(authToken: string): Promise<string | null> {
    try {
      const query = `
        query me {
          me {
            username
          }
        }
      `;

      const result = await this.flashApiService.executeQuery<{
        me: {
          username: string | null;
        };
      }>(query, {}, authToken);

      return result.me.username;
    } catch (error) {
      this.logger.error(`Error getting username: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to retrieve username');
    }
  }

  /**
   * Update username for user
   */
  async setUsername(username: string, authToken: string): Promise<void> {
    try {
      const mutation = `
        mutation userUpdateUsername($input: UserUpdateUsernameInput!) {
          userUpdateUsername(input: $input) {
            errors {
              code
            }
            user {
              id
              username
            }
          }
        }
      `;

      const variables = {
        input: {
          username,
        },
      };

      const result = await this.flashApiService.executeQuery<{
        userUpdateUsername: UserUpdateUsernameResult;
      }>(mutation, variables, authToken);

      if (result.userUpdateUsername.errors?.length) {
        const errorCode = result.userUpdateUsername.errors[0].code;

        if (errorCode === 'ADDRESS_UNAVAILABLE') {
          throw new BadRequestException(
            'This username is already taken. Please choose another one.',
          );
        }

        throw new BadRequestException(`Failed to set username: ${errorCode}`);
      }

      this.logger.log(`Username set successfully: ${username}`);
    } catch (error) {
      this.logger.error(`Error setting username: ${error.message}`, error.stack);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Failed to set username. Please try again later.');
    }
  }
}
