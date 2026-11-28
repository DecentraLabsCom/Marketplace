import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import SimulationGraphConfigurationDialog from '../digital-twin/SimulationGraphConfigurationDialog'

test('recommends dependent outputs for a selected input without hiding other outputs', async () => {
  render(
    <SimulationGraphConfigurationDialog
      isOpen
      onClose={jest.fn()}
      graphs={[{ id: 'graph-1', name: 'Graph 1', xVariable: '__simulation_time__', yVariables: ['position'] }]}
      selectedGraphId="graph-1"
      modelVariables={[
        { name: 'speed', causality: 'input', type: 'Float64' },
        { name: 'position', causality: 'output', type: 'Float64' },
        { name: 'temperature', causality: 'output', type: 'Float64' },
      ]}
      modelStructure={{ outputs: [{ name: 'position', dependencyNames: ['speed'] }] }}
      onSelectGraph={jest.fn()}
      onAddGraph={jest.fn()}
      onSaveGraph={jest.fn()}
      onDeleteGraph={jest.fn()}
    />,
  )

  const xAxis = await screen.findByLabelText('X axis')
  fireEvent.change(xAxis, { target: { value: 'speed' } })

  expect(await screen.findByText('Declared dependency on speed')).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /position/ })).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /temperature/ })).toBeInTheDocument()
})
