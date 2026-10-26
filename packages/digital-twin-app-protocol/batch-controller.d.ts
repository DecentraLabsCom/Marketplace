export interface AdaptiveBatchController {
  maxSamples: number
  sampleCount: number
  targetResponseMs: number
  maxComputeMs: number
  presentationReserveMs: number
  safetyMarginMs: number
  responseEwmaMs: number | null
  computeEwmaMs: number | null
  computePerSampleEwmaMs: number | null
  fixedLatencyEwmaMs: number | null
  transferMsPerByte: number | null
  bytesPerSampleEwma: number | null
  consumerDelayEwmaMs: number | null
  rateLimitWaitEwmaMs: number | null
  interactionDelayEwmaMs: number | null
  targetReachable: boolean | null
  estimatedBatchResponseMs: number | null
  batchConstraint: 'measurement' | 'latency-unreachable' | 'response-budget' | 'compute-budget' | 'sample-limit'
  lastStopReason: string | null
  singleStepOverBudget: boolean
  previousPayloadBytes: number | null
  previousTransportMs: number | null
}

export declare function createAdaptiveBatchController(options: {
  startTime: number
  stopTime: number
  stepSize: number
  maxSamples?: number
  targetResponseMs?: number
  maxComputeMs?: number
  presentationReserveMs?: number
  safetyMarginMs?: number
}): AdaptiveBatchController

export declare function getAdaptiveBatchSize(controller: AdaptiveBatchController): number

export declare function observeAdaptiveBatch(
  controller: AdaptiveBatchController,
  measurements: {
    responseMs: number | null
    computeMs?: number | null
    sampleCount: number
    payloadBytes?: number | null
    consumerDelayMs?: number | null
    rateLimitWaitMs?: number | null
    interactionDelayMs?: number | null
    stopReason?: string
  },
): AdaptiveBatchController
