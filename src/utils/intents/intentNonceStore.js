/**
 * Intent nonce resolution backed by the on-chain registry.
 * We no longer keep an in-memory counter because nonces must match the diamond's state.
 */
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';

export async function getNextIntentNonce(signerAddress) {
  if (!signerAddress) {
    throw new Error('signerAddress is required to fetch intent nonce');
  }
  const contract = await getContractInstance('diamond', true);
  const nonce = await contract.nextIntentNonce(signerAddress);
  return BigInt(nonce.toString());
}

export default {
  getNextIntentNonce,
};
