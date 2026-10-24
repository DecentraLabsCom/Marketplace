import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DigitalTwinAppViewer from '../DigitalTwinAppViewer'

describe('DigitalTwinAppViewer', () => {
  test('routes a versioned run request from the isolated app to Marketplace', () => {
    const onRunSimulation = jest.fn()
    render(
      <DigitalTwinAppViewer
        appUrl="/api/aas/digital-twin-app/42/abc/index.html"
        title="Smart Warehouse"
        results={{ time: [], outputs: {} }}
        modelVariables={[]}
        startTime={0}
        stopTime={250}
        stepSize={0.05}
        isRunning={false}
        onRunSimulation={onRunSimulation}
      />,
    )

    const iframe = screen.getByTitle('Smart Warehouse digital twin application')
    Object.defineProperty(iframe.contentWindow, 'postMessage', {
      configurable: true,
      value: jest.fn(),
    })
    fireEvent.load(iframe)

    const parameters = { robotSpeed: 0.9, jam: true }
    const options = { startTime: 0, stopTime: 40, stepSize: 0.05 }
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'decentralabs:fmi-run-request', version: 1, parameters, options },
      source: iframe.contentWindow,
    }))

    expect(onRunSimulation).toHaveBeenCalledTimes(1)
    expect(onRunSimulation).toHaveBeenCalledWith(parameters, options)

    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'decentralabs:fmi-run-request', version: 1, parameters, options },
      source: window,
    }))
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'decentralabs:fmi-run-request', version: 1, parameters: [], options },
      source: iframe.contentWindow,
    }))
    expect(onRunSimulation).toHaveBeenCalledTimes(1)
  })

  test('sends versioned FMI output samples to the isolated app only after it is ready', async () => {
    const results = {
      time: [0, 0.1],
      outputs: {
        agvPosition: [0, 2.72],
        ordersPicked: [0, 1],
        alarm: [false, true],
        jam: [false, true],
        undeclaredOutput: ['secret', 'ignored'],
      },
    }
    const modelVariables = [
      { name: 'agvPosition', causality: 'output' },
      { name: 'ordersPicked', causality: 'output' },
      { name: 'alarm', causality: 'output' },
      { name: 'packageOnAgv', causality: 'output', type: 'Boolean', start: 'false' },
      { name: 'truckLoadCount', causality: 'output', type: 'Integer', start: '0' },
      { name: 'jam', causality: 'input' },
    ]

    render(
      <DigitalTwinAppViewer
        appUrl="/api/aas/digital-twin-app/42/abc/index.html"
        title="Smart Warehouse"
        results={results}
        modelVariables={modelVariables}
      />,
    )

    const iframe = screen.getByTitle('Smart Warehouse digital twin application')
    const postMessage = jest.fn()
    Object.defineProperty(iframe.contentWindow, 'postMessage', {
      configurable: true,
      value: postMessage,
    })

    fireEvent.load(iframe)
    expect(postMessage).toHaveBeenCalledWith({
      type: 'decentralabs:digital-twin-host-ready',
      version: 1,
    }, '*')

    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'decentralabs:digital-twin-ready', version: 1 },
      source: iframe.contentWindow,
    }))

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({
        type: 'decentralabs:fmi-samples',
        version: 1,
        samples: [
          { time: 0, outputs: { agvPosition: 0, ordersPicked: 0, alarm: false, packageOnAgv: false, truckLoadCount: 0 } },
          { time: 0.1, outputs: { agvPosition: 2.72, ordersPicked: 1, alarm: true, packageOnAgv: false, truckLoadCount: 0 } },
        ],
      }, '*')
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  test('supports a message-only app and confirms result delivery after the last acknowledged batch', async () => {
    const times = Array.from({ length: 257 }, (_, index) => index)
    render(<DigitalTwinAppViewer
      appUrl="/api/aas/digital-twin-app/42/abc/index.html"
      title="Custom provider app"
      results={{ time: times, outputs: { speed: times } }}
      modelVariables={[{ name: 'speed', causality: 'output' }]}
      activeRunId="run:1"
      simulationState="completed"
      isRunning={false}
    />)
    const iframe = screen.getByTitle('Custom provider app digital twin application')
    const postMessage = jest.fn()
    Object.defineProperty(iframe.contentWindow, 'postMessage', { configurable: true, value: postMessage })
    const send = (data) => act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { version: 1, ...data }, source: iframe.contentWindow }))
    })
    const sent = (type) => postMessage.mock.calls.map(([message]) => message).filter((message) => message.type === type)
    fireEvent.load(iframe)
    send({ type: 'decentralabs:digital-twin-ready', capabilities: ['sample-acknowledgement'] })
    await waitFor(() => expect(sent('decentralabs:fmi-samples')).toHaveLength(1))
    expect(sent('decentralabs:fmi-simulation-state')).toContainEqual(expect.objectContaining({ state: 'completed' }))
    expect(sent('decentralabs:fmi-results-complete')).toHaveLength(0)
    const first = sent('decentralabs:fmi-samples')[0]
    send({ type: 'decentralabs:fmi-samples-ack', runId: first.runId, batchId: first.batchId, lastSampleIndex: first.lastSampleIndex - 1 })
    expect(sent('decentralabs:fmi-samples')).toHaveLength(1)
    send({ type: 'decentralabs:fmi-samples-ack', runId: first.runId, batchId: first.batchId, lastSampleIndex: first.lastSampleIndex })
    await waitFor(() => expect(sent('decentralabs:fmi-samples')).toHaveLength(2))
    expect(sent('decentralabs:fmi-results-complete')).toHaveLength(0)
    const last = sent('decentralabs:fmi-samples')[1]
    send({ type: 'decentralabs:fmi-samples-ack', runId: last.runId, batchId: last.batchId, lastSampleIndex: last.lastSampleIndex })
    await waitFor(() => expect(sent('decentralabs:fmi-results-complete')).toEqual([{
      type: 'decentralabs:fmi-results-complete', version: 1, runId: 'run:1', sampleCount: 257, state: 'completed',
    }]))
    send({ type: 'decentralabs:fmi-samples-ack', runId: last.runId, batchId: last.batchId, lastSampleIndex: last.lastSampleIndex })
    expect(sent('decentralabs:fmi-results-complete')).toHaveLength(1)
  })

  test('confirms unacknowledged result delivery without requiring a caller-supplied run ID', async () => {
    const times = Array.from({ length: 257 }, (_, index) => index)
    render(<DigitalTwinAppViewer
      appUrl="/custom/index.html" title="Direct messages"
      results={{ time: times, outputs: {} }} modelVariables={[]} isRunning={false}
    />)
    const iframe = screen.getByTitle('Direct messages digital twin application')
    const postMessage = jest.fn()
    Object.defineProperty(iframe.contentWindow, 'postMessage', { configurable: true, value: postMessage })
    fireEvent.load(iframe)
    act(() => window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'decentralabs:digital-twin-ready', version: 1 }, source: iframe.contentWindow,
    })))
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith({
      type: 'decentralabs:fmi-results-complete', version: 1, sampleCount: 257, state: 'completed',
    }, '*'))
    const types = postMessage.mock.calls.map(([message]) => message.type)
    expect(types.filter((type) => type === 'decentralabs:fmi-samples')).toHaveLength(2)
    expect(types.lastIndexOf('decentralabs:fmi-samples')).toBeLessThan(types.indexOf('decentralabs:fmi-results-complete'))
  })

})
