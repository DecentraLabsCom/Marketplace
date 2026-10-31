import type { AppReadyMessage, DigitalTwinSample, FmiLsExperiment, FmiLsParameterPreset, FmuConnectionConfig, InputEvent, RunOptions, PlaybackControlMessage, SimulationState } from './index.js'
export interface SampleProcessingContext { runId: string; signal: AbortSignal }
export interface ResultCompletion { runId: string; state: 'completed' | 'cancelled' | 'error'; sampleCount: number }
export interface SampleBatch { runId: string; samples: DigitalTwinSample[]; firstSampleIndex: number; lastSampleIndex: number }
export interface AdaptiveBatchOptions {
  targetResponseMs?: number; maxComputeMs?: number; presentationReserveMs?: number; safetyMarginMs?: number
}
export interface FmuAdvanceOptions {
  /** Output sampling interval in FMI communication steps, 1–100000. */
  outputSampleEverySteps?: number
  /** 1–512 distinct outputs, requested and checked in initial and subsequent samples. */
  outputVariables?: string[]
}
export interface DigitalTwinAppClientOptions {
  /** Supply this to use the app independently of a Marketplace parent window. */
  getConnection?: (request: { options: RunOptions; signal: AbortSignal }) => Promise<FmuConnectionConfig | { connection: FmuConnectionConfig; inputSchedule?: InputEvent[] }>
  onHostReady?: (extensions: Record<string, unknown>) => void
  /** Called per sample when onSamples is not supplied. */
  onSample?: (sample: DigitalTwinSample, context: SampleProcessingContext) => void | Promise<void>
  /** Receives every batch, including the initial sample; takes precedence over onSample. */
  onSamples?: (samples: DigitalTwinSample[], batch: SampleBatch, context: SampleProcessingContext) => void | Promise<void>
  /** In adaptive mode, resolve after the latest sample has actually been rendered. */
  onBatchRendered?: (samples: DigitalTwinSample[], batch: SampleBatch, context: SampleProcessingContext) => void | Promise<void>
  onReset?: (runId: string) => void
  onSimulationState?: (state: SimulationState, message: { runId: string; state: SimulationState }) => void
  onResultsComplete?: (message: ResultCompletion, context: SampleProcessingContext) => void | Promise<void>
  onPlaybackRate?: (rate: number, message: PlaybackControlMessage) => void
  /** Apply an FMI-LS-REF parameter set selected in the Marketplace host UI. */
  onFmiLsParameterPreset?: (preset: FmiLsParameterPreset) => void
  /** Reflect the selected FMI-LS-REF experiment in app-owned controls. The SDK applies its parameters and options on run. */
  onFmiLsExperiment?: (experiment: FmiLsExperiment | null) => void
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
  run(request?: {
    parameters?: Record<string, number | boolean | string>; options?: RunOptions; inputSchedule?: InputEvent[]
    inputController?: (sample: DigitalTwinSample, context: SampleProcessingContext) => Record<string, number | boolean | string> | undefined | Promise<Record<string, number | boolean | string> | undefined>
    inputControllerInterval?: number; inputControllerTimes?: number[]
    batchPolicy?: 'fixed' | 'adaptive'; maxBatchSamples?: number; adaptiveBatchOptions?: AdaptiveBatchOptions
    advanceOptions?: FmuAdvanceOptions
    validateModel?: (model: Record<string, unknown>) => boolean | void | Promise<boolean | void>
    parametersFromModel?: (model: Record<string, unknown>) => Record<string, number | boolean | string> | Promise<Record<string, number | boolean | string>>
  }): Promise<{ runId: string }>
  cancel(runId?: string): boolean
  requestModelChange(modelId: string): boolean
  dispose(): void
  readonly hostReady: boolean
  readonly activeRunId: string | null
}
export declare function createDigitalTwinAppClient(options?: DigitalTwinAppClientOptions): DigitalTwinAppClient
