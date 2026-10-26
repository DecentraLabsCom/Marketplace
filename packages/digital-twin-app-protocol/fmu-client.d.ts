import type { FmuConnectionConfig } from './index.js'

export interface FmuSession {
  readonly sessionId: string
  readonly capabilities: Record<string, unknown> & {
    advanceSamples?: boolean
    advanceComputeBudget?: boolean
    advanceSampleSequences?: boolean
    maxOutputHz?: number
  }
  request(type: string, expected: string, payload?: Record<string, unknown>): Promise<Record<string, any>>
  close(): void
}
export declare function connectFmuSession(connection: FmuConnectionConfig, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<FmuSession>
