/**
 * Polls the institutional backend for an intent authorization session status.
 * Expects the backend to implement GET /intents/authorize/status/:sessionId.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollIntentAuthorizationStatus(sessionId, {
  backendUrl =
    process.env.NEXT_PUBLIC_INSTITUTION_BACKEND_URL ||
    process.env.INSTITUTION_BACKEND_URL,
  authToken,
  signal,
  maxDurationMs = 5 * 60 * 1000,
  initialDelayMs = 2000,
  maxDelayMs = 15000,
  onUpdate,
} = {}) {
  if (!backendUrl) {
    throw new Error('Backend URL not configured for intent authorization polling');
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
      const headers = { 'Content-Type': 'application/json' };
      if (typeof authToken === 'string' && authToken.trim().length > 0) {
        const value = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
        headers.Authorization = value;
      }
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/intents/authorize/status/${sessionId}`, {
        method: 'GET',
        headers,
        signal,
      });
      if (!res.ok) {
        throw new Error(`Backend status ${res.status}`);
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
