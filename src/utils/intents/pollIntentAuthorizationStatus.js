/**
 * Polls the institutional gateway for an intent authorization session status.
 * Expects the gateway to implement GET /intents/authorize/status/:sessionId.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollIntentAuthorizationStatus(sessionId, {
  gatewayUrl = process.env.NEXT_PUBLIC_INSTITUTION_GATEWAY_URL || process.env.INSTITUTION_GATEWAY_URL,
  signal,
  maxDurationMs = 5 * 60 * 1000,
  initialDelayMs = 2000,
  maxDelayMs = 15000,
  onUpdate,
} = {}) {
  if (!gatewayUrl) {
    throw new Error('Gateway URL not configured for intent authorization polling');
  }
  if (!sessionId) {
    throw new Error('sessionId is required for intent authorization polling');
  }

  let delay = initialDelayMs;
  const start = Date.now();

  while (true) {
    if (signal?.aborted) {
      throw new Error('Intent authorization polling aborted');
    }
    if (Date.now() - start > maxDurationMs) {
      throw new Error('Intent authorization polling timed out');
    }

    try {
      const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/intents/authorize/status/${sessionId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal,
      });
      if (!res.ok) {
        throw new Error(`Gateway status ${res.status}`);
      }
      const data = await res.json();

      if (onUpdate) {
        try { onUpdate(data); } catch {
          // intentionally left blank
        }
      }

      const status = (data?.status || '').toUpperCase();
      if (status === 'SUCCESS' || status === 'FAILED') {
        return data;
      }
    } catch (err) {
      console.warn('[pollIntentAuthorizationStatus] poll error:', err?.message || err);
    }

    await sleep(delay);
    delay = Math.min(delay * 1.5, maxDelayMs);
  }
}

export default pollIntentAuthorizationStatus;
