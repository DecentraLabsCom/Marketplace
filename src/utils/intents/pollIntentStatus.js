/**
 * Polls the institutional backend for an intent status with exponential backoff.
 * Expects the backend to implement GET /intents/:requestId as per dev/INSTITUTIONAL_INTENTS_IMPLEMENTATION.md
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollIntentStatus(requestId, {
  backendUrl =
    process.env.NEXT_PUBLIC_INSTITUTION_BACKEND_URL ||
    process.env.INSTITUTION_BACKEND_URL,
  authToken,
  signal,
  maxDurationMs = 10 * 60 * 1000, // 10 minutes
  initialDelayMs = 5000,
  maxDelayMs = 30000,
  onUpdate,
} = {}) {
  if (!backendUrl) {
    throw new Error('Backend URL not configured for intent polling');
  }
  if (!requestId) {
    throw new Error('requestId is required for intent polling');
  }

  let delay = initialDelayMs;
  const start = Date.now();

  while (true) {
    if (signal?.aborted) {
      throw new Error('Intent polling aborted');
    }
    const elapsed = Date.now() - start;
    if (elapsed > maxDurationMs) {
      throw new Error('Intent polling timed out');
    }

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (typeof authToken === 'string' && authToken.trim().length > 0) {
        const value = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
        headers.Authorization = value;
      }
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/intents/${requestId}`, {
        method: 'GET',
        headers,
        signal,
      });
      if (!res.ok) {
        throw new Error(`Backend status ${res.status}`);
      }
      const data = await res.json();
      const status = data?.status;

      if (onUpdate) {
        try { onUpdate(data); } catch {
          // intentionally left blank
        }
      }

      if (status === 'executed' || status === 'failed' || status === 'rejected') {
        return data;
      }
    } catch (err) {
      // Log and continue
      console.warn('[pollIntentStatus] poll error:', err?.message || err);
    }

    await sleep(delay);
    delay = Math.min(delay * 1.5, maxDelayMs);
  }
}

export default pollIntentStatus;
