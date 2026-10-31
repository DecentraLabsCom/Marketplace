import { fireEvent, render, screen } from '@testing-library/react'
import DigitalTwinExecutionControls from '../controls/DigitalTwinExecutionControls'

function makeProps(overrides = {}) {
  const onExecutionModeChange = jest.fn()
  const onAdvanceStep = jest.fn()
  const onToggleContinuous = jest.fn()
  return {
    executionMode: 'step',
    onExecutionModeChange,
    executionModes: ['batch', 'step', 'continuous'],
    running: false,
    status: 'paused',
    mode: 'step',
    simulationTime: 1.25,
    values: { speed: 2 },
    modelVariables: [{ name: 'speed', causality: 'input', type: 'Real', start: 1, min: 0, max: 5, description: 'Motor speed' }],
    runtimeVariables: [{ name: 'speed', causality: 'input', type: 'Real', start: 1, min: 0, max: 5, description: 'Motor speed' }],
    runtimeInputEditing: true,
    onInputChange: jest.fn(),
    onAdvanceStep,
    onToggleContinuous,
    onEnd: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  }
}

describe('DigitalTwinExecutionControls', () => {
  test('renders step controls and hides runtime edits while a step is in flight', () => {
    const props = makeProps()
    const { rerender } = render(<DigitalTwinExecutionControls {...props} />)

    expect(screen.getByLabelText('Execution mode')).toHaveValue('step')
    expect(screen.getByRole('button', { name: 'Advance one step' })).toBeEnabled()
    expect(screen.queryByLabelText('Motor speed')).not.toBeInTheDocument()
    expect(screen.getByText('t = 1.250 s')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Execution mode'), { target: { value: 'continuous' } })
    expect(props.onExecutionModeChange).toHaveBeenCalledWith('continuous')

    fireEvent.click(screen.getByRole('button', { name: 'Change variables' }))
    expect(screen.getByLabelText('Motor speed')).toBeEnabled()

    rerender(<DigitalTwinExecutionControls {...props} status="stepping" running runtimeInputEditing={false} />)

    expect(screen.getByLabelText('Execution mode')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Advancing…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Change variables' })).toBeDisabled()
    expect(screen.getByLabelText('Motor speed')).toBeDisabled()
  })

  test('offers pause while continuous execution is active', () => {
    const props = makeProps({ executionMode: 'continuous', mode: 'continuous', status: 'continuous', running: true })
    render(<DigitalTwinExecutionControls {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(props.onToggleContinuous).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'End session' })).toBeEnabled()
  })
})
