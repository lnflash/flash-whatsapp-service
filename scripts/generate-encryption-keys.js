#!/usr/bin/env node

const crypto = require('crypto');

console.log('=== Pulse Encryption Key Generator ===\n');

// Generate secure random keys
const encryptionKey = crypto.randomBytes(32).toString('hex');
const encryptionSalt = crypto.randomBytes(16).toString('hex');
const hashSalt = crypto.randomBytes(16).toString('hex');
const jwtSecret = crypto.randomBytes(32).toString('hex');
const sessionSecret = crypto.randomBytes(32).toString('hex');
const webhookSecret = crypto.randomBytes(32).toString('hex');

console.log('Add these to your .env file:\n');
console.log(`# Security Configuration (Generated on ${new Date().toISOString()})`);
console.log(`ENCRYPTION_KEY=${encryptionKey}`);
console.log(`ENCRYPTION_SALT=${encryptionSalt}`);
console.log(`HASH_SALT=${hashSalt}`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`SESSION_SECRET=${sessionSecret}`);
console.log(`WEBHOOK_SECRET=${webhookSecret}`);
console.log('\n⚠️  IMPORTANT: Keep these keys secure and never commit them to version control!');
console.log('💡 TIP: Back up these keys - if you lose them, you won\'t be able to decrypt existing sessions.');