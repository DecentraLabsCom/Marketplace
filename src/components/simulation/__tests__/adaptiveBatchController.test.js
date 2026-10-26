import {
  createAdaptiveBatchController,
  observeAdaptiveBatch,
} from '@decentralabs/digital-twin-app-protocol/batch-controller'

function observe(controller, measurements) {
  const sampleCount = measurements.sampleCount ?? controller.sampleCount
  const computeMs = measurements.computeMs ?? (measurements.computeMsPerSample ?? 0.2) * sampleCount
  return observeAdaptiveBatch(controller, {
    responseMs: measurements.responseMs ?? measurements.fixedLatencyMs + computeMs,
    computeMs,
    sampleCount,
    payloadBytes: 0,
    consumerDelayMs: measurements.consumerDelayMs ?? 10,
    interactionDelayMs: measurements.interactionDelayMs,
  })
}

function createController(overrides = {}) {
  return createAdaptiveBatchController({
    startTime: 0,
    stopTime: 10_000,
    stepSize: 1,
    maxSamples: 500,
    targetResponseMs: 200,
    maxComputeMs: 50,
    presentationReserveMs: 10,
    safetyMarginMs: 20,
    ...overrides,
  })
}

test('keeps interaction latency diagnostic and does not let one slow input pin batches at one sample', () => {
  let controller = createController()

  for (let cycle = 0; cycle < 8; cycle += 1) {
    controller = observe(controller, { fixedLatencyMs: 20 })
  }
  expect(controller.sampleCount).toBe(250)

  controller = observe(controller, {
    responseMs: 70,
    computeMs: 50,
    sampleCount: 250,
    interactionDelayMs: 320,
  })
  for (let cycle = 0; cycle < 100; cycle += 1) {
    controller = observe(controller, { fixedLatencyMs: 20, computeMs: 50, sampleCount: 250 })
  }

  expect(controller.interactionDelayEwmaMs).toBe(320)
  expect(controller.sampleCount).toBe(250)
})

test('falls back to a network-relative budget when the response target is unreachable', () => {
  let controller = createController()

  for (let cycle = 0; cycle < 8; cycle += 1) {
    controller = observe(controller, { fixedLatencyMs: 220 })
  }

  expect(controller.targetReachable).toBe(false)
  expect(controller.sampleCount).toBe(250)
  expect(controller.batchConstraint).toBe('latency-unreachable')
})

test('marks the target unreachable when one sample alone exceeds the response budget', () => {
  const controller = observe(createController(), { responseMs: 330, computeMs: 300 })

  expect(controller.targetReachable).toBe(false)
  expect(controller.sampleCount).toBe(1)
  expect(controller.estimatedBatchResponseMs).toBeGreaterThan(200)
})
