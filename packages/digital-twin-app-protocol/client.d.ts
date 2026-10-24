import type {
  AppReadyMessage, DigitalTwinProtocolId, DigitalTwinSample, PlaybackControlMessage,
  ResultsCompleteMessage, RunRequestMessage, SampleMessage, SamplesMessage,
  SimulationState, SimulationStateMessage,
} from './index.js'

export interface SampleProcessingContext {
  runId?: DigitalTwinProtocolId
  /** Aborted on reset, replacement by another run, or disposal. */
  signal: AbortSignal
}

export interface DigitalTwinAppClientOptions {
  onHostReady?: (extensions: Record<string, unknown>) => void
  /** Also receives each batched sample when onSamples is omitted. */
  onSample?: (sample: Pick<SampleMessage, 'time' | 'outputs'>, context: SampleProcessingContext) => void | Promise<void>
  onSamples?: (samples: DigitalTwinSample[], batch: SamplesMessage, context: SampleProcessingContext) => void | Promise<void>
  onReset?: (runId: DigitalTwinProtocolId | null) => void
  onSimulationState?: (state: SimulationState, message: SimulationStateMessage) => void
  /** Runs after the host sends all results and queued sample callbacks finish. */
  onResultsComplete?: (message: ResultsCompleteMessage, context: SampleProcessingContext) => void | Promise<void>
  onPlaybackRate?: (rate: number, message: PlaybackControlMessage) => void
  onRunAccepted?: (result: { requestId: DigitalTwinProtocolId; runId: DigitalTwinProtocolId }) => void
  onRunRejected?: (result: { requestId?: DigitalTwinProtocolId; code: string }) => void
  onRunCancelled?: (runId: DigitalTwinProtocolId) => void
  onError?: (error: Error) => void
  capabilities?: string[]
  defaultPlaybackRate?: number
  playbackControlPosition?: NonNullable<AppReadyMessage['playbackControlPosition']>
  runRequestTimeoutMs?: number
}

export interface DigitalTwinAppClient {
  reportReady(): boolean
  reportError(code?: string): boolean
  run(request?: Pick<RunRequestMessage, 'parameters' | 'options'>): Promise<{
    requestId: DigitalTwinProtocolId
    runId: DigitalTwinProtocolId
  }>
  cancel(runId?: DigitalTwinProtocolId | null): boolean
  requestModelChange(modelId: string): boolean
  dispose(): void
  readonly hostReady: boolean
  readonly activeRunId: DigitalTwinProtocolId | null
}

export declare function createDigitalTwinAppClient(options?: DigitalTwinAppClientOptions): DigitalTwinAppClient
