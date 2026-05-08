import { randomUUID } from 'crypto';
import { ethers, TypedDataEncoder } from 'ethers';
import { getNextIntentNonce } from './intentNonceStore';
import { INTENT_META_TYPES, resolveIntentDomain } from './intentDomain';

export { INTENT_META_TYPES };

export const ACTION_CODES = {
  REQUEST_BOOKING: 8,
  CANCEL_REQUEST_BOOKING: 9,
  DIRECT_BOOKING: 11,
};

export const RESERVATION_TYPES = {
  ReservationIntentPayload: [
    { name: 'executor', type: 'address' },
    { name: 'schacHomeOrganization', type: 'string' },
    { name: 'puc', type: 'string' },
    { name: 'assertionHash', type: 'bytes32' },
    { name: 'labId', type: 'uint256' },
    { name: 'start', type: 'uint32' },
    { name: 'end', type: 'uint32' },
    { name: 'price', type: 'uint96' },
    { name: 'reservationKey', type: 'bytes32' },
  ],
};



export function computeReservationAssertionHash(assertion) {
  if (!assertion) return ethers.ZeroHash;
  return ethers.keccak256(ethers.toUtf8Bytes(assertion));
}

function normalizeReservationPayload(payload) {
  return {
    executor: payload.executor,
    schacHomeOrganization: payload.schacHomeOrganization || '',
    puc: payload.puc || '',
    assertionHash: payload.assertionHash || ethers.ZeroHash,
    labId: BigInt(payload.labId),
    start: BigInt(payload.start),
    end: BigInt(payload.end),
    price: BigInt(payload.price || 0),
    reservationKey: payload.reservationKey || ethers.ZeroHash,
  };
}

export function hashReservationPayload(payload) {
  const normalized = normalizeReservationPayload(payload);
  return TypedDataEncoder.hashStruct('ReservationIntentPayload', RESERVATION_TYPES, normalized);
}

/**
 * Builds the intent package (meta + payload + typedData) without signing.
 * The signature is expected to be added by the backend that holds the executor wallet.
 */
export async function buildReservationIntent({
  executor,
  signer,
  schacHomeOrganization,
  puc,
  assertionHash = ethers.ZeroHash,
  labId,
  start,
  end,
  price,
  reservationKey = ethers.ZeroHash,
  action = ACTION_CODES.REQUEST_BOOKING,
  expiresInSec = 15 * 60,
  nowSec,
  domainOverrides = {},
  nonce,
  requestId,
}) {
  if (!executor) throw new Error('executor is required to build reservation intent');
  if (!signer) throw new Error('signer is required to build reservation intent');
  if (!labId && labId !== 0) throw new Error('labId is required to build reservation intent');
  if (start === undefined || end === undefined) throw new Error('start and end are required to build reservation intent');

  const resolvedNowSec =
    nowSec !== undefined && nowSec !== null
      ? Math.floor(Number(nowSec))
      : Math.floor(Date.now() / 1000);
  if (!Number.isFinite(resolvedNowSec)) {
    throw new Error('Invalid nowSec provided for reservation intent');
  }
  const resolvedRequestId = requestId || ethers.id(randomUUID());
  const resolvedNonce = nonce !== undefined ? BigInt(nonce) : await getNextIntentNonce(signer);
  const requestedAt = BigInt(resolvedNowSec);
  const expiresAt = BigInt(resolvedNowSec + expiresInSec);

  const payload = normalizeReservationPayload({
    executor,
    schacHomeOrganization,
    puc,
    assertionHash,
    labId,
    start,
    end,
    price,
    reservationKey,
  });

  const payloadHash = hashReservationPayload(payload);

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
  INTENT_META_TYPES,
  RESERVATION_TYPES,
  computeReservationAssertionHash,
  hashReservationPayload,
  buildReservationIntent,
};
