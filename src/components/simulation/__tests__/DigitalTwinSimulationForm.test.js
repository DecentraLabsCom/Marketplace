import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import DigitalTwinSimulationForm from '../DigitalTwinSimulationForm'

describe('DigitalTwinSimulationForm', () => {
  test('builds Smart Warehouse controls from FMI variables and runs with the declared simulation interval', () => {
    const variables = [
      {
        name: 'robotSpeed',
        causality: 'input',
        type: 'Real',
        start: '0.68',
        min: 0,
        max: 1.4,
        unit: 'm_per_s',
        description: 'AGV travel speed for outbound and return trips.',
      },
      { name: 'startStop', causality: 'input', type: 'Boolean', start: 'true', description: 'Start or pause warehouse operations.' },
      { name: 'jam', causality: 'input', type: 'Boolean', start: 'false', description: 'Inject a safety stop and raise the warehouse alarm.' },
      { name: 'rushOrder', causality: 'input', type: 'Boolean', start: 'false', description: 'Prioritize the next outbound AGV trip.' },
      { name: 'orderQuantity', causality: 'input', type: 'Integer', start: '6', min: 1, max: 6, description: 'Packages to load into the truck.' },
    ]
    const values = { robotSpeed: 0.68, startStop: true, jam: false, rushOrder: false, orderQuantity: 6 }
    const onRun = jest.fn()

    render(
      <DigitalTwinSimulationForm
        variables={variables}
        modelVariables={variables}
        values={values}
        onInputChange={jest.fn()}
        simulationOptions={{ startTime: 0, stopTime: 250, stepSize: 0.05 }}
        onSimulationOptionChange={jest.fn()}
        simulationType="CoSimulation"
        inputEvents={[]}
        onInputEventsChange={jest.fn()}
        onRun={onRun}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Run Controls/ }))

    expect(screen.getByLabelText(variables[0].description)).toHaveAttribute('type', 'range')
    expect(screen.getByLabelText(variables[1].description)).toHaveAttribute('type', 'checkbox')
    expect(screen.getByLabelText(variables[2].description)).toHaveAttribute('type', 'checkbox')
    expect(screen.getByLabelText(variables[3].description)).toHaveAttribute('type', 'checkbox')
    expect(screen.getByLabelText(variables[4].description)).toHaveAttribute('type', 'range')
    expect(screen.getByLabelText('Start Time (s)')).toHaveValue(0)
    expect(screen.getByLabelText('Stop Time (s)')).toHaveValue(250)
    expect(screen.getByLabelText('Step Size (s)')).toHaveValue(0.05)

    fireEvent.click(screen.getByRole('button', { name: 'Run simulation' }))
    expect(onRun).toHaveBeenCalledWith([])
  })

  test('interactive modes do not expose scheduled batch changes and can start despite an unused schedule', () => {
    const variables = [{ name: 'speed', causality: 'input', type: 'Real', start: '1' }]
    const onRun = jest.fn()

    render(
      <DigitalTwinSimulationForm
        variables={variables}
        modelVariables={variables}
        values={{ speed: 1 }}
        onInputChange={jest.fn()}
        simulationOptions={{ startTime: 0, stopTime: 10, stepSize: 1 }}
        onSimulationOptionChange={jest.fn()}
        simulationType="CoSimulation"
        executionMode="step"
        inputEvents={[{ time: 20, values: { speed: 2 } }]}
        onInputEventsChange={jest.fn()}
        onRun={onRun}
      />,
    )

    expect(screen.queryByRole('button', { name: /Schedule changes/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start step-by-step' }))
    expect(onRun).toHaveBeenCalledWith([{ time: 20, values: { speed: 2 } }])
  })

  test('can hide the form run button when interactive execution owns start and stop controls', () => {
    render(
      <DigitalTwinSimulationForm
        variables={[]}
        modelVariables={[]}
        values={{}}
        onInputChange={jest.fn()}
        simulationOptions={{ startTime: 0, stopTime: 10, stepSize: 1 }}
        onSimulationOptionChange={jest.fn()}
        simulationType="CoSimulation"
        executionMode="continuous"
        showRunButton={false}
        onRun={jest.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Start continuous' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Run Controls/ })).toBeInTheDocument()
  })
})
