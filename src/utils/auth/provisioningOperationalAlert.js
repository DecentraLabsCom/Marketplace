const ALERT_TIMEOUT_MS = 3_000;

function resolveAlertWebhook() {
  const configured = process.env.PROVISIONING_ALERT_WEBHOOK_URL?.trim();
  if (!configured) return null;

  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safeErrorMessage(error) {
  return typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim().slice(0, 500)
    : 'Unknown provisioning audit error';
}

/**
 * Emits a production-visible alert and optionally forwards it to an
 * operations webhook. No provisioning bearer or wallet secret is included.
 */
export async function emitProvisioningOperationalAlert({
  jti,
  operation,
  stage,
  txHashes = [],
  error,
  markerPersisted = false,
} = {}) {
  const alert = {
    type: 'PROVISIONING_RECONCILIATION_REQUIRED',
    severity: 'critical',
    jti: typeof jti === 'string' ? jti : null,
    operation: typeof operation === 'string' ? operation : 'institution-provisioning',
    stage: typeof stage === 'string' ? stage : null,
    txHashes: Array.isArray(txHashes) ? txHashes.slice(-10) : [],
    markerPersisted: Boolean(markerPersisted),
    error: safeErrorMessage(error),
    occurredAt: new Date().toISOString(),
  };

  console.error('[PROVISIONING_RECONCILIATION_REQUIRED]', alert);

  const webhookUrl = resolveAlertWebhook();
  if (!webhookUrl) return { webhookSent: false, alert };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Alert webhook returned ${response.status}`);
    return { webhookSent: true, alert };
  } catch (webhookError) {
    console.error('[PROVISIONING_ALERT_DELIVERY_FAILED]', {
      jti: alert.jti,
      error: safeErrorMessage(webhookError),
    });
    return { webhookSent: false, alert };
  } finally {
    clearTimeout(timeout);
  }
}
