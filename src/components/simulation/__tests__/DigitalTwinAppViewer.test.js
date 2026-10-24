import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
