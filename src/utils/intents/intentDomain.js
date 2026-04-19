import { defaultChain } from '@/utils/blockchain/networkConfig';
import { contractAddresses } from '@/contracts/diamond';

export const INTENT_META_TYPES = {
  IntentMeta: [
    { name: 'requestId', type: 'bytes32' },
    { name: 'signer', type: 'address' },
    { name: 'executor', type: 'address' },
    { name: 'action', type: 'uint8' },
    { name: 'payloadHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'requestedAt', type: 'uint64' },
    { name: 'expiresAt', type: 'uint64' },
  ],
};

const DEFAULT_DOMAIN_NAME = 'DecentraLabsIntent';
const DEFAULT_DOMAIN_VERSION = '1';

export function getDiamondAddress() {
  const chainKey = (defaultChain?.name || '').toLowerCase();
  const address = contractAddresses[chainKey];
  if (!address) {
    throw new Error(`Diamond contract address not configured for chain ${chainKey}`);
  }
  return address;
}

export function resolveIntentDomain(overrides = {}) {
  return {
    name: overrides.name || DEFAULT_DOMAIN_NAME,
    version: overrides.version || DEFAULT_DOMAIN_VERSION,
    chainId: overrides.chainId || defaultChain.id,
    verifyingContract: overrides.verifyingContract || getDiamondAddress(),
  };
}
