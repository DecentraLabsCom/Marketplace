import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import DigitalTwinViewer from '../DigitalTwinViewer'

jest.mock('next/dynamic', () => {
  const ReactModule = require('react')
  return {
    __esModule: true,
    default: () => (props) => ReactModule.createElement(
      'div',
      {
        'data-testid': 'digital-twin-canvas',
        'data-values': JSON.stringify(props.values),
        'data-editing-enabled': String(props.inputEditingEnabled),
        'data-input-variables': JSON.stringify(props.interactiveInputVariables.map(({ name }) => name)),
      },
      ReactModule.createElement('button', {
        type: 'button',
        onClick: () => props.onInputChange('gatePosition', 3),
      }, 'Move bound object'),
    ),
  }
})

describe('DigitalTwinViewer scene input bindings', () => {
  test('combines the displayed output sample with editable inputs and forwards scene changes', () => {
    const onInputChange = jest.fn()
    render(
      <DigitalTwinViewer
        sceneUrl="/scene.glb"
        results={{ time: [0], outputs: { distance: [12] } }}
        modelVariables={[
          { name: 'gatePosition', causality: 'input', type: 'Real' },
          { name: 'distance', causality: 'output', type: 'Real' },
        ]}
        inputValues={{ gatePosition: 2 }}
        interactiveInputVariables={[{ name: 'gatePosition', causality: 'input', type: 'Real' }]}
        inputEditingEnabled
        onInputChange={onInputChange}
      />,
    )

    const canvas = screen.getByTestId('digital-twin-canvas')
    expect(canvas).toHaveAttribute('data-values', JSON.stringify({ distance: 12, gatePosition: 2 }))
    expect(canvas).toHaveAttribute('data-editing-enabled', 'true')
    expect(canvas).toHaveAttribute('data-input-variables', '["gatePosition"]')

    fireEvent.click(screen.getByRole('button', { name: 'Move bound object' }))
    expect(onInputChange).toHaveBeenCalledWith('gatePosition', 3)
  })

})
