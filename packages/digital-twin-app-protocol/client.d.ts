import type { AppReadyMessage, DigitalTwinSample, FmuConnectionConfig, InputEvent, RunOptions, PlaybackControlMessage, SimulationState } from './index.js'
export interface SampleProcessingContext { runId: string; signal: AbortSignal }
export interface ResultCompletion { runId: string; state: 'completed' | 'cancelled' | 'error'; sampleCount: number }
export interface DigitalTwinAppClientOptions {
  /** Supply this to use the app independently of a Marketplace parent window. */
  getConnection?: (request: { options: RunOptions; signal: AbortSignal }) => Promise<FmuConnectionConfig | { connection: FmuConnectionConfig; inputSchedule?: InputEvent[] }>
  onHostReady?: (extensions: Record<string, unknown>) => void
  onSample?: (sample: DigitalTwinSample, context: SampleProcessingContext) => void | Promise<void>
  onSamples?: (samples: DigitalTwinSample[], batch: { runId: string; samples: DigitalTwinSample[]; firstSampleIndex: number; lastSampleIndex: number }, context: SampleProcessingContext) => void | Promise<void>
  onReset?: (runId: string) => void
  onSimulationState?: (state: SimulationState, message: { runId: string; state: SimulationState }) => void
  onResultsComplete?: (message: ResultCompletion, context: SampleProcessingContext) => void | Promise<void>
  onPlaybackRate?: (rate: number, message: PlaybackControlMessage) => void
  onRunAccepted?: (result: { runId: string }) => void
  onRunRejected?: (result: { code: string }) => void
  onRunCancelled?: (runId: string) => void
  onError?: (error: Error) => void
  defaultPlaybackRate?: number
  playbackControlPosition?: AppReadyMessage['playbackControlPosition']
  runRequestTimeoutMs?: number
}
export interface DigitalTwinAppClient {
  reportReady(): boolean
  reportError(code?: string): boolean
  run(request?: { parameters?: Record<string, number | boolean | string>; options?: RunOptions; inputSchedule?: InputEvent[]; inputController?: (sample: DigitalTwinSample, context: SampleProcessingContext) => Record<string, number | boolean | string> | undefined | Promise<Record<string, number | boolean | string> | undefined> }): Promise<{ runId: string }>
  cancel(runId?: string): boolean
  requestModelChange(modelId: string): boolean
  dispose(): void
  readonly hostReady: boolean
  readonly activeRunId: string | null
}
export declare function createDigitalTwinAppClient(options?: DigitalTwinAppClientOptions): DigitalTwinAppClient
