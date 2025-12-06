/**
 * Polls the institutional gateway for an intent status with exponential backoff.
 * Expects the gateway to implement GET /intents/:requestId as per dev/INSTITUTIONAL_INTENTS_IMPLEMENTATION.md
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollIntentStatus(requestId, {
  gatewayUrl = process.env.NEXT_PUBLIC_INSTITUTION_GATEWAY_URL || process.env.INSTITUTION_GATEWAY_URL,
  signal,
  maxDurationMs = 10 * 60 * 1000, // 10 minutes
  initialDelayMs = 5000,
  maxDelayMs = 30000,
  onUpdate,
} = {}) {
  if (!gatewayUrl) {
    throw new Error('Gateway URL not configured for intent polling');
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
      const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/intents/${requestId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal,
      });
      if (!res.ok) {
        throw new Error(`Gateway status ${res.status}`);
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
