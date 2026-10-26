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
  }
}

export function observeInteractiveBatch(controller, { responseMs, renderDelayMs }) {
  return observeAdaptiveBatch(controller, { responseMs, consumerDelayMs: renderDelayMs })
}
