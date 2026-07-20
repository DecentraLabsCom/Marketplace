import { NextResponse } from 'next/server'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { readLabCreatorPucHash } from '@/utils/blockchain/labCreatorHash'
import { getPucHashFromSession } from '@/utils/auth/puc'
import {
  requireAuth,
  requireProviderRole,
  handleGuardError,
  HttpError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
} from '@/utils/auth/guards'
import { cleanupLabStorage, normalizeRetainedLabId } from '@/utils/storage/labRetention'
import { publicErrorResponse } from '@/utils/security/publicError'

const TRANSACTION_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/

function parseLabDeletedEvent(contract, receipt, labId) {
  for (const log of receipt?.logs || []) {
    try {
      const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data })
      if (parsed?.name !== 'LabDeleted') continue
      const eventLabId = parsed.args?.[0] ?? parsed.args?._labId
      if (BigInt(eventLabId) === BigInt(labId)) return parsed
    } catch {
      // The receipt may contain logs from other contracts/facets.
    }
  }
  return null
}

async function assertDeletionEvidence(contract, labId, txHash) {
  const receipt = await contract.runner?.getTransactionReceipt?.(txHash)
  if (!receipt || Number(receipt.status) !== 1) {
    throw new ConflictError('The lab deletion transaction is not confirmed.', 'DELETION_NOT_CONFIRMED')
  }

  const contractAddress = typeof contract.getAddress === 'function'
    ? await contract.getAddress()
    : contract.target || contract.address
  if (!contractAddress || receipt.to?.toLowerCase() !== contractAddress.toLowerCase()) {
    throw new ConflictError('The transaction does not target the configured lab contract.', 'INVALID_DELETION_TRANSACTION')
  }

  if (!parseLabDeletedEvent(contract, receipt, labId)) {
    throw new ConflictError('The transaction does not contain the expected LabDeleted event.', 'INVALID_DELETION_TRANSACTION')
  }

  return receipt
}

async function assertCleanupActor(session, contract, labId, receipt) {
  const expectedPucHash = getPucHashFromSession(session)
  if (expectedPucHash) {
    const creatorPucHash = await readLabCreatorPucHash(contract, labId)
    if (!creatorPucHash || creatorPucHash.toLowerCase() !== expectedPucHash.toLowerCase()) {
      throw new ForbiddenError('You are not the creator of this laboratory.', 'LAB_CREATOR_MISMATCH')
    }
    return
  }

  const wallet = session?.wallet?.toLowerCase()
  if (!wallet || !receipt.from || wallet !== receipt.from.toLowerCase()) {
    throw new ForbiddenError('The deletion transaction cannot be linked to this provider.', 'DELETION_ACTOR_MISMATCH')
  }
}

export async function POST(request) {
  try {
    const session = await requireAuth()
    requireProviderRole(session)

    let body
    try {
      body = await request.json()
    } catch {
      throw new BadRequestError('The cleanup request body is invalid.')
    }

    let labId
    try {
      labId = normalizeRetainedLabId(body?.labId)
    } catch {
      throw new BadRequestError('A valid non-negative lab ID is required.')
    }
    const txHash = typeof body?.txHash === 'string' ? body.txHash.trim() : ''
    if (!TRANSACTION_HASH_PATTERN.test(txHash)) {
      throw new BadRequestError('A valid deletion transaction hash is required.')
    }

    const contract = await getContractInstance()
    const receipt = await assertDeletionEvidence(contract, labId, txHash)
    await assertCleanupActor(session, contract, labId, receipt)

    const result = await cleanupLabStorage({
      labId,
      metadataUri: body?.metadataUri,
    })

    return NextResponse.json({
      labId: Number(labId),
      txHash,
      ...result,
    })
  } catch (error) {
    if (error instanceof HttpError) return handleGuardError(error, request)
    return publicErrorResponse({
      status: 502,
      code: 'LAB_STORAGE_CLEANUP_FAILED',
      message: 'The laboratory was deleted on-chain, but its Marketplace storage could not be cleaned yet.',
      error,
      context: 'provider-cleanup-lab-data',
    })
  }
}
