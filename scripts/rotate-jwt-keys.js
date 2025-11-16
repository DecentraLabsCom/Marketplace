#!/usr/bin/env node

/**
 * JWT Key Rotation Script
 * 
 * Rotates JWT RSA key pairs with backup and validation
 * Usage: npm run rotate-jwt-keys [--force] [--backup-suffix=YYYY-MM-DD]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Configuration
const KEYS_DIR = path.join(process.cwd(), 'certificates', 'jwt');
const PRIVATE_KEY_FILE = 'marketplace-private-key.pem';
const PUBLIC_KEY_FILE = 'marketplace-public-key.pem';
const BACKUP_DIR = path.join(KEYS_DIR, 'backups');
const WELL_KNOWN_DIR = path.join(process.cwd(), 'public', '.well-known');
const WELL_KNOWN_PUBLIC_KEY = path.join(WELL_KNOWN_DIR, 'public-key.pem');

// Command line arguments
const args = process.argv.slice(2);
const forceRotation = args.includes('--force');
const backupSuffix = args.find(arg => arg.startsWith('--backup-suffix='))?.split('=')[1] || 
                    new Date().toISOString().split('T')[0]; // YYYY-MM-DD

console.log('🔄 JWT Key Rotation Process Starting...');
console.log('📅 Backup suffix:', backupSuffix);

/**
 * Check if current keys exist and are valid
 */
function validateCurrentKeys() {
  const privateKeyPath = path.join(KEYS_DIR, PRIVATE_KEY_FILE);
  const publicKeyPath = path.join(KEYS_DIR, PUBLIC_KEY_FILE);
  
  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    console.log('⚠️  Current keys not found - will generate new ones');
    return false;
  }
  
  try {
    // Test that keys are valid RSA keys
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    
    // Try to create a test signature
    const testData = 'key-validation-test';
    const sign = crypto.createSign('SHA256');
    sign.update(testData);
    const signature = sign.sign(privateKey, 'base64');
    
    // Verify with public key
    const verify = crypto.createVerify('SHA256');
    verify.update(testData);
    const isValid = verify.verify(publicKey, signature, 'base64');
    
    if (isValid) {
      console.log('✅ Current keys are valid');
      return true;
    } else {
      console.log('❌ Current keys failed validation');
      return false;
    }
  } catch (error) {
    console.log('❌ Error validating current keys:', error.message);
    return false;
  }
}

/**
 * Create backup of current keys
 */
function backupCurrentKeys() {
  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  
  const privateKeyPath = path.join(KEYS_DIR, PRIVATE_KEY_FILE);
  const publicKeyPath = path.join(KEYS_DIR, PUBLIC_KEY_FILE);
  
  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    const backupPrivatePath = path.join(BACKUP_DIR, `${PRIVATE_KEY_FILE}.${backupSuffix}`);
    const backupPublicPath = path.join(BACKUP_DIR, `${PUBLIC_KEY_FILE}.${backupSuffix}`);
    
    fs.copyFileSync(privateKeyPath, backupPrivatePath);
    fs.copyFileSync(publicKeyPath, backupPublicPath);
    
    console.log('💾 Keys backed up to:', BACKUP_DIR);
    console.log('   Private:', `${PRIVATE_KEY_FILE}.${backupSuffix}`);
    console.log('   Public:', `${PUBLIC_KEY_FILE}.${backupSuffix}`);
    return true;
  }
  
  console.log('⚠️  No current keys to backup');
  return false;
}

/**
 * Generate new RSA key pair
 */
function generateNewKeys() {
  console.log('🔑 Generating new RSA key pair...');
  
  try {
    // Generate new key pair using the existing script
    execSync('node scripts/generate-jwt-keys.js', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    console.log('✅ New keys generated successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to generate new keys:', error.message);
    return false;
  }
}

/**
 * Validate new keys
 */
function validateNewKeys() {
  console.log('🔍 Validating new keys...');
  return validateCurrentKeys();
}

/**
 * Copy public key to public/.well-known for static serving
 */
function syncPublicKeyToWellKnown() {
  console.log('🌐 Syncing public key to public/.well-known/public-key.pem...');

  try {
    const sourcePath = path.join(KEYS_DIR, PUBLIC_KEY_FILE);

    if (!fs.existsSync(sourcePath)) {
      throw new Error('Public key not found at ' + sourcePath);
    }

    if (!fs.existsSync(WELL_KNOWN_DIR)) {
      fs.mkdirSync(WELL_KNOWN_DIR, { recursive: true });
      console.log('📁 Created directory: ' + WELL_KNOWN_DIR);
    }

    fs.copyFileSync(sourcePath, WELL_KNOWN_PUBLIC_KEY);
    console.log('✅ Public key copied to ' + WELL_KNOWN_PUBLIC_KEY);
    return true;
  } catch (error) {
    console.error('❌ Failed to sync public key to /.well-known:', error.message);
    return false;
  }
}
/**
 * Update rotation metadata
 */
function updateRotationMetadata() {
  const metadataPath = path.join(KEYS_DIR, 'rotation-metadata.json');
  const metadata = {
    lastRotation: new Date().toISOString(),
    backupSuffix: backupSuffix,
    rotationCount: 1,
    nextScheduledRotation: new Date(Date.now() + (90 * 24 * 60 * 60 * 1000)).toISOString() // +90 days
  };
  
  // If metadata exists, increment rotation count
  if (fs.existsSync(metadataPath)) {
    try {
      const existingMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      metadata.rotationCount = (existingMetadata.rotationCount || 0) + 1;
    } catch (error) {
      console.log('⚠️  Could not read existing metadata, starting fresh');
    }
  }
  
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log('📊 Rotation metadata updated');
  console.log('   Count:', metadata.rotationCount);
  console.log('   Next scheduled:', metadata.nextScheduledRotation.split('T')[0]);
}

/**
 * Main rotation process
 */
async function rotateKeys() {
  console.log('🚀 Starting JWT key rotation process...\n');
  
  // Step 1: Validate current keys (unless forced)
  if (!forceRotation) {
    const currentKeysValid = validateCurrentKeys();
    if (!currentKeysValid) {
      console.log('⚠️  Current keys invalid, proceeding with rotation...');
    } else {
      console.log('✅ Current keys are valid');
      
      // Check if rotation is needed based on metadata
      const metadataPath = path.join(KEYS_DIR, 'rotation-metadata.json');
      if (fs.existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          const lastRotation = new Date(metadata.lastRotation);
          const daysSinceRotation = (Date.now() - lastRotation.getTime()) / (1000 * 60 * 60 * 24);
          
          if (daysSinceRotation < 30) { // Less than 30 days
            console.log(`⏰ Last rotation was ${Math.floor(daysSinceRotation)} days ago`);
            console.log('❓ Use --force flag to rotate anyway');
            process.exit(0);
          }
        } catch (error) {
          console.log('⚠️  Could not read rotation metadata');
        }
      }
    }
  }
  
  console.log('\n📋 Rotation Plan:');
  console.log('1. ✅ Backup current keys');
  console.log('2. ✅ Generate new RSA key pair');
  console.log('3. ✅ Validate new keys');  
  console.log('4. 🌐 Sync public key to /.well-known/public-key.pem');
  console.log('5. ✅ Update rotation metadata');
  console.log('6. 🔄 Deploy marketplace (manual)');
  console.log('7. ⏱️  Auth-services auto-fetch new public key (1h cache)\n');
  
  // Step 2: Backup current keys
  backupCurrentKeys();
  
  // Step 3: Generate new keys
  const newKeysGenerated = generateNewKeys();
  if (!newKeysGenerated) {
    console.error('❌ Key rotation failed - could not generate new keys');
    process.exit(1);
  }
  
  // Step 4: Validate new keys
  const newKeysValid = validateNewKeys();
  if (!newKeysValid) {
    console.error('❌ Key rotation failed - new keys are invalid');
    process.exit(1);
  }
  
  // Step 5: Sync public key to .well-known
  const publicKeySynced = syncPublicKeyToWellKnown();
  if (!publicKeySynced) {
    console.error('❌ Key rotation failed - could not sync public key to /.well-known');
    process.exit(1);
  }
  
  // Step 6: Update metadata
  updateRotationMetadata();
  
  console.log('\n🎉 JWT Key Rotation Completed Successfully!');
  console.log('\n📋 Next Steps:');
  console.log('1. 🚀 Deploy marketplace to update JWT signing');
  console.log('2. ⏱️  Wait for auth-services to fetch new public key (up to 1 hour)');
  console.log('3. 🧪 Test authentication flow');
  console.log('4. 📊 Monitor logs for any JWT validation errors');
  
  console.log('\n🔍 Verification Commands:');
  console.log('• Test public key endpoint: curl http://localhost:3000/.well-known/public-key.pem');
  console.log('• Test JWT generation: curl -X POST http://localhost:3000/api/auth/test-jwt');
}

// Run the rotation process
rotateKeys().catch(error => {
  console.error('💥 Key rotation failed:', error);
  process.exit(1);
});
