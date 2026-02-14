#!/usr/bin/env node

/**
 * Update JWT env vars in Vercel project:
 * - JWT_PRIVATE_KEY
 * - JWT_PUBLIC_KEY
 *
 * Required env:
 * - VERCEL_TOKEN
 * - VERCEL_PROJECT_ID
 *
 * Optional env:
 * - VERCEL_TEAM_ID
 *
 * Flags:
 * - --dry-run  print planned operations without API writes
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const token = process.env.VERCEL_TOKEN;
const projectId = process.env.VERCEL_PROJECT_ID;
const teamId = process.env.VERCEL_TEAM_ID;

const baseUrl = `https://api.vercel.com`;
const targets = ['production', 'preview', 'development'];
const keysDir = path.join(process.cwd(), 'certificates', 'jwt');
const privateKeyPath = path.join(keysDir, 'marketplace-private-key.pem');
const publicKeyPath = path.join(keysDir, 'marketplace-public-key.pem');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function requireEnv() {
  if (!token) fail('VERCEL_TOKEN environment variable is required');
  if (!projectId) fail('VERCEL_PROJECT_ID environment variable is required');
}

function readPem(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} not found at ${filePath}`);
  }
  const pem = fs.readFileSync(filePath, 'utf8');
  if (!pem.includes('-----BEGIN') || !pem.includes('-----END')) {
    fail(`${label} does not look like PEM content (${filePath})`);
  }
  return pem;
}

function endpoint(pathname) {
  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
  return `${baseUrl}${pathname}${teamQuery}`;
}

async function vercelFetch(pathname, init = {}) {
  const res = await fetch(endpoint(pathname), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const payload = await res.json().catch(() => ({}));
  return { res, payload };
}

async function listExistingEnvVars() {
  const { res, payload } = await vercelFetch(`/v9/projects/${projectId}/env`);
  if (!res.ok) {
    fail(`Failed to list Vercel env vars: ${res.status} ${JSON.stringify(payload)}`);
  }
  if (Array.isArray(payload?.envs)) {
    return payload.envs;
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return [];
}

async function deleteEnvVar(envId) {
  const { res, payload } = await vercelFetch(`/v9/projects/${projectId}/env/${envId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    fail(`Failed to delete env var ${envId}: ${res.status} ${JSON.stringify(payload)}`);
  }
}

async function createEnvVar(key, value) {
  const { res, payload } = await vercelFetch(`/v10/projects/${projectId}/env`, {
    method: 'POST',
    body: JSON.stringify({
      key,
      value,
      type: 'encrypted',
      target: targets,
    }),
  });
  if (!res.ok) {
    fail(`Failed to create env var ${key}: ${res.status} ${JSON.stringify(payload)}`);
  }
}

async function main() {
  requireEnv();

  const privateKey = readPem(privateKeyPath, 'JWT private key');
  const publicKey = readPem(publicKeyPath, 'JWT public key');

  const desired = [
    { key: 'JWT_PRIVATE_KEY', value: privateKey },
    { key: 'JWT_PUBLIC_KEY', value: publicKey },
  ];

  const existing = await listExistingEnvVars();
  const existingByKey = new Map();
  for (const item of existing) {
    const key = item?.key;
    if (!key) continue;
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push(item);
  }

  for (const item of desired) {
    const current = existingByKey.get(item.key) || [];
    if (current.length === 0) {
      console.log(`No existing ${item.key} found.`);
    } else {
      console.log(`Found ${current.length} existing ${item.key} variable(s).`);
    }

    for (const envItem of current) {
      const envId = envItem?.id;
      if (!envId) continue;
      if (dryRun) {
        console.log(`[dry-run] delete ${item.key} id=${envId}`);
      } else {
        await deleteEnvVar(envId);
        console.log(`Deleted ${item.key} id=${envId}`);
      }
    }

    if (dryRun) {
      console.log(`[dry-run] create ${item.key} for targets: ${targets.join(', ')}`);
    } else {
      await createEnvVar(item.key, item.value);
      console.log(`Created ${item.key} for targets: ${targets.join(', ')}`);
    }
  }

  console.log(dryRun ? 'Dry run completed.' : 'Vercel env update completed.');
}

main().catch((error) => {
  fail(`Unexpected error: ${error.message}`);
});
