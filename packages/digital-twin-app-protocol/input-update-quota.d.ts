export interface InputUpdateQuota {
  maxUpdatesPerWindow: number
  windowMs: number
  maxUpdateBytes: number
  maxUpdatesPerDay: number
  maxUpdateBytesPerDay: number
  maxScheduledEventsPerAdvance: number
  maxScheduleBytesPerAdvance: number
}

export function getInputUpdateQuota(capabilities?: Record<string, unknown>): InputUpdateQuota
export function getInputUpdateIntervalMs(capabilities?: Record<string, unknown>): number
export function getInputUpdateRetryDelayMs(
  error: { code?: string; retryAfterMs?: number } | null | undefined,
  capabilities?: Record<string, unknown>,
): number | null
