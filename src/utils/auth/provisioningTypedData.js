import { getAddress, verifyTypedData } from 'ethers';
import { contractAddresses } from '@/contracts/diamond';
import { defaultChain } from '@/utils/blockchain/networkConfig';

export const PROVISIONING_REGISTRATION_TYPES = Object.freeze({
  PROVIDER: 'provider',
  CONSUMER: 'consumer',
});

export const PROVISIONING_EIP712_TYPES = Object.freeze({
  InstitutionProvisioning: [
    { name: 'institutionId', type: 'string' },
    { name: 'walletAddress', type: 'address' },
    { name: 'canonicalBackendOrigin', type: 'string' },
    { name: 'registrationType', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'registryContract', type: 'address' },
    { name: 'jti', type: 'string' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'issuedAt', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
});

const DOMAIN_NAME = 'DecentraLabsInstitutionProvisioning';
const DOMAIN_VERSION = '1';
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function requireNonBlank(value, label) {
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

export function normalizeWalletAddress(value, label = 'Wallet address') {
  const address = requireNonBlank(value, label);
  try {
    return getAddress(address);
  } catch (error) {
    throw new Error(`${label} must be a valid Ethereum address`, { cause: error });
  }
}

export function normalizeBackendOrigin(value, label = 'Canonical backend origin') {
  let candidate = requireNonBlank(value, label);
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (error) {
    throw new Error(`${label} must be a valid URL origin`, { cause: error });
  }

  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not include credentials`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${label} must not include query parameters or fragments`);
  }
  if (parsed.pathname && parsed.pathname !== '/') {
    throw new Error(`${label} must be an origin without a path`);
  }
  if (parsed.protocol !== 'https:') {
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'http:' || !localHost) {
      throw new Error(`${label} must use HTTPS`);
    }
  }

  return parsed.origin;
}

export function getProvisioningRegistryConfig() {
  const chainId = requirePositiveInteger(defaultChain?.id, 'Provisioning chain ID');
  const chainKey = (defaultChain?.name || '').toLowerCase();
  const registryContract = normalizeWalletAddress(
    contractAddresses[chainKey],
    `Registry contract for ${chainKey || 'configured chain'}`
  );
  return { chainId, registryContract };
}

export function validateProvisioningClaims(claims, {
  registrationType,
  chainId,
  registryContract,
} = {}) {
  if (!claims || typeof claims !== 'object') {
    throw new Error('Provisioning claims are required');
  }

  const normalized = {
    ...claims,
    institutionId: requireNonBlank(claims.institutionId, 'institutionId').toLowerCase(),
    walletAddress: normalizeWalletAddress(claims.walletAddress),
    canonicalBackendOrigin: normalizeBackendOrigin(claims.canonicalBackendOrigin),
    registrationType: requireNonBlank(claims.registrationType, 'registrationType'),
    chainId: requirePositiveInteger(claims.chainId, 'chainId'),
    registryContract: normalizeWalletAddress(claims.registryContract, 'registryContract'),
    jti: requireNonBlank(claims.jti, 'jti'),
    nonce: requireNonBlank(claims.nonce, 'nonce'),
    issuedAt: requirePositiveInteger(claims.issuedAt, 'issuedAt'),
    expiresAt: requirePositiveInteger(claims.expiresAt, 'expiresAt'),
  };

  if (!Object.values(PROVISIONING_REGISTRATION_TYPES).includes(normalized.registrationType)) {
    throw new Error('registrationType must be provider or consumer');
  }
  if (registrationType && normalized.registrationType !== registrationType) {
    throw new Error(`Provisioning token is not valid for ${registrationType} registration`);
  }
  if (chainId !== undefined && normalized.chainId !== Number(chainId)) {
    throw new Error('chainId does not match the Marketplace deployment');
  }
  if (
    registryContract !== undefined &&
    normalized.registryContract.toLowerCase() !==
      normalizeWalletAddress(registryContract, 'Expected registryContract').toLowerCase()
  ) {
    throw new Error('registryContract does not match the Marketplace deployment');
  }
  if (!BYTES32_PATTERN.test(normalized.nonce)) {
    throw new Error('nonce must be a 32-byte hex value');
  }
  if (normalized.expiresAt <= normalized.issuedAt) {
    throw new Error('expiresAt must be later than issuedAt');
  }
  if (claims.iat !== undefined && Number(claims.iat) !== normalized.issuedAt) {
    throw new Error('issuedAt must match JWT iat');
  }
  if (claims.exp !== undefined && Number(claims.exp) !== normalized.expiresAt) {
    throw new Error('expiresAt must match JWT exp');
  }

  return normalized;
}

export function buildProvisioningTypedData(claims) {
  const normalized = validateProvisioningClaims(claims);
  return {
    domain: {
      name: DOMAIN_NAME,
      version: DOMAIN_VERSION,
      chainId: normalized.chainId,
      verifyingContract: normalized.registryContract,
    },
    types: PROVISIONING_EIP712_TYPES,
    primaryType: 'InstitutionProvisioning',
    message: {
      institutionId: normalized.institutionId,
      walletAddress: normalized.walletAddress,
      canonicalBackendOrigin: normalized.canonicalBackendOrigin,
      registrationType: normalized.registrationType,
      chainId: normalized.chainId,
      registryContract: normalized.registryContract,
      jti: normalized.jti,
      nonce: normalized.nonce,
      issuedAt: normalized.issuedAt,
      expiresAt: normalized.expiresAt,
    },
  };
}

export function recoverProvisioningWalletAddress(claims, signature) {
  const proof = requireNonBlank(signature, 'Wallet signature');
  const typedData = buildProvisioningTypedData(claims);
  return getAddress(
    verifyTypedData(typedData.domain, typedData.types, typedData.message, proof)
  );
}
