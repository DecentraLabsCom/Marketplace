import {
  expireIntentOnChain,
  getIntentOnChain,
} from '@/utils/intents/adminIntentSigner'
import {
  getRegisteredIntent,
  listRegisteredIntentIds,
  removeRegisteredIntent,
} from '@/utils/intents/intentLifecycleStore'

const PENDING_STATE = 0

export async function reconcileTrackedIntents({ limit = 20, nowSec = Math.floor(Date.now() / 1000) } = {}) {
  const requestIds = await listRegisteredIntentIds(limit)
  const results = []

  for (const requestId of requestIds) {
    try {
      const record = await getRegisteredIntent(requestId)
      if (!record) {
        await removeRegisteredIntent(requestId)
        results.push({ requestId, status: 'orphaned_record' })
        continue
      }

      const lifecycle = await getIntentOnChain(requestId)
      if (lifecycle.state !== PENDING_STATE && Number(record.expiresAt) > nowSec) {
        await removeRegisteredIntent(requestId)
        results.push({ requestId, status: lifecycle.stateName })
        continue
      }

      if (Number(record.expiresAt) <= nowSec) {
        const expired = await expireIntentOnChain(requestId)
        await removeRegisteredIntent(requestId)
        results.push({ requestId, status: expired.status || 'expired' })
      }
    } catch (error) {
      results.push({ requestId, status: 'reconcile_failed', error: error?.message || String(error) })
    }
  }

  return results
}

export default { reconcileTrackedIntents }
