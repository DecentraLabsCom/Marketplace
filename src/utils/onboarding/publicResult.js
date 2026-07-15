const FAILED_STATUSES = new Set(['FAILED', 'EXPIRED'])

/**
 * Keep callback-only WebAuthn material and upstream error text server-side.
 * The browser only needs the state needed to advance the onboarding flow.
 */
export function toPublicOnboardingResult(result, source = null) {
  const status = result?.status || 'PENDING'
  return {
    ...(source ? { source } : {}),
    status,
    success: Boolean(result?.success),
    sessionId: result?.sessionId || null,
    institutionId: result?.institutionId || null,
    timestamp: result?.timestamp || null,
    ...(FAILED_STATUSES.has(status) ? { error: 'Onboarding could not be completed.' } : {}),
  }
}
