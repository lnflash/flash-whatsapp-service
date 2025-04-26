import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';

@Injectable()
export class FlashApiService {
  private readonly logger = new Logger(FlashApiService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('flashApi.url') || '';
    this.apiKey = this.configService.get<string>('flashApi.apiKey') || '';
    this.apiSecret = this.configService.get<string>('flashApi.apiSecret') || '';
    
    if (!this.apiUrl || !this.apiKey || !this.apiSecret) {
      this.logger.warn('Flash API configuration incomplete. Some functionality will be limited.');
    }
  }

  /**
   * Execute a GraphQL query against the Flash API
   */
  async executeQuery<T>(query: string, variables: Record<string, any> = {}): Promise<T> {
    try {
      const timestamp = Date.now().toString();
      const headers = this.generateSecureHeaders(query, variables, timestamp);
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          variables,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Flash API error (${response.status}): ${errorText}`);
      }
      
      const data = await response.json();
      
      if (data.errors && data.errors.length > 0) {
        throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
      }
      
      return data.data as T;
    } catch (error) {
      this.logger.error(`Error executing Flash API query: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Generate secure headers for Flash API requests
   */
  private generateSecureHeaders(
    query: string,
    variables: Record<string, any>,
    timestamp: string,
  ): Record<string, string> {
    // Create content hash from the query and variables
    const content = JSON.stringify({ query, variables });
    const contentHash = createHash('sha256').update(content).digest('hex');
    
    // Create signature
    const stringToSign = `${timestamp}.${contentHash}`;
    const signature = createHmac('sha256', this.apiSecret)
      .update(stringToSign)
      .digest('hex');
    
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    };
  }

  /**
   * Verify user account exists
   * This is a placeholder for the actual implementation
   */
  async verifyUserAccount(phoneNumber: string): Promise<boolean> {
    try {
      // Placeholder implementation
      // In real implementation, this would call the Flash GraphQL API 
      // to verify if a user with this phone number exists
      
      const query = `
        query VerifyUserAccount($phoneNumber: String!) {
          verifyUserAccount(phoneNumber: $phoneNumber) {
            exists
          }
        }
      `;
      
      const variables = { phoneNumber };
      
      // Mock response for development
      // In production, use:
      // const result = await this.executeQuery<{ verifyUserAccount: { exists: boolean } }>(query, variables);
      // return result.verifyUserAccount.exists;
      
      // Mock implementation - replace with actual API call
      return true;
    } catch (error) {
      this.logger.error(`Error verifying user account: ${error.message}`, error.stack);
      throw error;
    }
  }
}