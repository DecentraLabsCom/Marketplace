import {
  createAdaptiveBatchController,
  getAdaptiveBatchSize,
  observeAdaptiveBatch,
} from '@decentralabs/digital-twin-app-protocol/batch-controller'

export const createInteractiveBatchController = createAdaptiveBatchController

export function getInteractiveBatchPlan(controller, currentTime, stopTime, stepSize) {
  const maxSamples = getAdaptiveBatchSize(controller)
  return {
    targetTime: Math.min(stopTime, currentTime + stepSize * maxSamples),
    maxSamples,
    maxComputeMs: controller.maxComputeMs,
  }
}

export function observeInteractiveBatch(controller, measurements) {
  return observeAdaptiveBatch(controller, {
    responseMs: measurements.responseMs,
    computeMs: measurements.computeMs,
    sampleCount: measurements.sampleCount,
    payloadBytes: measurements.payloadBytes,
    consumerDelayMs: measurements.renderDelayMs,
    rateLimitWaitMs: measurements.rateLimitWaitMs,
    interactionDelayMs: measurements.interactionDelayMs,
    stopReason: measurements.stopReason,
  })
}
