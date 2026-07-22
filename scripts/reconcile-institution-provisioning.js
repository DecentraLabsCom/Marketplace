import { Contract, JsonRpcProvider } from 'ethers';
import {
  advanceProvisioningSaga,
  listProvisioningAudits,
} from '../src/utils/auth/provisioningReplayStore.js';
import {
  deriveProvisioningStage,
  isProvisioningStageAhead,
} from '../src/utils/auth/provisioningReconciliation.js';
import { emitProvisioningOperationalAlert } from '../src/utils/auth/provisioningOperationalAlert.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const REGISTRY_ABI = [
  'function resolveSchacHomeOrganization(string organization) view returns (address)',
  'function getSchacHomeOrganizationBackend(string organization) view returns (string)',
  'function isLabProvider(address provider) view returns (bool)',
];

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function normalizeBackendUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let normalized = value.trim().replace(/\/+$/, '');
  if (normalized.endsWith('/auth')) normalized = normalized.slice(0, -5);
  return normalized.toLowerCase();
}

function isNonZeroAddress(value) {
  return typeof value === 'string'
    && /^0x[0-9a-fA-F]{40}$/.test(value)
    && value.toLowerCase() !== ZERO_ADDRESS;
}

function hasConfirmedSagaStage(record) {
  return Boolean(
    record?.lastConfirmedStage
    || (record?.stage && !['FAILED', 'RECONCILIATION_REQUIRED'].includes(record.stage)),
  );
}

async function readOnChainState(record, registry) {
  const [resolvedWallet, backendOrigin, providerRegistered] = await Promise.all([
    registry.resolveSchacHomeOrganization(record.institutionId),
    registry.getSchacHomeOrganizationBackend(record.institutionId),
    record.registrationType === 'provider'
      ? registry.isLabProvider(record.walletAddress)
      : Promise.resolve(false),
  ]);

  const institutionRoleGranted = isNonZeroAddress(resolvedWallet)
    && resolvedWallet.toLowerCase() === String(record.walletAddress).toLowerCase();
  const backendRegistered = normalizeBackendUrl(backendOrigin)
    === normalizeBackendUrl(record.canonicalBackendOrigin);

  return {
    walletVerified: hasConfirmedSagaStage(record),
    providerRegistered: record.registrationType === 'provider' && Boolean(providerRegistered),
    institutionRoleGranted,
    backendRegistered,
  };
}

async function reconcileRecord(record, registry) {
  const onChainState = await readOnChainState(record, registry);
  const reconciledStage = deriveProvisioningStage({
    registrationType: record.registrationType,
    ...onChainState,
  });
  const currentStage = record.lastConfirmedStage
    || (hasConfirmedSagaStage(record) ? record.stage : 'TOKEN_ISSUED');
  const needsRepair = isProvisioningStageAhead(reconciledStage, currentStage);

  if (!needsRepair) {
    return { jti: record.jti, changed: false, stage: currentStage, reconciledStage };
  }

  await advanceProvisioningSaga(record.jti, {
    stage: reconciledStage,
    txHashes: Array.isArray(record.txHashes) ? record.txHashes : [],
    reconciliationSource: 'on-chain-read',
    reconciliationCheckedAt: new Date().toISOString(),
    reconciliationRepairedAt: new Date().toISOString(),
    errorCode: null,
    failedStage: null,
  });

  return { jti: record.jti, changed: true, stage: currentStage, reconciledStage };
}

const rpcUrl = requiredEnvironment('RPC_URL');
const registryAddress = requiredEnvironment('NEXT_PUBLIC_DIAMOND_CONTRACT_ADDRESS_SEPOLIA');
if (!/^https?:\/\//i.test(rpcUrl)) throw new Error('RPC_URL must be an HTTP(S) URL');
if (!/^0x[0-9a-fA-F]{40}$/.test(registryAddress)) {
  throw new Error('NEXT_PUBLIC_DIAMOND_CONTRACT_ADDRESS_SEPOLIA must be an address');
}

const provider = new JsonRpcProvider(rpcUrl);
const registry = new Contract(registryAddress, REGISTRY_ABI, provider);
let records;
try {
  records = await listProvisioningAudits({ limit: 100 });
} catch (error) {
  await emitProvisioningOperationalAlert({
    operation: 'reconciliation-job',
    error,
  });
  throw error;
}
const results = [];
const failures = [];

for (const record of records) {
  try {
    results.push(await reconcileRecord(record, registry));
  } catch (error) {
    await emitProvisioningOperationalAlert({
      jti: record.jti,
      operation: 'reconciliation-job',
      error,
    });
    failures.push({
      jti: record.jti,
      institutionId: record.institutionId,
      error: error?.message || 'Unknown reconciliation failure',
    });
  }
}

const summary = {
  checkedAt: new Date().toISOString(),
  checked: records.length,
  repaired: results.filter((result) => result.changed).length,
  failures,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
