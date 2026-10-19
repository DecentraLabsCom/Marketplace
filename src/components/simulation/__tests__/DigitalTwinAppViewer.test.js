import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import DigitalTwinAppViewer from '../DigitalTwinAppViewer'

describe('DigitalTwinAppViewer', () => {
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

    const iframe = screen.getByTitle('Smart Warehouse Three.js application')
    const postMessage = jest.fn()
    Object.defineProperty(iframe.contentWindow, 'postMessage', {
      configurable: true,
      value: postMessage,
    })

    fireEvent.load(iframe)

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({
        type: 'decentralabs:fmi-sample',
        version: 1,
        time: 0.1,
        outputs: { agvPosition: 2.72, ordersPicked: 1, alarm: true },
      }, '*')
    })
    expect(screen.getByText('Application ready')).toBeInTheDocument()
  })
})
