export type DigitalTwinProtocolId = string
export type DigitalTwinScalar = number | boolean | string
export type SimulationState = 'idle' | 'running' | 'completed' | 'cancelled' | 'error'
export interface RunOptions { startTime?: number; stopTime?: number; stepSize?: number }
export interface DigitalTwinSample {
  time: number; outputs: Record<string, number | boolean>; sequence?: number
  eventOccurred?: boolean; eventHandlingNeeded?: boolean; earlyReturn?: boolean; terminateSimulation?: boolean; finished?: boolean; finishReason?: string
}
export interface InputEvent { time: number; values: Record<string, DigitalTwinScalar> }
export interface FmuConnectionConfig {
  protocolVersion: '1.0'; gatewayWsUrl: string; labId: string; reservationKey: string
  sessionTicket: string; ticketExpiresAt: number
}
export interface ProtocolEnvelope<T extends string = string> { type: T; version: 2 }
export interface AppReadyMessage extends ProtocolEnvelope<'decentralabs:digital-twin-ready'> {
  capabilities?: string[]; defaultPlaybackRate?: number
  playbackControlPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}
export interface ExecutionStateMessage extends ProtocolEnvelope<'decentralabs:execution-state'> {
  runId: string; state: SimulationState; options?: RunOptions
}
export type AppToHostMessage = AppReadyMessage | ExecutionStateMessage | ProtocolEnvelope<'decentralabs:digital-twin-connect'>
  | (ProtocolEnvelope<'decentralabs:digital-twin-error'> & { code?: string })
  | (ProtocolEnvelope<'decentralabs:fmu-connection-request'> & { requestId: string; options?: RunOptions })
  | (ProtocolEnvelope<'decentralabs:digital-twin-model-change'> & { modelId: string })
export interface PlaybackControlMessage extends ProtocolEnvelope<'decentralabs:fmi-playback-control'> { rate: number; rateUnit: 'model-seconds-per-real-second' }
export interface FmiLsParameterPreset {
  id: string; name: string; description: string; parameters: Record<string, DigitalTwinScalar>
}
export interface FmiLsParameterPresetMessage extends ProtocolEnvelope<'decentralabs:fmi-ls-parameter-preset'>, FmiLsParameterPreset {}
export interface FmiLsExperiment {
  id: string; name: string; description: string
  parameters: Record<string, DigitalTwinScalar>; options: RunOptions
  inputSchedule?: InputEvent[]
}
export interface FmiLsExperimentMessage extends ProtocolEnvelope<'decentralabs:fmi-ls-experiment'> {
  experiment: FmiLsExperiment | null
}
export type HostToAppMessage = PlaybackControlMessage
  | FmiLsParameterPresetMessage
  | FmiLsExperimentMessage
  | (ProtocolEnvelope<'decentralabs:digital-twin-host-ready'> & { extensions?: Record<string, unknown> })
  | (ProtocolEnvelope<'decentralabs:fmu-connection-ready'> & { requestId: string; connection: FmuConnectionConfig; inputSchedule?: InputEvent[] })
  | (ProtocolEnvelope<'decentralabs:fmu-connection-error'> & { requestId: string; code: string })
  | (ProtocolEnvelope<'decentralabs:execution-cancel'> & { runId: string })
export type DigitalTwinProtocolMessage = AppToHostMessage | HostToAppMessage
export declare const DIGITAL_TWIN_PROTOCOL_VERSION: 2
export declare const DIGITAL_TWIN_APP_ASSET_FILENAME: 'index.js'
export declare const DIGITAL_TWIN_MESSAGE: Readonly<Record<'HOST_READY' | 'APP_HELLO' | 'APP_READY' | 'APP_ERROR' | 'CONNECTION_REQUEST' | 'CONNECTION_READY' | 'CONNECTION_ERROR' | 'EXECUTION_STATE' | 'EXECUTION_CANCEL' | 'PLAYBACK_CONTROL' | 'FMI_LS_PARAMETER_PRESET' | 'FMI_LS_EXPERIMENT' | 'MODEL_CHANGE', DigitalTwinProtocolMessage['type']>>
export declare const DIGITAL_TWIN_CAPABILITY: Readonly<{ PLAYBACK_RATE: 'playback-rate'; EXECUTION_CONTROL: 'execution-control'; FMI_LS_PARAMETER_PRESETS: 'fmi-ls-parameter-presets'; FMI_LS_EXPERIMENTS: 'fmi-ls-experiments' }>
export declare const APP_TO_HOST_MESSAGE_TYPES: readonly AppToHostMessage['type'][]
export declare const HOST_TO_APP_MESSAGE_TYPES: readonly HostToAppMessage['type'][]
export declare const MAX_RUN_PARAMETERS: 256
export declare const MAX_PARAMETER_NAME_LENGTH: 256
export declare const MAX_PARAMETER_STRING_LENGTH: 1024
export declare const MAX_OUTPUTS_PER_SAMPLE: 512
export declare const MAX_SAMPLES_PER_BATCH: 256
export declare const MAX_SAMPLE_BATCH_JSON_CHARS: 1000000
export declare function isRecord(value: unknown): value is Record<string, unknown>
export declare function createProtocolId(prefix?: string): string
export declare function isProtocolEnvelope(value: unknown): value is ProtocolEnvelope
export declare function isValidProtocolId(value: unknown): value is string
export declare function isValidFmiLsExperiment(value: unknown): value is FmiLsExperiment
export declare function isFiniteScalar(value: unknown): value is DigitalTwinScalar
export declare function isValidOptions(value: unknown): value is RunOptions
export declare function isValidParameters(value: unknown): value is Record<string, DigitalTwinScalar>
export declare function isValidInputSchedule(value: unknown): value is InputEvent[]
export declare function isValidSample(value: unknown): value is DigitalTwinSample
export declare function isValidConnectionConfig(value: unknown): value is FmuConnectionConfig
export declare function isValidAppReadyMessage(value: unknown): value is AppReadyMessage
export declare function isValidAppErrorMessage(value: unknown): value is AppToHostMessage
export declare function isValidAppMessage(value: unknown): value is AppToHostMessage
export declare function isValidHostMessage(value: unknown): value is HostToAppMessage
export declare function isHostMessageEvent(event: MessageEvent<unknown>): event is MessageEvent<HostToAppMessage>
export declare function makeProtocolMessage<T extends string, P extends Record<string, unknown>>(type: T, payload?: P): ProtocolEnvelope<T> & P
export declare function postToHost(type: AppToHostMessage['type'], payload?: Record<string, unknown>): boolean
