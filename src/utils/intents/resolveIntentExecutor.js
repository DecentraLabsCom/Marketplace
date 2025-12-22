import { ethers } from 'ethers';

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

export default {
  resolveIntentExecutorAddress,
};
