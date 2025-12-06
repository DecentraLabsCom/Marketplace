import { ethers } from 'ethers'
import { contractAddresses } from '@/contracts/diamond'
import { defaultChain } from '@/utils/blockchain/networkConfig'
import getProvider from '@/app/api/contract/utils/getProvider'

const INTENT_REGISTRY_ABI = [
  'function registerActionIntent((bytes32,address,address,uint8,bytes32,uint256,uint64,uint64) meta,(address executor,string schacHomeOrganization,string puc,bytes32 assertionHash,uint256 labId,bytes32 reservationKey,string uri,uint96 price,string auth,string accessURI,string accessKey,string tokenURI,uint256 maxBatch) payload,bytes signature)',
  'function registerReservationIntent((bytes32,address,address,uint8,bytes32,uint256,uint64,uint64) meta,(address executor,string schacHomeOrganization,string puc,bytes32 assertionHash,uint256 labId,uint32 start,uint32 end,uint96 price,bytes32 reservationKey) payload,bytes signature)',
]

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
  const contract = getIntentContract(wallet)

  const normalizedMeta = {
    requestId: meta.requestId,
    signer: meta.signer,
    executor: meta.executor,
    action: Number(meta.action),
    payloadHash: meta.payloadHash,
    nonce: toBigInt(meta.nonce),
    requestedAt: toBigInt(meta.requestedAt),
    expiresAt: toBigInt(meta.expiresAt),
  }

  if (kind === 'reservation') {
    const normalizedPayload = {
      executor: payload.executor,
      schacHomeOrganization: payload.schacHomeOrganization || '',
      puc: payload.puc || '',
      assertionHash: payload.assertionHash,
      labId: toBigInt(payload.labId),
      start: toBigInt(payload.start),
      end: toBigInt(payload.end),
      price: toBigInt(payload.price || 0),
      reservationKey: payload.reservationKey,
    }
    const tx = await contract.registerReservationIntent(normalizedMeta, normalizedPayload, signature)
    const receipt = await tx.wait?.()
    return { txHash: tx.hash, blockNumber: receipt?.blockNumber }
  }

  if (kind === 'action') {
    const normalizedPayload = {
      executor: payload.executor,
      schacHomeOrganization: payload.schacHomeOrganization || '',
      puc: payload.puc || '',
      assertionHash: payload.assertionHash,
      labId: toBigInt(payload.labId || 0),
      reservationKey: payload.reservationKey || ethers.ZeroHash,
    uri: payload.uri || '',
    price: toBigInt(payload.price || 0),
    auth: payload.auth || '',
    accessURI: payload.accessURI || '',
    accessKey: payload.accessKey || '',
    tokenURI: payload.tokenURI || '',
    maxBatch: toBigInt(payload.maxBatch || 0),
  }
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
