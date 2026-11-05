import type { DigitalTwinSample } from './index.js'

export interface NormalizedSimulationStreamEvent {
  kind: 'ignored' | 'started' | 'progress' | 'samples' | 'completed' | 'error'
  samples?: DigitalTwinSample[]
  time?: number
  finishReason?: string
  checkpoint?: Record<string, unknown>
  checkpointTime?: number
  code?: string
  message?: string
  metadata?: Record<string, unknown>
  event?: Record<string, unknown>
}

export function readNdjsonStream(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void | Promise<void>,
  options?: { signal?: AbortSignal },
): Promise<void>
export function normalizeSimulationStreamEvent(
  event: Record<string, unknown>,
  sequenceState?: { nextSequence: number },
): NormalizedSimulationStreamEvent
export function selectSimulationOutputs(
  outputs: Record<string, number | boolean>,
  outputVariables?: string[],
): Record<string, number | boolean>
