import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import devLog from '@/utils/dev/logger'

const INTENT_STATE_NAMES = ['NONE', 'PENDING', 'EXECUTED', 'CANCELLED', 'EXPIRED']

function normalizeRequestId(value) {
  if (typeof value !== 'string') return null
  if (!ethers.isHexString(value, 32)) return null
  return value
}

function toNumber(value) {
  if (value === undefined || value === null) return null
  return Number(value)
}

export async function GET(_request, { params }) {
  try {
    const resolvedParams = typeof params?.then === 'function' ? await params : params
    const requestId = normalizeRequestId(resolvedParams?.requestId)
    if (!requestId) {
      return NextResponse.json({ error: 'Missing or invalid requestId' }, { status: 400 })
    }

    const contract = await getContractInstance('diamond', true)
    const intent = await contract.getIntent(requestId)
    const state = toNumber(intent?.state)

    return NextResponse.json({
      requestId,
      signer: intent?.signer || ethers.ZeroAddress,
      executor: intent?.executor || ethers.ZeroAddress,
      action: toNumber(intent?.action),
      payloadHash: intent?.payloadHash || ethers.ZeroHash,
      nonce: intent?.nonce?.toString?.() ?? null,
      requestedAt: intent?.requestedAt?.toString?.() ?? null,
      expiresAt: intent?.expiresAt?.toString?.() ?? null,
      state,
      stateName: INTENT_STATE_NAMES[state] || 'UNKNOWN',
    })
  } catch (error) {
    devLog.error('[API] On-chain intent status lookup failed', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch on-chain intent status' },
      { status: 502 },
    )
  }
}
