#\!/usr/bin/env node

/**
 * Test session persistence to identify the exact issue
 */

const Redis = require("ioredis");
const crypto = require("crypto");

// Load environment
require("dotenv").config();

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
});

// Simulate the apps crypto service
class CryptoService {
  constructor() {
    this.algorithm = "aes-256-gcm";
    const keyString = process.env.ENCRYPTION_KEY || "pulse-default-encryption-key-32-chars-minimum\!\!";
    const salt = process.env.ENCRYPTION_SALT || "flash-connect-salt-default-16chr";
    this.encryptionKey = crypto.pbkdf2Sync(keyString, salt, 100000, 32, "sha256");
    this.hashSalt = process.env.HASH_SALT || "pulse-hash-salt-default-value";
  }

  hash(data) {
    return crypto
      .createHash("sha256")
      .update(data + this.hashSalt)
      .digest("hex");
  }

  encrypt(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString("base64");
  }

  decrypt(encryptedData) {
    const combined = Buffer.from(encryptedData, "base64");
    const iv = combined.slice(0, 16);
    const authTag = combined.slice(16, 32);
    const encrypted = combined.slice(32);
    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  }
}

async function testSessionPersistence() {
  console.log("=== Testing Session Persistence ===\n");
  
  const cryptoService = new CryptoService();
  const testWhatsappId = "18764250250@c.us";
  
  try {
    // 1. Check if theres a whatsapp mapping
    console.log("1. Looking for WhatsApp ID mapping...");
    const hashedId = cryptoService.hash(testWhatsappId);
    const whatsappKey = `whatsapp:${hashedId}`;
    
    console.log(`   WhatsApp ID: ${testWhatsappId}`);
    console.log(`   Hashed ID: ${hashedId}`);
    console.log(`   Redis key: ${whatsappKey}`);
    
    const sessionId = await redis.get(whatsappKey);
    if (\!sessionId) {
      console.log("   ❌ No session mapping found for this WhatsApp ID");
      console.log("\n   This means the user is NOT linked.\n");
      return;
    }
    
    console.log(`   ✓ Found session ID: ${sessionId}\n`);
    
    // 2. Try to get the session data
    console.log("2. Retrieving session data...");
    const sessionKey = `session:${sessionId}`;
    const encryptedSession = await redis.get(sessionKey);
    
    if (\!encryptedSession) {
      console.log(`   ❌ No session data found for key: ${sessionKey}`);
      console.log("   Session mapping exists but session data is missing\!\n");
      return;
    }
    
    console.log(`   ✓ Found encrypted session data (${encryptedSession.length} bytes)\n`);
    
    // 3. Try to decrypt the session
    console.log("3. Decrypting session data...");
    try {
      const decrypted = cryptoService.decrypt(encryptedSession);
      const session = JSON.parse(decrypted);
      
      console.log("   ✓ Session decrypted successfully\!");
      console.log("\n4. Session details:");
      console.log(`   Session ID: ${session.sessionId}`);
      console.log(`   WhatsApp ID: ${session.whatsappId}`);
      console.log(`   Phone: ${session.phoneNumber}`);
      console.log(`   Flash User ID: ${session.flashUserId || "NOT SET"}`);
      console.log(`   Verified: ${session.isVerified}`);
      console.log(`   Has Auth Token: ${\!\!session.flashAuthToken}`);
      console.log(`   Created: ${session.createdAt}`);
      console.log(`   Last Activity: ${session.lastActivity}`);
      
      if (\!session.flashUserId || \!session.flashAuthToken) {
        console.log("\n   ⚠️  WARNING: User linked but Flash account data is missing\!");
        console.log("   This is why the user appears unlinked after restart.");
      }
      
      // Check TTL
      const ttl = await redis.ttl(sessionKey);
      console.log(`\n5. Session TTL: ${Math.floor(ttl / 3600)} hours remaining`);
      
    } catch (error) {
      console.log("   ❌ Failed to decrypt session\!");
      console.log(`   Error: ${error.message}`);
      console.log("\n   This session was encrypted with different keys.");
      console.log("   User needs to re-link their account.");
    }
    
  } catch (error) {
    console.error("\nError during test:", error);
  } finally {
    await redis.quit();
  }
}

testSessionPersistence();
