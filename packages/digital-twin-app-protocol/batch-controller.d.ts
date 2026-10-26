export interface AdaptiveBatchController {
  maxSamples: number
  sampleCount: number
  stableBatches: number
  responseEwmaMs: number | null
  consumerDelayEwmaMs: number | null
}

export declare function createAdaptiveBatchController(options: {
  startTime: number
  stopTime: number
  stepSize: number
  maxSamples?: number
}): AdaptiveBatchController
export declare function getAdaptiveBatchSize(controller: AdaptiveBatchController): number
export declare function observeAdaptiveBatch(
  controller: AdaptiveBatchController,
  measurements: { responseMs: number; consumerDelayMs: number | null },
): AdaptiveBatchController
