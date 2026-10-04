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
 * - --targets=production,preview,development  select Vercel targets
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetsArgument = args.find((arg) => arg.startsWith('--targets='));

const token = process.env.VERCEL_TOKEN;
const projectId = process.env.VERCEL_PROJECT_ID;
const teamId = process.env.VERCEL_TEAM_ID;

const baseUrl = `https://api.vercel.com`;
const validTargets = new Set(['production', 'preview', 'development']);
const targets = (targetsArgument
  ? targetsArgument.slice('--targets='.length).split(',')
  : ['production'])
  .map((target) => target.trim())
  .filter(Boolean);
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
  if (targets.length === 0 || targets.some((target) => !validTargets.has(target))) {
    fail('Invalid --targets value. Use production, preview and/or development.');
  }
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

async function patchEnvVar(envId, patch) {
  const { res, payload } = await vercelFetch(`/v9/projects/${projectId}/env/${envId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    fail(`Failed to update env var ${envId}: ${res.status} ${JSON.stringify(payload)}`);
  }
}

async function createEnvVar(key, value, targetList = targets, gitBranch) {
  const body = {
    key,
    value,
    type: 'encrypted',
    target: targetList,
  };
  if (gitBranch) body.gitBranch = gitBranch;

  const { res, payload } = await vercelFetch(`/v10/projects/${projectId}/env`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    fail(`Failed to create env var ${key}: ${res.status} ${JSON.stringify(payload)}`);
  }
}

function getTargets(envItem) {
  if (Array.isArray(envItem?.target)) return envItem.target;
  if (typeof envItem?.target === 'string') return [envItem.target];
  return [];
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

    const scopesToCreate = [];
    for (const envItem of current) {
      const envId = envItem?.id;
      if (!envId) continue;
      const currentTargets = getTargets(envItem);
      const selectedTargets = currentTargets.filter((target) => targets.includes(target));
      if (selectedTargets.length === 0) continue;

      const preservedTargets = currentTargets.filter((target) => !targets.includes(target));
      scopesToCreate.push({
        targets: selectedTargets,
        gitBranch: envItem.gitBranch,
      });

      if (preservedTargets.length > 0) {
        if (dryRun) {
          console.log(
            `[dry-run] keep ${item.key} id=${envId} for targets: ${preservedTargets.join(', ')}`,
          );
        } else {
          await patchEnvVar(envId, { target: preservedTargets });
          console.log(
            `Preserved ${item.key} id=${envId} for targets: ${preservedTargets.join(', ')}`,
          );
        }
      } else if (dryRun) {
        console.log(`[dry-run] delete ${item.key} id=${envId}`);
      } else {
        await deleteEnvVar(envId);
        console.log(`Deleted ${item.key} id=${envId}`);
      }
    }

    if (scopesToCreate.length === 0) {
      scopesToCreate.push({ targets });
    }

    for (const scope of scopesToCreate) {
      if (dryRun) {
        console.log(
          `[dry-run] create ${item.key} for targets: ${scope.targets.join(', ')}`,
        );
      } else {
        await createEnvVar(item.key, item.value, scope.targets, scope.gitBranch);
        console.log(`Created ${item.key} for targets: ${scope.targets.join(', ')}`);
      }
    }
  }

  console.log(dryRun ? 'Dry run completed.' : 'Vercel env update completed.');
}

main().catch((error) => {
  fail(`Unexpected error: ${error.message}`);
});
