import type { FmuConnectionConfig } from './index.js'
import type { InputUpdateQuota } from './input-update-quota.js'

export interface FmuSession {
  readonly sessionId: string
  readonly capabilities: Record<string, unknown> & {
    advanceSamples?: boolean
    advanceComputeBudget?: boolean
    advanceSampleSequences?: boolean
    maxOutputHz?: number
    inputUpdateQuota: InputUpdateQuota
  }
  request(type: string, expected: string, payload?: Record<string, unknown>): Promise<Record<string, any>>
  close(): void
}
export declare function connectFmuSession(connection: FmuConnectionConfig, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<FmuSession>
