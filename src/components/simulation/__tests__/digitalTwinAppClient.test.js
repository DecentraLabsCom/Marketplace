/** @jest-environment jsdom */

import { createDigitalTwinAppClient } from '@decentralabs/digital-twin-app-protocol/client'

describe('high-level digital twin app client', () => {
  let hostWindow
  let originalParent
  let client

  beforeEach(() => {
    originalParent = Object.getOwnPropertyDescriptor(window, 'parent')
    hostWindow = { postMessage: jest.fn() }
    Object.defineProperty(window, 'parent', { configurable: true, value: hostWindow })
  })

  afterEach(() => {
    client?.dispose()
    client = null
    if (originalParent) Object.defineProperty(window, 'parent', originalParent)
  })

  function sendFromHost(data) {
    window.dispatchEvent(new MessageEvent('message', { data, source: hostWindow }))
  }

  function flush() {
    return new Promise((resolve) => window.setTimeout(resolve, 0))
  }

  function ready(options = {}) {
    client = createDigitalTwinAppClient(options)
    client.reportReady()
    sendFromHost({ type: 'decentralabs:digital-twin-host-ready', version: 1 })
    sendFromHost({ type: 'decentralabs:fmi-reset', version: 1, runId: 'run:1' })
  }

  function batch(runId = 'run:1', batchId = 'batch:1') {
    return { type: 'decentralabs:fmi-samples', version: 1, runId, batchId,
      firstSampleIndex: 0, lastSampleIndex: 1,
      samples: [{ time: 0, outputs: { speed: 1 } }, { time: 1, outputs: { speed: 2 } }] }
  }

  function completion(runId = 'run:1') {
    return { type: 'decentralabs:fmi-results-complete', version: 1, runId, sampleCount: 2, state: 'completed' }
  }

  test('reports readiness after the scene and host are both ready, inferring optional capabilities', () => {
    client = createDigitalTwinAppClient({
      onSamples: jest.fn(),
      onPlaybackRate: jest.fn(),
      playbackControlPosition: 'bottom-right',
    })

    client.reportReady()
    expect(hostWindow.postMessage).not.toHaveBeenCalled()

    sendFromHost({ type: 'decentralabs:digital-twin-host-ready', version: 1 })

    expect(hostWindow.postMessage).toHaveBeenCalledWith({
      type: 'decentralabs:digital-twin-ready',
      version: 1,
      capabilities: ['playback-rate', 'sample-acknowledgement'],
      playbackControlPosition: 'bottom-right',
    }, '*')
  })

  test('sends a high-level run request, resolves its run ID and acknowledges processed batches', async () => {
    const onSamples = jest.fn()
    const onSample = jest.fn()
    const onState = jest.fn()
    client = createDigitalTwinAppClient({ onSamples, onSample, onSimulationState: onState })
    client.reportReady()
    sendFromHost({ type: 'decentralabs:digital-twin-host-ready', version: 1 })

    const runPromise = client.run({
      parameters: { speed: 0.5 },
      options: { stopTime: 10 },
    })
    const request = hostWindow.postMessage.mock.calls
      .map(([message]) => message)
      .find((message) => message.type === 'decentralabs:fmi-run-request')
    expect(request).toMatchObject({
      version: 1,
      parameters: { speed: 0.5 },
      options: { stopTime: 10 },
    })

    sendFromHost({
      type: 'decentralabs:fmi-run-accepted',
      version: 1,
      requestId: request.requestId,
      runId: 'run:1',
    })
    await expect(runPromise).resolves.toEqual({ requestId: request.requestId, runId: 'run:1' })

    const batch = {
      type: 'decentralabs:fmi-samples',
      version: 1,
      runId: 'run:1',
      batchId: 'batch:1',
      firstSampleIndex: 0,
      lastSampleIndex: 0,
      samples: [{ time: 1, outputs: { speed: 2 } }],
    }
    sendFromHost(batch)
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    expect(onSamples).toHaveBeenCalledWith(batch.samples, batch, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(hostWindow.postMessage).toHaveBeenCalledWith({
      type: 'decentralabs:fmi-samples-ack',
      version: 1,
      runId: 'run:1',
      batchId: 'batch:1',
      lastSampleIndex: 0,
    }, '*')

    sendFromHost({
      type: 'decentralabs:fmi-sample',
      version: 1,
      runId: 'run:1',
      time: 1,
      outputs: { speed: 2 },
    })
    sendFromHost({
      type: 'decentralabs:fmi-simulation-state',
      version: 1,
      runId: 'run:1',
      state: 'completed',
    })
    await flush()
    expect(onSample).toHaveBeenCalledWith({ time: 1, outputs: { speed: 2 } }, expect.objectContaining({ runId: 'run:1', signal: expect.any(AbortSignal) }))
    expect(onState).toHaveBeenCalledWith('completed', expect.objectContaining({ runId: 'run:1' }))
  })

  test('rejects run promises with Marketplace rejection codes', async () => {
    client = createDigitalTwinAppClient()
    client.reportReady()
    sendFromHost({ type: 'decentralabs:digital-twin-host-ready', version: 1 })

    const runPromise = client.run()
    const request = hostWindow.postMessage.mock.calls
      .map(([message]) => message)
      .find((message) => message.type === 'decentralabs:fmi-run-request')
    sendFromHost({
      type: 'decentralabs:fmi-run-rejected',
      version: 1,
      requestId: request.requestId,
      code: 'INVALID_RUN_REQUEST',
    })

    await expect(runPromise).rejects.toMatchObject({ code: 'INVALID_RUN_REQUEST' })
  })

  test('ignores host messages delivered by any source other than the parent window', () => {
    const onHostReady = jest.fn()
    client = createDigitalTwinAppClient({ onHostReady })
    client.reportReady()
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'decentralabs:digital-twin-host-ready', version: 1 },
      source: window,
    }))

    expect(onHostReady).not.toHaveBeenCalled()
    expect(hostWindow.postMessage).not.toHaveBeenCalled()
  })
  test('delivers batches to onSample alone and acknowledges only after every asynchronous entry', async () => {
    let finishFirst
    const onSample = jest.fn().mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve }))
    ready({ onSample })
    sendFromHost(batch())
    await flush()
    expect(onSample).toHaveBeenCalledTimes(1)
    expect(hostWindow.postMessage.mock.calls.some(([m]) => m.type === 'decentralabs:fmi-samples-ack')).toBe(false)
    finishFirst()
    await flush()
    expect(onSample.mock.calls.map(([sample]) => sample.time)).toEqual([0, 1])
    expect(hostWindow.postMessage.mock.calls.some(([m]) => m.type === 'decentralabs:fmi-samples-ack')).toBe(true)
  })

  test('prefers onSamples without delivering duplicate entries to onSample', async () => {
    const onSamples = jest.fn()
    const onSample = jest.fn()
    ready({ onSamples, onSample })
    sendFromHost(batch())
    await flush()
    expect(onSamples).toHaveBeenCalledTimes(1)
    expect(onSample).not.toHaveBeenCalled()
  })

  test('reports computation immediately but waits for asynchronous processing before results complete', async () => {
    let finish
    const order = []
    ready({
      onSamples: () => new Promise((resolve) => { finish = () => { order.push('processed'); resolve() } }),
      onSimulationState: (state) => order.push(state),
      onResultsComplete: () => order.push('received'),
    })
    sendFromHost(batch())
    sendFromHost({ type: 'decentralabs:fmi-simulation-state', version: 1, runId: 'run:1', state: 'completed' })
    sendFromHost(completion())
    await flush()
    expect(order).toEqual(['completed'])
    finish()
    await flush()
    expect(order).toEqual(['completed', 'processed', 'received'])
  })

  test('aborts stale asynchronous work and queued notifications on reset without blocking the next run', async () => {
    let finishOld
    let oldContext
    const committed = []
    const onResultsComplete = jest.fn()
    ready({ onResultsComplete, onSamples: async (samples, message, context) => {
      if (message.runId === 'run:1') {
        oldContext = context
        await new Promise((resolve) => { finishOld = resolve })
      }
      if (!context.signal.aborted) committed.push(message.runId)
    } })
    sendFromHost(batch())
    sendFromHost(completion())
    await flush()
    sendFromHost({ type: 'decentralabs:fmi-reset', version: 1, runId: 'run:2' })
    expect(oldContext.signal.aborted).toBe(true)
    sendFromHost(batch('run:2', 'batch:2'))
    sendFromHost(completion('run:2'))
    await flush()
    expect(committed).toEqual(['run:2'])
    finishOld()
    await flush()
    expect(committed).toEqual(['run:2'])
    expect(onResultsComplete).toHaveBeenCalledTimes(1)
    const acknowledgements = hostWindow.postMessage.mock.calls.map(([m]) => m).filter((m) => m.type === 'decentralabs:fmi-samples-ack')
    expect(acknowledgements.map((m) => m.runId)).toEqual(['run:2'])
  })

  test('reports callback failures without acknowledging, finalizing or processing later batches', async () => {
    const error = new Error('Could not store results')
    const onError = jest.fn()
    const onSamples = jest.fn().mockRejectedValue(error)
    const onResultsComplete = jest.fn()
    ready({ onSamples, onError, onResultsComplete })
    sendFromHost(batch())
    sendFromHost(batch('run:1', 'batch:2'))
    sendFromHost(completion())
    await flush()
    expect(onError).toHaveBeenCalledWith(error)
    expect(onSamples).toHaveBeenCalledTimes(1)
    expect(onResultsComplete).not.toHaveBeenCalled()
    expect(hostWindow.postMessage.mock.calls.some(([m]) => m.type === 'decentralabs:fmi-samples-ack')).toBe(false)
  })

  test('disposal aborts in-flight processing and removes the listener', async () => {
    let finish
    let context
    const onSamples = jest.fn((_samples, _message, nextContext) => {
      context = nextContext
      return new Promise((resolve) => { finish = resolve })
    })
    ready({ onSamples })
    sendFromHost(batch())
    await flush()
    client.dispose()
    expect(context.signal.aborted).toBe(true)
    finish()
    sendFromHost(batch('run:2'))
    await flush()
    expect(onSamples).toHaveBeenCalledTimes(1)
    expect(hostWindow.postMessage.mock.calls.some(([m]) => m.type === 'decentralabs:fmi-samples-ack')).toBe(false)
  })

  test('ignores obsolete run messages after the host clears the active run', async () => {
    const onSamples = jest.fn()
    const onResultsComplete = jest.fn()
    ready({ onSamples, onResultsComplete })
    sendFromHost({ type: 'decentralabs:fmi-reset', version: 1, runId: null })
    sendFromHost(batch())
    sendFromHost(completion())
    await flush()
    expect(onSamples).not.toHaveBeenCalled()
    expect(onResultsComplete).not.toHaveBeenCalled()
  })

})
