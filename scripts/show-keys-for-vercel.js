#!/usr/bin/env node

/**
 * Show current and backup JWT key file locations/content hints for manual Vercel rollback.
 */

import fs from 'fs';
import path from 'path';

const KEYS_DIR = path.join(process.cwd(), 'certificates', 'jwt');
const BACKUP_DIR = path.join(KEYS_DIR, 'backups');
const PRIVATE_KEY_FILE = path.join(KEYS_DIR, 'marketplace-private-key.pem');
const PUBLIC_KEY_FILE = path.join(KEYS_DIR, 'marketplace-public-key.pem');

function printFile(name, filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`${name}: missing (${filePath})`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  console.log(`\n${name}: ${filePath}`);
  console.log(content);
}

function printBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log(`\nBackups directory not found: ${BACKUP_DIR}`);
    return;
  }

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));

  if (files.length === 0) {
    console.log(`\nNo backups found in ${BACKUP_DIR}`);
    return;
  }

  console.log(`\nAvailable backups (${BACKUP_DIR}):`);
  for (const file of files) {
    console.log(`- ${file}`);
  }
}

console.log('JWT keys for manual Vercel update');
printFile('Current private key', PRIVATE_KEY_FILE);
printFile('Current public key', PUBLIC_KEY_FILE);
printBackups();
