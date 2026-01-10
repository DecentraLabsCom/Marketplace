import { ethers } from 'ethers';
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';

function resolveFallbackAddress() {
  const direct =
    process.env.INTENT_EXECUTOR_ADDRESS ||
    process.env.WALLET_ADDRESS ||
    process.env.INTENT_ADMIN_ADDRESS ||
    process.env.INTENT_TRUSTED_SIGNER;
  if (direct) {
    return direct;
  }

  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (privateKey) {
    try {
      return new ethers.Wallet(privateKey).address;
    } catch {
      return null;
    }
  }

  return null;
}

export function resolveIntentExecutorAddress() {
  const configured = resolveFallbackAddress();

  if (!configured) {
    throw new Error('No executor address configured (INTENT_EXECUTOR_ADDRESS or WALLET_ADDRESS/WALLET_PRIVATE_KEY)');
  }

  if (!ethers.isAddress(configured)) {
    throw new Error(`Invalid executor address configured: ${configured}`);
  }

  return configured;
}

async function resolveInstitutionBackendExecutor(schacHomeOrganization) {
  if (!schacHomeOrganization) return null;

  try {
    const contract = await getContractInstance('diamond', true);
    const orgHash = ethers.keccak256(ethers.toUtf8Bytes(schacHomeOrganization));
    const institution = await contract.getInstitutionWalletByOrganizationHash(orgHash);

    if (!institution || institution === ethers.ZeroAddress) {
      return null;
    }

    try {
      const backend = await contract.getAuthorizedBackend(institution);
      if (backend && backend !== ethers.ZeroAddress) {
        return backend;
      }
    } catch {
      // If the backend lookup fails, fall back to the institution wallet.
    }

    return institution;
  } catch {
    return null;
  }
}

export async function resolveIntentExecutorForInstitution(schacHomeOrganization) {
  const executor = await resolveInstitutionBackendExecutor(schacHomeOrganization);
  return executor || resolveIntentExecutorAddress();
}

export default {
  resolveIntentExecutorAddress,
  resolveIntentExecutorForInstitution,
};
