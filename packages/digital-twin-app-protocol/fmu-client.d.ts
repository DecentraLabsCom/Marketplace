import type { FmuConnectionConfig, FmuStateCheckpoint, FmuStateCheckpointBundle } from './index.js'
import type { InputUpdateQuota } from './input-update-quota.js'

export interface FmuSession {
  readonly sessionId: string
  readonly capabilities: Record<string, unknown> & {
    advanceSamples?: boolean
    advanceComputeBudget?: boolean
    advanceSampleSequences?: boolean
    maxOutputHz?: number
    fmuState?: { getAndSet?: boolean; serialize?: boolean }
    inputUpdateQuota: InputUpdateQuota
  }
  request(type: string, expected: string, payload?: Record<string, unknown>): Promise<Record<string, any>>
  /** Capture the current remote FMU state as a reservation-bound checkpoint. */
  captureState(): Promise<FmuStateCheckpointBundle>
  /** Restore an initialized remote session from a signed checkpoint token. */
  restoreState(checkpoint: FmuStateCheckpoint | FmuStateCheckpointBundle): Promise<Record<string, any>>
  close(): void
}
export declare function connectFmuSession(connection: FmuConnectionConfig, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<FmuSession>
export declare function isValidFmuStateCheckpoint(value: unknown): value is FmuStateCheckpoint
export declare function isValidFmuStateCheckpointBundle(value: unknown): value is FmuStateCheckpointBundle
