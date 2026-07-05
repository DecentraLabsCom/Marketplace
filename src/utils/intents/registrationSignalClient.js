import devLog from '@/utils/dev/logger'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const normalizeBackendUrl = (backendUrl) => String(backendUrl || '').replace(/\/$/, '')

export async function notifyIntentRegistrationSignalFromBrowser({
  backendUrl,
  backendAuthToken,
  requestId,
  event,
  txHash = null,
  blockNumber = null,
  reason = null,
}) {
  if (!backendUrl || !backendAuthToken || !requestId || !event) {
    return { ok: false, skipped: true, reason: 'missing_signal_fields' }
  }

  const token = backendAuthToken.startsWith('Bearer ')
    ? backendAuthToken
    : `Bearer ${backendAuthToken}`

  const res = await fetch(`${normalizeBackendUrl(backendUrl)}/intents/${encodeURIComponent(requestId)}/registration`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify({
      event,
      txHash,
      blockNumber,
      reason,
    }),
  })

  const data = await res.json().catch(() => ({}))
  return {
    ok: res.ok,
    status: res.status,
    data,
  }
}

export async function trackIntentRegistrationReceipt({
  requestId,
  txHash,
  backendUrl,
  backendAuthToken,
  maxDurationMs = 180_000,
  intervalMs = 3_000,
  receiptFetcher = fetch,
  signalNotifier = notifyIntentRegistrationSignalFromBrowser,
} = {}) {
  if (!requestId || !txHash || !backendUrl || !backendAuthToken) {
    return { status: 'skipped', reason: 'missing_registration_tracking_fields' }
  }

  const startedAt = Date.now()
  while (Date.now() - startedAt <= maxDurationMs) {
    try {
      const receiptResponse = await receiptFetcher(
        `/api/backend/intents/registration/receipt?txHash=${encodeURIComponent(txHash)}`,
        { method: 'GET', credentials: 'include' },
      )
      const receipt = await receiptResponse.json().catch(() => ({}))
      if (receiptResponse.ok && receipt?.status === 'mined') {
        const notifyResponse = await signalNotifier({
          backendUrl,
          backendAuthToken,
          requestId,
          event: 'registration_mined',
          txHash,
          blockNumber: receipt.blockNumber ?? null,
        })
        return {
          status: notifyResponse?.ok ? 'notified' : 'notify_failed',
          receipt,
          notifyResponse,
        }
      }
      if (receiptResponse.ok && receipt?.status === 'failed') {
        const notifyResponse = await signalNotifier({
          backendUrl,
          backendAuthToken,
          requestId,
          event: 'registration_failed',
          txHash,
          blockNumber: receipt.blockNumber ?? null,
          reason: `registration_tx_failed:${receipt.receiptStatus ?? 'unknown'}`,
        })
        return {
          status: notifyResponse?.ok ? 'failed_notified' : 'notify_failed',
          receipt,
          notifyResponse,
        }
      }
    } catch (error) {
      devLog.warn('Registration receipt tracking attempt failed:', error)
    }

    await sleep(intervalMs)
  }

  return { status: 'timeout' }
}

export function startIntentRegistrationReceiptTracker(options = {}) {
  trackIntentRegistrationReceipt(options).catch((error) => {
    devLog.warn('Registration receipt tracking failed:', error)
  })
}
