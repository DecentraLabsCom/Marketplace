import { randomUUID } from 'crypto';
import { ethers, TypedDataEncoder } from 'ethers';
import { defaultChain } from '@/utils/blockchain/networkConfig';
import { contractAddresses } from '@/contracts/diamond';
import { getNextIntentNonce } from './intentNonceStore';

export const ACTION_CODES = {
  LAB_ADD: 1,
  LAB_ADD_AND_LIST: 2,
  LAB_SET_URI: 3,
  LAB_UPDATE: 4,
  LAB_DELETE: 5,
  LAB_LIST: 6,
  LAB_UNLIST: 7,
  REQUEST_BOOKING: 8,
  CANCEL_REQUEST_BOOKING: 9,
  CANCEL_BOOKING: 10,
  REQUEST_FUNDS: 11,
  CANCEL_INSTITUTIONAL_REQUEST_BOOKING: 12,
  CANCEL_INSTITUTIONAL_BOOKING: 13,
};

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

export const ACTION_PAYLOAD_TYPES = {
  ActionIntentPayload: [
    { name: 'executor', type: 'address' },
    { name: 'schacHomeOrganization', type: 'string' },
    { name: 'puc', type: 'string' },
    { name: 'assertionHash', type: 'bytes32' },
    { name: 'labId', type: 'uint256' },
    { name: 'reservationKey', type: 'bytes32' },
    { name: 'uri', type: 'string' },
    { name: 'price', type: 'uint96' },
    { name: 'maxBatch', type: 'uint96' },
    { name: 'auth', type: 'string' },
    { name: 'accessURI', type: 'string' },
    { name: 'accessKey', type: 'string' },
    { name: 'tokenURI', type: 'string' },
  ],
};

const DEFAULT_DOMAIN_NAME = 'DecentraLabsIntent';
const DEFAULT_DOMAIN_VERSION = '1';

function getDiamondAddress() {
  const chainKey = (defaultChain?.name || '').toLowerCase();
  const address = contractAddresses[chainKey];
  if (!address) {
    throw new Error(`Diamond contract address not configured for chain ${chainKey}`);
  }
  return address;
}

function toBigIntOrZero(value) {
  if (value === undefined || value === null || value === '') return 0n;
  return BigInt(value);
}

export function computeAssertionHash(assertion) {
  if (!assertion) return ethers.ZeroHash;
  return ethers.keccak256(ethers.toUtf8Bytes(assertion));
}

function normalizeActionPayload(payload) {
  return {
    executor: payload.executor,
    schacHomeOrganization: payload.schacHomeOrganization || '',
    puc: payload.puc || '',
    assertionHash: payload.assertionHash || ethers.ZeroHash,
    labId: toBigIntOrZero(payload.labId || 0),
    reservationKey: payload.reservationKey || ethers.ZeroHash,
    uri: payload.uri || '',
    price: toBigIntOrZero(payload.price || 0),
    maxBatch: toBigIntOrZero(payload.maxBatch || 0),
    auth: payload.auth || '',
    accessURI: payload.accessURI || '',
    accessKey: payload.accessKey || '',
    tokenURI: payload.tokenURI || '',
  };
}

export function hashActionPayload(payload) {
  const normalized = normalizeActionPayload(payload);
  return TypedDataEncoder.hashStruct('ActionIntentPayload', ACTION_PAYLOAD_TYPES, normalized);
}

function resolveIntentDomain(overrides = {}) {
  return {
    name: overrides.name || DEFAULT_DOMAIN_NAME,
    version: overrides.version || DEFAULT_DOMAIN_VERSION,
    chainId: overrides.chainId || defaultChain.id,
    verifyingContract: overrides.verifyingContract || getDiamondAddress(),
  };
}

/**
 * Builds the action intent package (meta + payload + typedData) without signing.
 * The gateway/back-end holding the executor wallet should sign the meta struct.
 */
export async function buildActionIntent({
  action,
  executor,
  signer,
  schacHomeOrganization,
  puc = '',
  assertionHash = ethers.ZeroHash,
  labId = 0,
  reservationKey = ethers.ZeroHash,
  uri = '',
  price = 0,
  auth = '',
  accessURI = '',
  accessKey = '',
  tokenURI = '',
  maxBatch = 0,
  expiresInSec = 15 * 60,
  domainOverrides = {},
  nonce,
  requestId,
}) {
  if (!action && action !== 0) throw new Error('action is required');
  if (!executor) throw new Error('executor is required to build action intent');
  if (!signer) throw new Error('signer is required to build action intent');
  if (!schacHomeOrganization) throw new Error('schacHomeOrganization is required');

  const nowSec = Math.floor(Date.now() / 1000);
  const resolvedRequestId = requestId || ethers.id(randomUUID());
  const resolvedNonce = nonce !== undefined ? BigInt(nonce) : await getNextIntentNonce(signer);
  const requestedAt = BigInt(nowSec);
  const expiresAt = BigInt(nowSec + expiresInSec);

  const payload = normalizeActionPayload({
    executor,
    schacHomeOrganization,
    puc,
    assertionHash,
    labId,
    reservationKey,
    uri,
    price,
    auth,
    accessURI,
    accessKey,
    tokenURI,
    maxBatch,
  });

  const payloadHash = hashActionPayload(payload);

  const meta = {
    requestId: resolvedRequestId,
    signer,
    executor,
    action,
    payloadHash,
    nonce: resolvedNonce,
    requestedAt,
    expiresAt,
  };

  const domain = resolveIntentDomain(domainOverrides);

  return {
    meta,
    payload,
    payloadHash,
    typedData: {
      domain,
      types: INTENT_META_TYPES,
      primaryType: 'IntentMeta',
    },
  };
}

export default {
  ACTION_CODES,
  ACTION_PAYLOAD_TYPES,
  INTENT_META_TYPES,
  computeAssertionHash,
  hashActionPayload,
  buildActionIntent,
};
