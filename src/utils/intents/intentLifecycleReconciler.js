import {
  expireIntentOnChain,
  getIntentOnChain,
} from '@/utils/intents/adminIntentSigner'
import {
  getRegisteredIntent,
  listRegisteredIntentIds,
  removeRegisteredIntent,
} from '@/utils/intents/intentLifecycleStore'
import { getServerSignerAddress, withIntentSignerLock } from '@/utils/intents/intentNonceStore'
import { INTENT_STATE } from '@/utils/intents/intentState'

let activeReconciliation = null

async function reconcileTrackedIntentsUnlocked({ limit = 20, nowSec = Math.floor(Date.now() / 1000) } = {}) {
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
      if (lifecycle.state !== INTENT_STATE.PENDING && Number(record.expiresAt) > nowSec) {
        await removeRegisteredIntent(requestId)
        results.push({ requestId, status: lifecycle.stateName })
        continue
      }

      if (Number(record.expiresAt) <= nowSec) {
        if (lifecycle.state !== INTENT_STATE.PENDING && lifecycle.state !== INTENT_STATE.EXPIRED) {
          await removeRegisteredIntent(requestId)
          results.push({ requestId, status: lifecycle.stateName })
          continue
        }
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

export async function reconcileTrackedIntents(options = {}) {
  if (activeReconciliation) return activeReconciliation

  const run = process.env.WALLET_PRIVATE_KEY
    ? withIntentSignerLock(
      getServerSignerAddress(),
      () => reconcileTrackedIntentsUnlocked(options),
    )
    : reconcileTrackedIntentsUnlocked(options)

  activeReconciliation = Promise.resolve(run)
    .finally(() => {
      activeReconciliation = null
    })

  return activeReconciliation
}

export default { reconcileTrackedIntents }
