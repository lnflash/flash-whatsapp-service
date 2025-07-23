#!/usr/bin/env ts-node

/**
 * Script to cleanup corrupted Redis sessions
 * Usage: npm run cleanup:session <sessionId>
 * Example: npm run cleanup:session session:f950b1fa027a824a3e058eebbf8e90cd
 */

import { Redis } from 'ioredis';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

class SessionCleanupTool {
  private redisClient: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redisClient = new Redis(redisUrl);
  }

  async cleanup() {
    const sessionKey = process.argv[2];
    
    if (!sessionKey) {
      console.error('❌ Please provide a session key as argument');
      console.error('Usage: npm run cleanup:session <sessionKey>');
      console.error('Example: npm run cleanup:session session:f950b1fa027a824a3e058eebbf8e90cd');
      process.exit(1);
    }

    try {
      console.log(`🔍 Looking for session: ${sessionKey}`);

      // Check if the key exists
      const exists = await this.redisClient.exists(sessionKey);
      
      if (!exists) {
        console.log(`❌ Session key ${sessionKey} does not exist`);
        await this.redisClient.quit();
        return;
      }

      // Try to get the value to see if it's corrupted
      console.log(`📝 Attempting to read session...`);
      const value = await this.redisClient.get(sessionKey);
      
      if (value) {
        console.log(`✅ Session data retrieved (length: ${value.length} bytes)`);
        
        // Ask for confirmation before deletion
        console.log('\n⚠️  WARNING: You are about to delete this session.');
        console.log('This action cannot be undone.');
        console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to proceed...');
        
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Delete the session
      console.log(`🗑️  Deleting session: ${sessionKey}`);
      const deleted = await this.redisClient.del(sessionKey);

      if (deleted > 0) {
        console.log(`✅ Successfully deleted session: ${sessionKey}`);
        
        // Also check for related whatsapp mapping
        const sessionId = sessionKey.replace('session:', '');
        const pattern = `whatsapp:*`;
        const whatsappKeys = await this.redisClient.keys(pattern);
        
        console.log(`\n🔍 Checking for related WhatsApp mappings...`);
        for (const whatsappKey of whatsappKeys) {
          const mappedSessionId = await this.redisClient.get(whatsappKey);
          if (mappedSessionId === sessionId) {
            console.log(`🗑️  Deleting related mapping: ${whatsappKey}`);
            await this.redisClient.del(whatsappKey);
          }
        }
      } else {
        console.log(`❌ Failed to delete session: ${sessionKey}`);
      }

    } catch (error) {
      console.error('❌ Error during cleanup:', error.message);
    } finally {
      await this.redisClient.quit();
    }
  }

  async cleanupAllCorrupted() {
    try {
      console.log('🔍 Scanning for all corrupted sessions...');
      const pattern = 'session:*';
      const keys = await this.redisClient.keys(pattern);
      
      console.log(`Found ${keys.length} session keys to check`);
      
      const corruptedSessions: string[] = [];
      
      for (const key of keys) {
        try {
          const value = await this.redisClient.get(key);
          if (!value) continue;
          
          // Try to decrypt/parse the value
          // Since we can't decrypt without the crypto service, we'll just check if it's valid JSON
          // after attempting to parse as base64
          try {
            // Check if it looks like encrypted data (base64)
            if (value.match(/^[A-Za-z0-9+/]+=*$/)) {
              // This looks like base64, likely encrypted
              // We can't decrypt it here, but we'll skip it
              continue;
            }
            
            // Try to parse as JSON
            JSON.parse(value);
          } catch {
            // If we can't parse it, it might be corrupted
            corruptedSessions.push(key);
          }
        } catch (error) {
          console.error(`Error checking ${key}:`, error.message);
          corruptedSessions.push(key);
        }
      }
      
      if (corruptedSessions.length === 0) {
        console.log('✅ No corrupted sessions found');
        return;
      }
      
      console.log(`\n⚠️  Found ${corruptedSessions.length} potentially corrupted sessions:`);
      corruptedSessions.forEach(key => console.log(`  - ${key}`));
      
      console.log('\n⚠️  WARNING: You are about to delete all these sessions.');
      console.log('This action cannot be undone.');
      console.log('\nPress Ctrl+C to cancel, or wait 10 seconds to proceed...');
      
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      for (const key of corruptedSessions) {
        console.log(`🗑️  Deleting: ${key}`);
        await this.redisClient.del(key);
      }
      
      console.log(`\n✅ Cleanup complete. Deleted ${corruptedSessions.length} corrupted sessions.`);
      
    } catch (error) {
      console.error('❌ Error during cleanup:', error.message);
    } finally {
      await this.redisClient.quit();
    }
  }
}

// Run the cleanup
const tool = new SessionCleanupTool();

if (process.argv[2] === '--all-corrupted') {
  tool.cleanupAllCorrupted();
} else {
  tool.cleanup();
}