import { act, renderHook, waitFor } from '@testing-library/react'
import { connectFmuSession } from '@decentralabs/digital-twin-app-protocol/fmu-client'
import useInteractiveTwinExecution from '../useInteractiveTwinExecution'

jest.mock('@decentralabs/digital-twin-app-protocol/fmu-client', () => ({
  connectFmuSession: jest.fn(),
}))

const inputVariable = { name: 'speed', causality: 'input', type: 'Real', start: 1 }
const outputVariable = { name: 'position', causality: 'output', type: 'Real' }

function makeSession(stepResponse, advanceResponse) {
  return {
    capabilities: { advanceSamples: true, advanceComputeBudget: true, advanceSampleSequences: true },
    close: jest.fn(),
    request: jest.fn(async (type, _expectedType, payload) => {
      if (type === 'sim.getOutputs') return { simTime: 0, values: { position: 0 } }
      if (type === 'sim.step') {
        return stepResponse
          ? stepResponse(payload)
          : { simTime: payload.currentCommunicationPoint + payload.deltaT, values: { position: 1 } }
      }
      if (type === 'sim.advance') {
        return advanceResponse
          ? advanceResponse(payload)
          : {
            simTime: payload.targetTime,
            samples: [{ time: payload.targetTime, outputs: { position: 1 }, sequence: Math.round(payload.targetTime) }],
            finished: payload.targetTime >= 2,
            stopReason: payload.targetTime >= 2 ? 'simulation_finished' : 'target_reached',
            stepsExecuted: 1,
            inputEventsApplied: 0,
            samplesReturned: 1,
            sampleBytes: 48,
            computeMs: 1,
            computeBudgetOverrunMs: 0,
            maxComputeMs: payload.maxComputeMs,
          }
      }
      return {}
    }),
  }
}

function setup({ session = makeSession(), variableAccessState = 'ready', variableAccess = { variables: { position: { read: true } } } } = {}) {
  connectFmuSession.mockResolvedValue(session)
  const callbacks = {
    onRunStart: jest.fn(),
    onSample: jest.fn(),
    onRunFinish: jest.fn(),
    onParameterChange: jest.fn(),
  }
  const getConnection = jest.fn(async () => ({ sessionTicket: 'ticket' }))
  const hook = renderHook(() => useInteractiveTwinExecution({
    getConnection,
    options: { startTime: 0, stopTime: 2, stepSize: 1 },
    parameters: {},
    modelVariables: [inputVariable, outputVariable],
    editableVariables: [inputVariable],
    runtimeVariables: [inputVariable],
    variableAccess,
    variableAccessState,
    supported: true,
    ...callbacks,
  }))
  return { ...hook, callbacks, getConnection, session }
}

describe('useInteractiveTwinExecution', () => {
  beforeEach(() => jest.clearAllMocks())

  test('step mode applies edited runtime inputs before the next communication step', async () => {
    let attempts = 0
    const session = makeSession((payload) => {
      attempts += 1
      if (attempts === 1) {
        const error = new Error('Output sampling is rate limited')
        error.code = 'OUTPUT_READ_RATE_LIMITED'
        error.retryAfterMs = 1
        throw error
      }
      return { simTime: payload.currentCommunicationPoint + payload.deltaT, values: { position: 1 } }
    })
    const { result, callbacks, getConnection } = setup({ session })

    await act(async () => result.current.start('step'))
    expect(result.current.status).toBe('paused')
    expect(getConnection).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) })

    act(() => result.current.handleInputChange('speed', 3))
    await act(async () => {
      await expect(result.current.advanceStep()).resolves.toBe(true)
    })

    const requestTypes = session.request.mock.calls.map(([type]) => type)
    expect(requestTypes).toEqual(['sim.initialize', 'sim.getOutputs', 'sim.setInputs', 'sim.step', 'sim.step'])
    expect(session.request.mock.calls[2][2]).toEqual({ values: { speed: 3 } })
    expect(session.request.mock.calls[3][2]).toEqual({ currentCommunicationPoint: 0, deltaT: 1 })
    expect(result.current.status).toBe('paused')
    expect(result.current.simulationTime).toBe(1)
    expect(callbacks.onSample).toHaveBeenNthCalledWith(2, 1, { position: 1 })
    expect(callbacks.onParameterChange).not.toHaveBeenCalled()

    act(() => result.current.end())
    expect(result.current.status).toBe('completed')
    expect(session.close).toHaveBeenCalledTimes(1)
    expect(callbacks.onRunFinish).toHaveBeenCalledWith({ state: 'completed', message: null, parameters: { speed: 3 } })
  })

  test('continuous mode advances in batches until the configured stop time', async () => {
    const session = makeSession()
    const { result, callbacks } = setup({ session })

    await act(async () => result.current.start('continuous'))
    await waitFor(() => expect(result.current.status).toBe('completed'))

    const initializeCall = session.request.mock.calls.find(([type]) => type === 'sim.initialize')
    expect(initializeCall[2].options.timeMode).toBe('simtime')
    const advanceCalls = session.request.mock.calls.filter(([type]) => type === 'sim.advance')
    expect(advanceCalls.map(([, , payload]) => payload.targetTime)).toEqual([1, 2])
    expect(advanceCalls.map(([, , payload]) => payload.maxSamples)).toEqual([1, 2])
    expect(advanceCalls.map(([, , payload]) => payload.stepSize)).toEqual([1, 1])
    expect(advanceCalls.map(([, , payload]) => payload.maxComputeMs)).toEqual([50, 50])
    expect(callbacks.onRunFinish).toHaveBeenCalledWith({ state: 'completed', message: null, parameters: { speed: 1 } })
    expect(session.close).toHaveBeenCalledTimes(1)
  })

  test('does not open a runtime session before variable access is ready', async () => {
    const { result, callbacks, getConnection } = setup({ variableAccessState: 'loading', variableAccess: null })

    await act(async () => result.current.start('step'))

    expect(getConnection).not.toHaveBeenCalled()
    expect(connectFmuSession).not.toHaveBeenCalled()
    expect(callbacks.onRunStart).not.toHaveBeenCalled()
    expect(callbacks.onRunFinish).toHaveBeenCalledWith({
      state: 'error',
      message: 'Variable access is not ready for this reservation.',
    })
  })
})
