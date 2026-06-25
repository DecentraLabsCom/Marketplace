const INTENT_STATE = {
  NONE: 0,
  PENDING: 1,
  EXECUTED: 2,
  CANCELLED: 3,
  EXPIRED: 4,
}

const DEFAULT_RETRY_OPTIONS = {
  attempts: 3,
  initialDelayMs: 750,
  maxDelayMs: 2_000,
}

export function isOnchainIntentExecuted(status) {
  return Number(status?.state) === INTENT_STATE.EXECUTED
}

export async function fetchOnchainIntentStatus(requestId, { signal } = {}) {
  if (!requestId) {
    throw new Error('requestId is required for on-chain intent verification')
  }

  const url = `/api/backend/intents/${encodeURIComponent(requestId)}/onchain`
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal,
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(payload?.error || payload?.message || `On-chain intent verification failed (${res.status})`)
  }
  return payload
}

function isRetryableIntentState(status) {
  const state = Number(status?.state)
  return state === INTENT_STATE.NONE || state === INTENT_STATE.PENDING
}

function buildExecutionError(status) {
  return new Error(`On-chain intent state is ${status?.stateName || status?.state}; expected EXECUTED`)
}

function createAbortError() {
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

function delay(ms, signal) {
  if (!ms) return Promise.resolve()
  if (signal?.aborted) {
    return Promise.reject(createAbortError())
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms)
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeout)
        reject(createAbortError())
      }, { once: true })
    }
  })
}

export async function verifyInstitutionReportedExecution(
  requestId,
  {
    signal,
    attempts = DEFAULT_RETRY_OPTIONS.attempts,
    initialDelayMs = DEFAULT_RETRY_OPTIONS.initialDelayMs,
    maxDelayMs = DEFAULT_RETRY_OPTIONS.maxDelayMs,
  } = {}
) {
  const maxAttempts = Math.max(1, Number(attempts) || 1)
  let lastError = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let status = null
    try {
      status = await fetchOnchainIntentStatus(requestId, { signal })
      if (isOnchainIntentExecuted(status)) {
        return status
      }
      lastError = buildExecutionError(status)
      if (!isRetryableIntentState(status)) {
        throw lastError
      }
    } catch (error) {
      lastError = error
      if (status && !isRetryableIntentState(status)) {
        throw error
      }
    }

    if (attempt < maxAttempts - 1) {
      const nextDelay = Math.min(
        maxDelayMs,
        initialDelayMs * (2 ** attempt),
      )
      await delay(nextDelay, signal)
    }
  }

  throw lastError || new Error('On-chain intent verification failed')
}

export { INTENT_STATE }
