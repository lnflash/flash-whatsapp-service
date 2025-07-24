#!/usr/bin/env node

/**
 * Setup persistent encryption keys for Pulse
 * This ensures sessions survive restarts
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const envPath = path.join(__dirname, '..', '.env');
const keysPath = path.join(__dirname, '..', '.env.keys');

console.log('🔐 Pulse Persistent Encryption Key Setup\n');

// Check if keys already exist
if (fs.existsSync(keysPath)) {
  console.log('✅ Encryption keys already exist at .env.keys');
  console.log('⚠️  Using existing keys to maintain session persistence\n');
  
  // Read existing keys
  const keysContent = fs.readFileSync(keysPath, 'utf8');
  console.log('Existing keys (first 20 chars shown):');
  keysContent.split('\n').forEach(line => {
    if (line.includes('=') && !line.startsWith('#')) {
      const [key, value] = line.split('=');
      console.log(`${key}=${value.substring(0, 20)}...`);
    }
  });
} else {
  console.log('🔑 Generating new encryption keys...\n');
  
  // Generate secure random keys
  const encryptionKey = crypto.randomBytes(32).toString('hex');
  const encryptionSalt = crypto.randomBytes(16).toString('hex');
  const hashSalt = crypto.randomBytes(16).toString('hex');
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const sessionSecret = crypto.randomBytes(32).toString('hex');
  const webhookSecret = crypto.randomBytes(32).toString('hex');

  // Create the keys configuration
  const keysConfig = `# ============================================
# PULSE ENCRYPTION KEYS - DO NOT DELETE OR REGENERATE
# Generated on: ${new Date().toISOString()}
# ============================================
# These keys are critical for session persistence.
# Deleting or changing them will invalidate all sessions!
# ============================================

# Encryption Keys (64 hex chars = 32 bytes)
ENCRYPTION_KEY=${encryptionKey}
ENCRYPTION_SALT=${encryptionSalt}
HASH_SALT=${hashSalt}

# JWT Configuration
JWT_SECRET=${jwtSecret}

# Session Configuration
SESSION_SECRET=${sessionSecret}

# Webhook Security
WEBHOOK_SECRET=${webhookSecret}
`;

  // Save keys file
  fs.writeFileSync(keysPath, keysConfig);
  console.log('✅ Keys generated and saved to .env.keys\n');
}

// Check if .env.keys is in .gitignore
const gitignorePath = path.join(__dirname, '..', '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  if (!gitignoreContent.includes('.env.keys')) {
    fs.appendFileSync(gitignorePath, '\n# Encryption keys file\n.env.keys\n');
    console.log('✅ Added .env.keys to .gitignore\n');
  }
}

// Now update the .env file
console.log('📝 Updating .env file with persistent keys...\n');

if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found!');
  console.log('Please create .env from .env.example first');
  process.exit(1);
}

// Read current .env
let envContent = fs.readFileSync(envPath, 'utf8');

// Read keys from .env.keys
const keysContent = fs.readFileSync(keysPath, 'utf8');
const keyValues = {};

keysContent.split('\n').forEach(line => {
  if (line.includes('=') && !line.startsWith('#')) {
    const [key, value] = line.split('=');
    keyValues[key.trim()] = value.trim();
  }
});

// Update each key in .env
Object.entries(keyValues).forEach(([key, value]) => {
  const regex = new RegExp(`^${key}=.*$`, 'gm');
  if (envContent.match(regex)) {
    envContent = envContent.replace(regex, `${key}=${value}`);
    console.log(`✅ Updated ${key}`);
  } else {
    // Key doesn't exist, add it
    envContent += `\n${key}=${value}`;
    console.log(`✅ Added ${key}`);
  }
});

// Write updated .env
fs.writeFileSync(envPath, envContent);

console.log('\n✅ Setup complete!');
console.log('\n⚠️  IMPORTANT NOTES:');
console.log('1. Your .env file has been updated with persistent keys');
console.log('2. The keys are also backed up in .env.keys');
console.log('3. NEVER delete .env.keys - it ensures session persistence');
console.log('4. Back up .env.keys securely!');
console.log('\n🚀 You can now restart Pulse and sessions will persist!');