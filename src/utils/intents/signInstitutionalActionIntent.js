import { randomUUID } from 'crypto';
import { ethers, TypedDataEncoder } from 'ethers';
import { getNextIntentNonce } from './intentNonceStore';
import { INTENT_META_TYPES, resolveIntentDomain } from './intentDomain';

export { INTENT_META_TYPES };

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
};

export const ACTION_PAYLOAD_TYPES = {
  ActionIntentPayload: [
    { name: 'executor', type: 'address' },
    { name: 'schacHomeOrganization', type: 'string' },
    { name: 'pucHash', type: 'bytes32' },
    { name: 'assertionHash', type: 'bytes32' },
    { name: 'labId', type: 'uint256' },
    { name: 'reservationKey', type: 'bytes32' },
    { name: 'uri', type: 'string' },
    { name: 'price', type: 'uint96' },
    { name: 'maxBatch', type: 'uint96' },
    { name: 'accessURI', type: 'string' },
    { name: 'accessKey', type: 'string' },
    { name: 'tokenURI', type: 'string' },
    { name: 'resourceType', type: 'uint8' },
  ],
};



function toBigIntOrZero(value) {
  if (value === undefined || value === null || value === '') return 0n;
  return BigInt(value);
}

function normalizeResourceType(value) {
  if (value === 'fmu' || value === 'FMU') return 1n;
  if (value === 'lab' || value === 'LAB') return 0n;
  return toBigIntOrZero(value);
}

export function computeAssertionHash(assertion) {
  if (!assertion) return ethers.ZeroHash;
  return ethers.keccak256(ethers.toUtf8Bytes(assertion));
}

function normalizeActionPayload(payload) {
  return {
    executor: payload.executor,
    schacHomeOrganization: payload.schacHomeOrganization || '',
    pucHash: payload.PucHash || ethers.ZeroHash,
    assertionHash: payload.assertionHash || ethers.ZeroHash,
    labId: toBigIntOrZero(payload.labId || 0),
    reservationKey: payload.reservationKey || ethers.ZeroHash,
    uri: payload.uri || '',
    price: toBigIntOrZero(payload.price || 0),
    maxBatch: toBigIntOrZero(payload.maxBatch || 0),
    accessURI: payload.accessURI || '',
    accessKey: payload.accessKey || '',
    tokenURI: payload.tokenURI || '',
    resourceType: normalizeResourceType(payload.resourceType || 0),
  };
}

export function hashActionPayload(payload) {
  const normalized = normalizeActionPayload(payload);
  return TypedDataEncoder.hashStruct('ActionIntentPayload', ACTION_PAYLOAD_TYPES, normalized);
}

/**
 * Builds the action intent package (meta + payload + typedData) without signing.
 * The backend holding the executor wallet should sign the meta struct.
 */
export async function buildActionIntent({
  action,
  executor,
  signer,
  schacHomeOrganization,
  pucHash = ethers.ZeroHash,
  assertionHash = ethers.ZeroHash,
  labId = 0,
  reservationKey = ethers.ZeroHash,
  uri = '',
  price = 0,
  accessURI = '',
  accessKey = '',
  tokenURI = '',
  resourceType = 0,
  maxBatch = 0,
  expiresInSec = 15 * 60,
  nowSec,
  domainOverrides = {},
  nonce,
  requestId,
}) {
  if (!action && action !== 0) throw new Error('action is required');
  if (!executor) throw new Error('executor is required to build action intent');
  if (!signer) throw new Error('signer is required to build action intent');

  const resolvedNowSec =
    nowSec !== undefined && nowSec !== null
      ? Math.floor(Number(nowSec))
      : Math.floor(Date.now() / 1000);
  if (!Number.isFinite(resolvedNowSec)) {
    throw new Error('Invalid nowSec provided for action intent');
  }
  const resolvedRequestId = requestId || ethers.id(randomUUID());
  const resolvedNonce = nonce !== undefined ? BigInt(nonce) : await getNextIntentNonce(signer);
  const requestedAt = BigInt(resolvedNowSec);
  const expiresAt = BigInt(resolvedNowSec + expiresInSec);

  const payload = normalizeActionPayload({
    executor,
    schacHomeOrganization,
    pucHash,
    assertionHash,
    labId,
    reservationKey,
    uri,
    price,
    accessURI,
    accessKey,
    tokenURI,
    resourceType,
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
