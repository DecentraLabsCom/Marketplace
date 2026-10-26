'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { connectFmuSession } from '@decentralabs/digital-twin-app-protocol/fmu-client'
import { normalizeSimulationParameters } from './simulationParameters'
import { getSimulationOptionsError, normalizeSimulationTimeOptions } from './simulationTime'

const MIN_RUNTIME_INPUT_UPDATE_INTERVAL_MS = 400

function sameParameterValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function getReadableOutputNames(modelVariables, access) {
  return modelVariables
    .filter((variable) => variable?.causality === 'output' && access?.variables?.[variable.name]?.read === true)
    .map((variable) => variable.name)
}

async function waitForRealtimeRetry(delayMs, signal) {
  if (!Number.isFinite(delayMs) || delayMs < 1 || delayMs > 10_000) {
    throw new Error('The FMU runtime returned an invalid retry delay.')
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, delayMs)
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason || new DOMException('The operation was aborted.', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}

async function requestRealtimeStep(session, payload, signal) {
  for (;;) {
    signal?.throwIfAborted()
    try {
      return await session.request('sim.step', 'sim.outputs', payload)
    } catch (error) {
      if (error?.code !== 'OUTPUT_READ_RATE_LIMITED') throw error
      await waitForRealtimeRetry(Number(error.retryAfterMs), signal)
    }
  }
}

export default function useInteractiveTwinExecution({
  labId,
  reservationKey,
  fetchGateway,
  options,
  parameters,
  modelVariables,
  editableVariables,
  runtimeVariables,
  variableAccess,
  variableAccessState,
  supported,
  onRunStart,
  onSample,
  onRunFinish,
  onParameterChange,
}) {
  const [status, setStatus] = useState('idle')
  const [mode, setMode] = useState(null)
  const [simulationTime, setSimulationTime] = useState(0)
  const [liveParameters, setLiveParameters] = useState({})

  const sessionRef = useRef(null)
  const controllerRef = useRef(null)
  const stepInFlightRef = useRef(false)
  const continuousRequestedRef = useRef(false)
  const endAfterStepRef = useRef(false)
  const simulationTimeRef = useRef(0)
  const liveParametersRef = useRef({})
  const appliedRuntimeParametersRef = useRef({})
  const lastRuntimeInputUpdateAtRef = useRef(0)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      sessionRef.current?.close()
      sessionRef.current = null
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [])

  const appendSample = useCallback((time, outputs) => {
    onSample(time, outputs)
  }, [onSample])

  const finishSession = useCallback((nextState, message = null, controller = controllerRef.current) => {
    if (!controller || controllerRef.current !== controller) return false

    continuousRequestedRef.current = false
    endAfterStepRef.current = false
    sessionRef.current?.close()
    sessionRef.current = null
    controllerRef.current = null
    stepInFlightRef.current = false

    if (!mountedRef.current) return true
    setMode(null)
    setStatus(nextState === 'completed' ? 'completed' : nextState === 'cancelled' ? 'cancelled' : 'error')
    onRunFinish({ state: nextState, message, parameters: liveParametersRef.current })
    return true
  }, [onRunFinish])

  const advanceStep = useCallback(async ({ continuous = false } = {}) => {
    const session = sessionRef.current
    const controller = controllerRef.current
    if (!session || !controller || controller.signal.aborted || stepInFlightRef.current) return false

    const ensureCurrentSession = () => {
      controller.signal.throwIfAborted()
      if (controllerRef.current !== controller || sessionRef.current !== session) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
    }

    stepInFlightRef.current = true
    if (!continuous && mountedRef.current) setStatus('stepping')
    try {
      const getChangedRuntimeValues = () => {
        const runtimeValues = Object.fromEntries(runtimeVariables.flatMap((variable) => {
          const value = liveParametersRef.current[variable.name]
          return value === '' || value === null || value === undefined ? [] : [[variable.name, value]]
        }))
        const normalizedRuntimeValues = normalizeSimulationParameters(runtimeValues, modelVariables)
        const appliedValues = appliedRuntimeParametersRef.current
        return Object.fromEntries(Object.entries(normalizedRuntimeValues).filter(([name, value]) => (
          !Object.prototype.hasOwnProperty.call(appliedValues, name) || !sameParameterValue(appliedValues[name], value)
        )))
      }

      let changedValues = getChangedRuntimeValues()
      if (Object.keys(changedValues).length > 0) {
        const waitMs = MIN_RUNTIME_INPUT_UPDATE_INTERVAL_MS - (Date.now() - lastRuntimeInputUpdateAtRef.current)
        if (waitMs > 0) await waitForRealtimeRetry(waitMs, controller.signal)
        ensureCurrentSession()
        changedValues = getChangedRuntimeValues()
        if (Object.keys(changedValues).length > 0) {
          await session.request('sim.setInputs', 'sim.inputs.updated', { values: changedValues })
          ensureCurrentSession()
          appliedRuntimeParametersRef.current = { ...appliedRuntimeParametersRef.current, ...changedValues }
          lastRuntimeInputUpdateAtRef.current = Date.now()
        }
      }

      const currentTime = simulationTimeRef.current
      const stopTime = Number(options.stopTime)
      const stepSize = Number(options.stepSize)
      const remainingTime = stopTime - currentTime
      if (!Number.isFinite(remainingTime) || remainingTime <= 1e-12) {
        finishSession('completed')
        return false
      }
      const deltaT = Math.min(stepSize, remainingTime)
      const response = await requestRealtimeStep(session, {
        currentCommunicationPoint: currentTime,
        deltaT,
      }, controller.signal)
      ensureCurrentSession()
      const nextTime = Number(response.simTime ?? response.time)
      if (!Number.isFinite(nextTime) || nextTime <= currentTime || nextTime > stopTime + Math.max(1e-9, Math.abs(stepSize) * 1e-7)) {
        throw new Error('The FMU returned an invalid simulation time for the requested step.')
      }
      simulationTimeRef.current = nextTime
      if (mountedRef.current) setSimulationTime(nextTime)
      appendSample(nextTime, response.values || response.outputs || {})

      if (nextTime >= stopTime - 1e-12 || response.terminated === true || response.finished === true) {
        finishSession('completed')
        return false
      }
      if (endAfterStepRef.current) {
        finishSession('completed')
        return false
      }
      if (!continuous && mountedRef.current) setStatus('paused')
      return true
    } catch (error) {
      const wasCancelled = controller.signal.aborted || error?.name === 'AbortError'
      finishSession(wasCancelled ? 'cancelled' : 'error', error?.message, controller)
      return false
    } finally {
      stepInFlightRef.current = false
    }
  }, [appendSample, finishSession, modelVariables, options.stepSize, options.stopTime, runtimeVariables])

  const startContinuous = useCallback(async () => {
    if (!sessionRef.current || continuousRequestedRef.current) return
    continuousRequestedRef.current = true
    endAfterStepRef.current = false
    if (mountedRef.current) setStatus('continuous')
    while (continuousRequestedRef.current && sessionRef.current) {
      const canContinue = await advanceStep({ continuous: true })
      if (!canContinue) break
    }
    if (sessionRef.current && !continuousRequestedRef.current && mountedRef.current) setStatus('paused')
  }, [advanceStep])

  const pauseContinuous = useCallback(() => {
    continuousRequestedRef.current = false
    if (mountedRef.current) setStatus(stepInFlightRef.current ? 'pausing' : 'paused')
  }, [])

  const end = useCallback(() => {
    if (!sessionRef.current) {
      const controller = controllerRef.current
      if (controller) controller.abort()
      finishSession('cancelled')
      return
    }
    continuousRequestedRef.current = false
    if (stepInFlightRef.current) {
      endAfterStepRef.current = true
      if (mountedRef.current) setStatus('stopping')
      return
    }
    finishSession('completed')
  }, [finishSession])

  const start = useCallback(async (requestedMode) => {
    if (!supported) {
      onRunFinish({ state: 'error', message: 'Interactive execution is available for reserved FMI 2/3 Co-Simulation digital twins.' })
      return
    }
    if (variableAccessState !== 'ready' || !variableAccess) {
      onRunFinish({ state: 'error', message: 'Variable access is not ready for this reservation.' })
      return
    }
    const optionsError = getSimulationOptionsError(options, { includeStepSize: true })
    if (optionsError) {
      onRunFinish({ state: 'error', message: optionsError })
      return
    }
    if (controllerRef.current) return

    continuousRequestedRef.current = false
    endAfterStepRef.current = false
    stepInFlightRef.current = false
    const controller = new AbortController()
    controllerRef.current = controller
    const ensureCurrentRun = () => {
      controller.signal.throwIfAborted()
      if (controllerRef.current !== controller) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
    }
    onRunStart()
    if (mountedRef.current) {
      setMode(requestedMode)
      setStatus('connecting')
    }

    liveParametersRef.current = { ...parameters }
    if (mountedRef.current) setLiveParameters(liveParametersRef.current)

    try {
      const initialValues = Object.fromEntries(Object.entries(parameters).filter(([name, value]) => (
        editableVariables.some((variable) => variable.name === name)
        && value !== '' && value !== null && value !== undefined
      )))
      const normalizedParameters = normalizeSimulationParameters(initialValues, modelVariables)
      const activeOptions = normalizeSimulationTimeOptions(options, { includeStepSize: true })
      const runtimeDisplayValues = { ...parameters }
      for (const variable of runtimeVariables) {
        if ((runtimeDisplayValues[variable.name] === undefined || runtimeDisplayValues[variable.name] === '') && variable.start !== undefined) {
          runtimeDisplayValues[variable.name] = variable.start
        }
      }
      liveParametersRef.current = runtimeDisplayValues
      if (mountedRef.current) {
        setLiveParameters(runtimeDisplayValues)
        setSimulationTime(activeOptions.startTime)
      }
      simulationTimeRef.current = activeOptions.startTime
      lastRuntimeInputUpdateAtRef.current = 0
      appliedRuntimeParametersRef.current = Object.fromEntries(Object.entries(normalizedParameters).filter(([name]) => (
        runtimeVariables.some((variable) => variable.name === name)
      )))

      const connectionResponse = await fetchGateway('/api/simulations/connection', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labId, reservationKey }),
      })
      ensureCurrentRun()
      if (!connectionResponse.ok) {
        const payload = await connectionResponse.json().catch(() => ({}))
        throw new Error(payload.error || `The FMU session could not be authorized (${connectionResponse.status}).`)
      }
      const connection = await connectionResponse.json()
      ensureCurrentRun()
      const session = await connectFmuSession(connection, { signal: controller.signal })
      if (controller.signal.aborted || controllerRef.current !== controller) {
        session.close()
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
      sessionRef.current = session
      await session.request('sim.initialize', 'sim.state', {
        parameters: normalizedParameters,
        options: { ...activeOptions, timeMode: 'external' },
      })
      ensureCurrentRun()

      const readableOutputNames = getReadableOutputNames(modelVariables, variableAccess)
      let initialOutputs = {}
      let initialTime = activeOptions.startTime
      if (readableOutputNames.length > 0) {
        const initial = await session.request('sim.getOutputs', 'sim.outputs', { variables: readableOutputNames })
        ensureCurrentRun()
        initialOutputs = initial.values || {}
        if (Number.isFinite(Number(initial.simTime))) initialTime = Number(initial.simTime)
      }
      simulationTimeRef.current = initialTime
      if (mountedRef.current) {
        setSimulationTime(initialTime)
        setStatus('paused')
      }
      appendSample(initialTime, initialOutputs)
      if (requestedMode === 'continuous') void startContinuous()
    } catch (error) {
      const wasCancelled = controller.signal.aborted || error?.name === 'AbortError'
      finishSession(wasCancelled ? 'cancelled' : 'error', error?.message, controller)
    }
  }, [appendSample, editableVariables, fetchGateway, finishSession, labId, modelVariables, onRunFinish, onRunStart, options, parameters, reservationKey, runtimeVariables, startContinuous, supported, variableAccess, variableAccessState])

  const handleInputChange = useCallback((name, value) => {
    if (sessionRef.current) {
      if (!runtimeVariables.some((variable) => variable.name === name)) return
      const next = { ...liveParametersRef.current, [name]: value }
      liveParametersRef.current = next
      if (mountedRef.current) setLiveParameters(next)
      return
    }
    onParameterChange(name, value)
  }, [onParameterChange, runtimeVariables])

  const hasActiveSession = ['connecting', 'paused', 'stepping', 'continuous', 'pausing', 'stopping'].includes(status)
  const runtimeInputEditing = ['paused', 'continuous', 'pausing'].includes(status)

  return {
    status,
    mode,
    simulationTime,
    liveParameters,
    hasActiveSession,
    runtimeInputEditing,
    start,
    advanceStep,
    startContinuous,
    pauseContinuous,
    end,
    handleInputChange,
  }
}
