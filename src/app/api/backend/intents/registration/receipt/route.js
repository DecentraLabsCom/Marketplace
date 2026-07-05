import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import getProvider from '@/app/api/contract/utils/getProvider'
import { defaultChain } from '@/utils/blockchain/networkConfig'
import devLog from '@/utils/dev/logger'

export async function GET(request) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const txHash = searchParams.get('txHash')

    if (!txHash || !ethers.isHexString(txHash, 32)) {
      return NextResponse.json({ error: 'Invalid txHash' }, { status: 400 })
    }

    const provider = await getProvider(defaultChain)
    const receipt = await provider.getTransactionReceipt(txHash)
    if (!receipt) {
      return NextResponse.json({ status: 'pending', txHash })
    }

    return NextResponse.json({
      status: receipt.status === 1 ? 'mined' : 'failed',
      txHash,
      blockNumber: receipt.blockNumber ?? null,
      receiptStatus: receipt.status ?? null,
    })
  } catch (error) {
    devLog.error('[API] Intent registration receipt lookup failed', error)
    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error)
    }
    return NextResponse.json(
      { error: error.message || 'Failed to check registration receipt' },
      { status: 500 },
    )
  }
}
