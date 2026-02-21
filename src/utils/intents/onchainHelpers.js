import getProvider from '@/app/api/contract/utils/getProvider'
import { defaultChain } from '@/utils/blockchain/networkConfig'
import devLog from '@/utils/dev/logger'

export function extractOnchainErrorDetails(err) {
  return {
    message: err?.message || null,
    shortMessage: err?.shortMessage || null,
    reason: err?.reason || null,
    code: err?.code || null,
    errorName: err?.errorName || null,
    errorSignature: err?.errorSignature || null,
    data: err?.data || null,
    rpcMessage: err?.info?.error?.message || null,
  }
}

export async function resolveChainNowSec() {
  try {
    const provider = await getProvider(defaultChain)
    const block = await provider.getBlock('latest')
    const timestamp = Number(block?.timestamp)
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return Math.max(0, timestamp - 30)
    }
  } catch (error) {
    devLog.warn('[API] Failed to resolve chain timestamp, falling back to local time:', error?.message || error)
  }

  const fallback = Math.floor(Date.now() / 1000) - 30
  return fallback > 0 ? fallback : 0
}
