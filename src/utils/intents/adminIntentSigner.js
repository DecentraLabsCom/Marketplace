import { ethers } from 'ethers'
import { contractAddresses } from '@/contracts/diamond'
import { defaultChain } from '@/utils/blockchain/networkConfig'
import getProvider from '@/app/api/contract/utils/getProvider'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { INTENT_META_TYPES, hashActionPayload } from '@/utils/intents/signInstitutionalActionIntent'
import { hashReservationPayload } from '@/utils/intents/signInstitutionalReservationIntent'

const INTENT_REGISTRY_ABI = [
  'function registerActionIntent((bytes32,address,address,uint8,bytes32,uint256,uint64,uint64) meta,(address executor,string schacHomeOrganization,string puc,bytes32 assertionHash,uint256 labId,bytes32 reservationKey,string uri,uint96 price,uint96 maxBatch,string accessURI,string accessKey,string tokenURI) payload,bytes signature)',
  'function registerReservationIntent((bytes32,address,address,uint8,bytes32,uint256,uint64,uint64) meta,(address executor,string schacHomeOrganization,string puc,bytes32 assertionHash,uint256 labId,uint32 start,uint32 end,uint96 price,bytes32 reservationKey) payload,bytes signature)',
]

const ACTION_ALLOWED = new Set([1, 2, 3, 4, 5, 6, 7, 10, 11])
const RESERVATION_ALLOWED = new Set([8, 9])

function toBigInt(value) {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(value)
  if (typeof value === 'string') {
    try {
      return value.startsWith('0x') ? BigInt(value) : BigInt(value)
    } catch {
      return 0n
    }
  }
  return 0n
}

function normalizeMeta(meta) {
  return {
    requestId: meta?.requestId,
    signer: meta?.signer,
    executor: meta?.executor,
    action: Number(meta?.action),
    payloadHash: meta?.payloadHash,
    nonce: toBigInt(meta?.nonce),
    requestedAt: toBigInt(meta?.requestedAt),
    expiresAt: toBigInt(meta?.expiresAt),
  }
}

function resolveIntentDomain() {
  const chainKey = (defaultChain?.name || '').toLowerCase()
  const verifyingContract = contractAddresses[chainKey]
  if (!verifyingContract) {
    throw new Error(`Diamond contract address not configured for ${chainKey}`)
  }
  return {
    name: 'DecentraLabsIntent',
    version: '1',
    chainId: defaultChain.id,
    verifyingContract,
  }
}

async function preflightIntentRegistration(kind, meta, payload, signature, walletAddress) {
  const errors = []
  const normalized = normalizeMeta(meta)

  if (!normalized.requestId || normalized.requestId === ethers.ZeroHash) {
    errors.push('requestId is required')
  }
  if (!ethers.isAddress(normalized.signer) || normalized.signer === ethers.ZeroAddress) {
    errors.push('signer must be a valid non-zero address')
  }
  if (!ethers.isAddress(normalized.executor) || normalized.executor === ethers.ZeroAddress) {
    errors.push('executor must be a valid non-zero address')
  }
  if (walletAddress && normalized.signer && walletAddress.toLowerCase() !== normalized.signer.toLowerCase()) {
    errors.push(`meta.signer (${normalized.signer}) must match wallet address (${walletAddress})`)
  }

  if (Number.isNaN(normalized.action)) {
    errors.push('action must be a valid number')
  } else if (kind === 'reservation') {
    if (!RESERVATION_ALLOWED.has(normalized.action)) {
      errors.push(`reservation action ${normalized.action} not allowed`)
    }
  } else if (!ACTION_ALLOWED.has(normalized.action)) {
    errors.push(`action ${normalized.action} not allowed`)
  }

  const calculatedPayloadHash =
    kind === 'reservation'
      ? hashReservationPayload(payload || {})
      : hashActionPayload(payload || {})

  if (
    normalized.payloadHash &&
    calculatedPayloadHash &&
    normalized.payloadHash.toLowerCase() !== calculatedPayloadHash.toLowerCase()
  ) {
    errors.push('payloadHash mismatch')
  }

  try {
    const contract = await getContractInstance('diamond', true)
    const chainNonce = await contract.nextIntentNonce(normalized.signer)
    if (normalized.nonce !== toBigInt(chainNonce)) {
      errors.push(`nonce mismatch (chain=${chainNonce.toString()}, meta=${normalized.nonce.toString()})`)
    }

    const intent = await contract.getIntent(normalized.requestId)
    const state = Number(intent?.state ?? 0)
    if (state !== 0) {
      errors.push(`intent already exists (state=${state})`)
    }

    const adminRole = await contract.DEFAULT_ADMIN_ROLE()
    const isAdmin = await contract.hasRole(adminRole, walletAddress)
    if (!isAdmin) {
      errors.push(`wallet ${walletAddress} missing DEFAULT_ADMIN_ROLE`)
    }

    const block = await contract.provider.getBlock('latest')
    const now = toBigInt(block?.timestamp || 0)
    if (normalized.requestedAt === 0n) {
      errors.push('requestedAt is required')
    } else if (normalized.requestedAt > now) {
      errors.push(`requestedAt (${normalized.requestedAt}) is in the future (chain=${now})`)
    }
    if (normalized.expiresAt <= now) {
      errors.push(`expiresAt (${normalized.expiresAt}) is not in the future (chain=${now})`)
    }
  } catch (err) {
    errors.push(`preflight rpc error: ${err?.message || String(err)}`)
  }

  try {
    const domain = resolveIntentDomain()
    const recovered = ethers.verifyTypedData(domain, INTENT_META_TYPES, normalized, signature)
    if (recovered.toLowerCase() !== normalized.signer?.toLowerCase()) {
      errors.push(`signature mismatch (recovered=${recovered})`)
    }
  } catch (err) {
    errors.push(`signature verification failed: ${err?.message || String(err)}`)
  }

  return {
    ok: errors.length === 0,
    errors,
    calculatedPayloadHash,
  }
}

export async function getAdminWallet() {
  const privateKey = process.env.WALLET_PRIVATE_KEY
  if (!privateKey) {
    throw new Error('WALLET_PRIVATE_KEY is required for intent signing')
  }
  const provider = await getProvider(defaultChain)
  return new ethers.Wallet(privateKey, provider)
}

export async function getAdminAddress() {
  const explicit =
    process.env.WALLET_ADDRESS ||
    process.env.INTENT_ADMIN_ADDRESS ||
    process.env.INTENT_TRUSTED_SIGNER
  if (explicit) return explicit
  const wallet = await getAdminWallet()
  return wallet.address
}

export async function signIntentMeta(meta, typedData) {
  const wallet = await getAdminWallet()
  const normalizedMeta = {
    ...meta,
    nonce: toBigInt(meta?.nonce),
    requestedAt: toBigInt(meta?.requestedAt),
    expiresAt: toBigInt(meta?.expiresAt),
  }
  return wallet.signTypedData(typedData.domain, typedData.types, normalizedMeta)
}

function getIntentContract(wallet) {
  const chainKey = (defaultChain?.name || '').toLowerCase()
  const address = contractAddresses[chainKey]
  if (!address) {
    throw new Error(`Diamond contract address not configured for ${chainKey}`)
  }
  return new ethers.Contract(address, INTENT_REGISTRY_ABI, wallet)
}

export async function registerIntentOnChain(kind, meta, payload, signature) {
  const wallet = await getAdminWallet()
  const preflight = await preflightIntentRegistration(kind, meta, payload, signature, wallet.address)
  if (!preflight.ok) {
    const error = new Error(`Intent preflight failed: ${preflight.errors.join('; ')}`)
    error.preflight = preflight
    throw error
  }
  const contract = getIntentContract(wallet)

  const normalizedMeta = [
    meta.requestId,
    meta.signer,
    meta.executor,
    Number(meta.action),
    meta.payloadHash,
    toBigInt(meta.nonce),
    toBigInt(meta.requestedAt),
    toBigInt(meta.expiresAt),
  ]

  if (kind === 'reservation') {
    const normalizedPayload = [
      payload.executor,
      payload.schacHomeOrganization || '',
      payload.puc || '',
      payload.assertionHash,
      toBigInt(payload.labId),
      toBigInt(payload.start),
      toBigInt(payload.end),
      toBigInt(payload.price || 0),
      payload.reservationKey,
    ]
    const tx = await contract.registerReservationIntent(normalizedMeta, normalizedPayload, signature)
    const receipt = await tx.wait?.()
    return { txHash: tx.hash, blockNumber: receipt?.blockNumber }
  }

  if (kind === 'action') {
    const normalizedPayload = [
      payload.executor,
      payload.schacHomeOrganization || '',
      payload.puc || '',
      payload.assertionHash,
      toBigInt(payload.labId || 0),
      payload.reservationKey || ethers.ZeroHash,
      payload.uri || '',
      toBigInt(payload.price || 0),
      toBigInt(payload.maxBatch || 0),
      payload.accessURI || '',
      payload.accessKey || '',
      payload.tokenURI || '',
    ]
    const tx = await contract.registerActionIntent(normalizedMeta, normalizedPayload, signature)
    const receipt = await tx.wait?.()
    return { txHash: tx.hash, blockNumber: receipt?.blockNumber }
  }

  throw new Error(`Unsupported intent kind "${kind}" for on-chain registration`)
}

export default {
  getAdminWallet,
  getAdminAddress,
  signIntentMeta,
  registerIntentOnChain,
}
