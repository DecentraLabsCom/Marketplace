#!/usr/bin/env node

/**
 * Generate JWT RSA key pair for Marketplace signing/verification.
 *
 * Outputs:
 * - certificates/jwt/marketplace-private-key.pem
 * - certificates/jwt/marketplace-public-key.pem
 *
 * Flags:
 * - --force   overwrite existing keys
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const KEYS_DIR = path.join(process.cwd(), 'certificates', 'jwt');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'marketplace-private-key.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'marketplace-public-key.pem');

const args = process.argv.slice(2);
const force = args.includes('--force');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function assertCanWrite(filePath) {
  if (!force && fs.existsSync(filePath)) {
    throw new Error(`File already exists: ${filePath}. Use --force to overwrite.`);
  }
}

function writeFile(pathname, value, mode) {
  fs.writeFileSync(pathname, value, { encoding: 'utf8', mode });
}

function main() {
  ensureDir(KEYS_DIR);
  assertCanWrite(PRIVATE_KEY_PATH);
  assertCanWrite(PUBLIC_KEY_PATH);

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  writeFile(PRIVATE_KEY_PATH, privateKey, 0o600);
  writeFile(PUBLIC_KEY_PATH, publicKey, 0o644);

  console.log('JWT key pair generated:');
  console.log(`- Private: ${PRIVATE_KEY_PATH}`);
  console.log(`- Public : ${PUBLIC_KEY_PATH}`);
}

try {
  main();
} catch (error) {
  console.error(`Failed to generate JWT keys: ${error.message}`);
  process.exit(1);
}
