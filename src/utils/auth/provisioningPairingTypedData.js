import { getAddress, verifyTypedData } from 'ethers';
import {
  getProvisioningRegistryConfig,
  normalizeBackendOrigin,
  normalizeWalletAddress,
} from './provisioningTypedData';

export const PROVISIONING_PAIRING_EIP712_TYPES = Object.freeze({
  InstitutionProvisioningPairing: [
    { name: 'institutionId', type: 'string' },
    { name: 'walletAddress', type: 'address' },
    { name: 'canonicalBackendOrigin', type: 'string' },
    { name: 'registrationType', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'registryContract', type: 'address' },
    { name: 'challenge', type: 'bytes32' },
    { name: 'issuedAt', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
});

const DOMAIN_NAME = 'DecentraLabsInstitutionPairing';
const DOMAIN_VERSION = '1';
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const REGISTRATION_TYPES = new Set(['provider', 'consumer']);

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return number;
}

export function validateProvisioningPairingClaims(claims, expected = {}) {
  if (!claims || typeof claims !== 'object') {
    throw new Error('Provisioning pairing claims are required');
  }

  const normalized = {
    institutionId: requireText(claims.institutionId, 'institutionId').toLowerCase(),
    walletAddress: normalizeWalletAddress(claims.walletAddress),
    canonicalBackendOrigin: normalizeBackendOrigin(claims.canonicalBackendOrigin),
    registrationType: requireText(claims.registrationType, 'registrationType'),
    chainId: requirePositiveInteger(claims.chainId, 'chainId'),
    registryContract: normalizeWalletAddress(claims.registryContract, 'registryContract'),
    challenge: requireText(claims.challenge, 'challenge'),
    issuedAt: requirePositiveInteger(claims.issuedAt, 'issuedAt'),
    expiresAt: requirePositiveInteger(claims.expiresAt, 'expiresAt'),
  };

  if (!REGISTRATION_TYPES.has(normalized.registrationType)) {
    throw new Error('registrationType must be provider or consumer');
  }
  if (!BYTES32_PATTERN.test(normalized.challenge)) {
    throw new Error('challenge must be a 32-byte hex value');
  }
  if (normalized.expiresAt <= normalized.issuedAt) {
    throw new Error('expiresAt must be later than issuedAt');
  }
  if (expected.registrationType && normalized.registrationType !== expected.registrationType) {
    throw new Error('Pairing registration type does not match the request');
  }
  if (expected.chainId !== undefined && normalized.chainId !== Number(expected.chainId)) {
    throw new Error('Pairing chainId does not match the Marketplace deployment');
  }
  if (
    expected.registryContract !== undefined &&
    normalized.registryContract.toLowerCase() !== normalizeWalletAddress(
      expected.registryContract,
      'Expected registryContract',
    ).toLowerCase()
  ) {
    throw new Error('Pairing registryContract does not match the Marketplace deployment');
  }
  if (expected.challenge && normalized.challenge.toLowerCase() !== expected.challenge.toLowerCase()) {
    throw new Error('Pairing challenge does not match the pending request');
  }

  return normalized;
}

export function buildProvisioningPairingTypedData(claims) {
  const normalized = validateProvisioningPairingClaims(claims);
  return {
    domain: {
      name: DOMAIN_NAME,
      version: DOMAIN_VERSION,
      chainId: normalized.chainId,
      verifyingContract: normalized.registryContract,
    },
    types: PROVISIONING_PAIRING_EIP712_TYPES,
    primaryType: 'InstitutionProvisioningPairing',
    message: normalized,
  };
}

export function recoverProvisioningPairingWalletAddress(claims, signature) {
  const proof = requireText(signature, 'Pairing wallet signature');
  const typedData = buildProvisioningPairingTypedData(claims);
  return getAddress(
    verifyTypedData(typedData.domain, typedData.types, typedData.message, proof),
  );
}

export function getPairingRegistryConfig() {
  return getProvisioningRegistryConfig();
}
