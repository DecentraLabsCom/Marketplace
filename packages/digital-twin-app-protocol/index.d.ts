export type DigitalTwinScalar = string | number | boolean
export type DigitalTwinOutputValue = number | boolean
export type DigitalTwinOutputs = Record<string, DigitalTwinOutputValue>
export type DigitalTwinProtocolId = string

export interface ProtocolEnvelope<Type extends string = string> {
  type: Type
  version: 1
}

export interface HostReadyMessage extends ProtocolEnvelope<'decentralabs:digital-twin-host-ready'> {
  extensions?: Record<string, unknown>
}

export interface AppReadyMessage extends ProtocolEnvelope<'decentralabs:digital-twin-ready'> {
  capabilities?: string[]
  defaultPlaybackRate?: number
  playbackControlPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}

export interface AppErrorMessage extends ProtocolEnvelope<'decentralabs:digital-twin-error'> {
  code?: string
}

export interface RunRequestMessage extends ProtocolEnvelope<'decentralabs:fmi-run-request'> {
  requestId?: DigitalTwinProtocolId
  parameters?: Record<string, DigitalTwinScalar>
  options?: Partial<Record<'startTime' | 'stopTime' | 'stepSize', number>>
}

export interface RunAcceptedMessage extends ProtocolEnvelope<'decentralabs:fmi-run-accepted'> {
  requestId: DigitalTwinProtocolId
  runId: DigitalTwinProtocolId
}

export interface RunRejectedMessage extends ProtocolEnvelope<'decentralabs:fmi-run-rejected'> {
  requestId?: DigitalTwinProtocolId
  code: string
}

export interface RunCancelMessage extends ProtocolEnvelope<'decentralabs:fmi-run-cancel'> {
  runId: DigitalTwinProtocolId
}

export interface RunCancelledMessage extends ProtocolEnvelope<'decentralabs:fmi-run-cancelled'> {
  runId: DigitalTwinProtocolId
}

export interface DigitalTwinSample {
  time: number
  outputs: DigitalTwinOutputs
}

export interface SampleMessage extends ProtocolEnvelope<'decentralabs:fmi-sample'> {
  runId?: DigitalTwinProtocolId
  time: number | null
  outputs: DigitalTwinOutputs
}

export type SamplesMessage = ProtocolEnvelope<'decentralabs:fmi-samples'> & {
  samples: DigitalTwinSample[]
} & (
  | {
      runId?: DigitalTwinProtocolId
      batchId?: never
      firstSampleIndex?: never
      lastSampleIndex?: never
    }
  | {
      runId: DigitalTwinProtocolId
      batchId: DigitalTwinProtocolId
      firstSampleIndex: number
      lastSampleIndex: number
    }
)

export interface SamplesAcknowledgementMessage extends ProtocolEnvelope<'decentralabs:fmi-samples-ack'> {
  runId: DigitalTwinProtocolId
  batchId: DigitalTwinProtocolId
  lastSampleIndex: number
}

export interface ResultsCompleteMessage extends ProtocolEnvelope<'decentralabs:fmi-results-complete'> {
  runId?: DigitalTwinProtocolId
  sampleCount: number
  state: 'completed' | 'cancelled' | 'error'
}

export interface ResetMessage extends ProtocolEnvelope<'decentralabs:fmi-reset'> {
  runId?: DigitalTwinProtocolId | null
}

export type SimulationState = 'idle' | 'running' | 'completed' | 'cancelled' | 'error'

export interface SimulationStateMessage extends ProtocolEnvelope<'decentralabs:fmi-simulation-state'> {
  runId?: DigitalTwinProtocolId
  requestId?: DigitalTwinProtocolId
  state: SimulationState
}

export interface PlaybackControlMessage extends ProtocolEnvelope<'decentralabs:fmi-playback-control'> {
  rate: number
  rateUnit: 'model-seconds-per-real-second'
}

export interface ModelChangeMessage extends ProtocolEnvelope<'decentralabs:digital-twin-model-change'> {
  modelId: string
}

export type AppToHostMessage =
  | AppReadyMessage
  | AppErrorMessage
  | RunRequestMessage
  | RunCancelMessage
  | SamplesAcknowledgementMessage
  | ModelChangeMessage

export type HostToAppMessage =
  | HostReadyMessage
  | RunAcceptedMessage
  | RunRejectedMessage
  | RunCancelledMessage
  | SampleMessage
  | SamplesMessage
  | ResultsCompleteMessage
  | ResetMessage
  | SimulationStateMessage
  | PlaybackControlMessage

export type DigitalTwinProtocolMessage = AppToHostMessage | HostToAppMessage

export declare const DIGITAL_TWIN_PROTOCOL_VERSION: 1
export declare const DIGITAL_TWIN_APP_ASSET_FILENAME: 'index.js'
export declare const MAX_RUN_PARAMETERS: 256
export declare const MAX_PARAMETER_NAME_LENGTH: 256
export declare const MAX_PARAMETER_STRING_LENGTH: 1024
export declare const MAX_OUTPUTS_PER_SAMPLE: 512
export declare const MAX_SAMPLES_PER_BATCH: 256
export declare const MAX_SAMPLE_BATCH_JSON_CHARS: 1_000_000
export declare const SAMPLE_ACK_TIMEOUT_MS: 15_000

export declare const DIGITAL_TWIN_MESSAGE: Readonly<{
  HOST_READY: HostReadyMessage['type']
  APP_READY: AppReadyMessage['type']
  APP_ERROR: AppErrorMessage['type']
  RUN_REQUEST: RunRequestMessage['type']
  RUN_ACCEPTED: RunAcceptedMessage['type']
  RUN_REJECTED: RunRejectedMessage['type']
  RUN_CANCEL: RunCancelMessage['type']
  RUN_CANCELLED: RunCancelledMessage['type']
  SAMPLE: SampleMessage['type']
  SAMPLES: SamplesMessage['type']
  SAMPLES_ACK: SamplesAcknowledgementMessage['type']
  RESULTS_COMPLETE: ResultsCompleteMessage['type']
  RESET: ResetMessage['type']
  SIMULATION_STATE: SimulationStateMessage['type']
  PLAYBACK_CONTROL: PlaybackControlMessage['type']
  MODEL_CHANGE: ModelChangeMessage['type']
}>

export declare const DIGITAL_TWIN_CAPABILITY: Readonly<{
  PLAYBACK_RATE: 'playback-rate'
  SAMPLE_ACKNOWLEDGEMENT: 'sample-acknowledgement'
}>

export declare const APP_TO_HOST_MESSAGE_TYPES: readonly AppToHostMessage['type'][]
export declare const HOST_TO_APP_MESSAGE_TYPES: readonly HostToAppMessage['type'][]

export declare function createProtocolId(prefix?: string): DigitalTwinProtocolId
export declare function isRecord(value: unknown): value is Record<string, unknown>
export declare function isProtocolEnvelope(value: unknown): value is ProtocolEnvelope
export declare function isValidProtocolId(value: unknown): value is DigitalTwinProtocolId
export declare function isFiniteScalar(value: unknown): value is DigitalTwinScalar
export declare function isValidAppReadyMessage(value: unknown): value is AppReadyMessage
export declare function isValidAppErrorMessage(value: unknown): value is AppErrorMessage
export declare function isValidRunRequest(value: unknown): value is RunRequestMessage
export declare function isValidRunCancellation(value: unknown): value is RunCancelMessage
export declare function isValidSamplesAcknowledgement(value: unknown): value is SamplesAcknowledgementMessage
export declare function isValidModelChangeRequest(value: unknown): value is ModelChangeMessage
export declare function isValidAppMessage(value: unknown): value is AppToHostMessage
export declare function isValidSample(value: unknown): value is DigitalTwinSample
export declare function isValidSamplesBatch(value: unknown): value is SamplesMessage
export declare function isValidHostMessage(value: unknown): value is HostToAppMessage
export declare function isHostMessageEvent(event: MessageEvent<unknown>): event is MessageEvent<HostToAppMessage>
export declare function makeProtocolMessage<Type extends string, Payload extends Record<string, unknown> = Record<string, never>>(
  type: Type,
  payload?: Payload,
): Payload & ProtocolEnvelope<Type>
export declare function postToHost<Type extends AppToHostMessage['type']>(type: Type, payload?: Record<string, unknown>): boolean
export declare function acknowledgeSampleBatch(message: SamplesMessage): boolean
