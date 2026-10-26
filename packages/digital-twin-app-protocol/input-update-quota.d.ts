export interface InputUpdateQuota {
  /** null means there is no sliding-window update quota. */
  maxUpdatesPerWindow: number | null
  windowMs: number
  maxUpdateBytes: number
  /** null means there is no daily update quota. */
  maxUpdatesPerDay: number | null
  maxUpdateBytesPerDay: number | null
  maxScheduledEventsPerAdvance: number
  maxScheduleBytesPerAdvance: number
}

export function getInputUpdateQuota(capabilities?: Record<string, unknown>): InputUpdateQuota
export function getInputUpdateIntervalMs(capabilities?: Record<string, unknown>): number
export function getInputUpdateRetryDelayMs(
  error: { code?: string; retryAfterMs?: number } | null | undefined,
  capabilities?: Record<string, unknown>,
): number | null
