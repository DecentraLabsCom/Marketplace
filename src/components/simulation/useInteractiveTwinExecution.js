'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { connectFmuSession } from '@decentralabs/digital-twin-app-protocol/fmu-client'
import { normalizeSimulationParameters } from './simulationParameters'
import { getSimulationOptionsError, normalizeSimulationTimeOptions } from './simulationTime'
import {
  createInteractiveBatchController,
  getInteractiveBatchPlan,
  observeInteractiveBatch,
} from './interactiveBatchController'

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

async function requestRealtimeOperation(session, type, expectedType, payload, signal, onRequestAttempt) {
  for (;;) {
    signal?.throwIfAborted()
    const requestStartedAt = performance.now()
    try {
      const response = await session.request(type, expectedType, payload)
      onRequestAttempt?.(performance.now() - requestStartedAt)
      return response
    } catch (error) {
      onRequestAttempt?.(performance.now() - requestStartedAt)
      if (error?.code !== 'OUTPUT_READ_RATE_LIMITED') throw error
      await waitForRealtimeRetry(Number(error.retryAfterMs), signal)
    }
  }
}

export default function useInteractiveTwinExecution({
  getConnection,
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
  onSamples,
  onRunFinish,
  onParameterChange,
}) {
  const [status, setStatus] = useState('idle')
  const [mode, setMode] = useState(null)
  const [simulationTime, setSimulationTime] = useState(0)
  const [liveParameters, setLiveParameters] = useState({})
  const [batchMetrics, setBatchMetrics] = useState(null)

  const sessionRef = useRef(null)
  const controllerRef = useRef(null)
  const advanceInFlightRef = useRef(false)
  const continuousRequestedRef = useRef(false)
  const endAfterAdvanceRef = useRef(false)
  const simulationTimeRef = useRef(0)
  const latestSampleIndexRef = useRef(-1)
  const latestBatchReceivedAtRef = useRef(null)
  const renderedSampleIndexRef = useRef(-1)
  const observedRenderedSampleIndexRef = useRef(-1)
  const renderDelayRef = useRef(null)
  const batchControllerRef = useRef(null)
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

  const appendSamples = useCallback((samples) => {
    if (!Array.isArray(samples) || samples.length === 0) return
    latestSampleIndexRef.current += samples.length
    latestBatchReceivedAtRef.current = performance.now()
    if (typeof onSamples === 'function') {
      onSamples(samples)
      return
    }
    for (const sample of samples) onSample?.(sample.time, sample.outputs)
  }, [onSample, onSamples])

  const reportDisplayedSample = useCallback((sampleIndex, frameTime) => {
    const displayedIndex = Number(sampleIndex)
    if (!Number.isFinite(displayedIndex)) return
    if (displayedIndex < latestSampleIndexRef.current || latestBatchReceivedAtRef.current === null) return

    const renderedAt = Number.isFinite(frameTime) ? frameTime : performance.now()
    const renderDelayMs = Math.max(0, renderedAt - latestBatchReceivedAtRef.current)
    renderedSampleIndexRef.current = latestSampleIndexRef.current
    latestBatchReceivedAtRef.current = null
    renderDelayRef.current = renderDelayMs
    if (mountedRef.current) {
      setBatchMetrics((current) => current ? { ...current, renderDelayMs } : current)
    }
  }, [])

  const finishSession = useCallback((nextState, message = null, controller = controllerRef.current) => {
    if (!controller || controllerRef.current !== controller) return false

    continuousRequestedRef.current = false
    endAfterAdvanceRef.current = false
    batchControllerRef.current = null
    sessionRef.current?.close()
    sessionRef.current = null
    controllerRef.current = null
    advanceInFlightRef.current = false

    if (!mountedRef.current) return true
    setMode(null)
    setStatus(nextState === 'completed' ? 'completed' : nextState === 'cancelled' ? 'cancelled' : 'error')
    onRunFinish({ state: nextState, message, parameters: liveParametersRef.current })
    return true
  }, [onRunFinish])

  const advanceStep = useCallback(async ({ continuous = false } = {}) => {
    const session = sessionRef.current
    const controller = controllerRef.current
    if (!session || !controller || controller.signal.aborted || advanceInFlightRef.current) return false

    const ensureCurrentSession = () => {
      controller.signal.throwIfAborted()
      if (controllerRef.current !== controller || sessionRef.current !== session) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
    }

    advanceInFlightRef.current = true
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

      if (continuous) {
        const batchController = batchControllerRef.current
        if (!batchController) throw new Error('The continuous batch controller is unavailable.')
        const plan = getInteractiveBatchPlan(batchController, currentTime, stopTime, stepSize)
        let responseLatencyMs = 0
        const response = await requestRealtimeOperation(session, 'sim.advance', 'sim.samples', {
          targetTime: plan.targetTime,
          maxSamples: plan.maxSamples,
          stepSize,
        }, controller.signal, (attemptMs) => { responseLatencyMs += attemptMs })
        ensureCurrentSession()

        const samples = response.samples
        const nextTime = Number(response.simTime)
        const tolerance = Math.max(1e-9, Math.abs(stepSize) * 1e-7)
        if (!Array.isArray(samples) || samples.length < 1 || samples.length > plan.maxSamples
          || !Number.isFinite(nextTime) || nextTime <= currentTime || nextTime > plan.targetTime + tolerance) {
          throw new Error('The FMU returned an invalid sample batch for the requested advance.')
        }
        let previousTime = currentTime
        for (const sample of samples) {
          const sampleTime = Number(sample?.time)
          if (!Number.isFinite(sampleTime) || sampleTime <= previousTime || sampleTime > nextTime + tolerance
            || !sample.outputs || typeof sample.outputs !== 'object' || Array.isArray(sample.outputs)) {
            throw new Error('The FMU returned an invalid timeline in the sample batch.')
          }
          previousTime = sampleTime
        }
        if (Math.abs(previousTime - nextTime) > tolerance) {
          throw new Error('The FMU returned an incomplete timeline for the requested advance.')
        }

        simulationTimeRef.current = nextTime
        if (mountedRef.current) setSimulationTime(nextTime)
        appendSamples(samples)

        const hasFreshRenderDelay = renderedSampleIndexRef.current > observedRenderedSampleIndexRef.current
        const renderDelayMs = hasFreshRenderDelay ? renderDelayRef.current : null
        if (hasFreshRenderDelay) observedRenderedSampleIndexRef.current = renderedSampleIndexRef.current

        const nextController = observeInteractiveBatch(batchController, {
          responseMs: responseLatencyMs,
          renderDelayMs,
        })
        batchControllerRef.current = nextController
        if (mountedRef.current) {
          setBatchMetrics({
            responseMs: nextController.responseEwmaMs,
            renderDelayMs: nextController.consumerDelayEwmaMs,
            simulationDelta: nextTime - currentTime,
            nextBatchSamples: nextController.sampleCount,
            samples: samples.length,
          })
        }

        if (nextTime >= stopTime - 1e-12 || response.finished === true) {
          finishSession('completed')
          return false
        }
        if (endAfterAdvanceRef.current) {
          finishSession('completed')
          return false
        }
        return true
      }

      const deltaT = Math.min(stepSize, remainingTime)
      const response = await requestRealtimeOperation(session, 'sim.step', 'sim.outputs', {
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
      appendSamples([{ time: nextTime, outputs: response.values || response.outputs || {} }])

      if (nextTime >= stopTime - 1e-12 || response.terminated === true || response.finished === true) {
        finishSession('completed')
        return false
      }
      if (endAfterAdvanceRef.current) {
        finishSession('completed')
        return false
      }
      if (mountedRef.current) setStatus('paused')
      return true
    } catch (error) {
      const wasCancelled = controller.signal.aborted || error?.name === 'AbortError'
      finishSession(wasCancelled ? 'cancelled' : 'error', error?.message, controller)
      return false
    } finally {
      advanceInFlightRef.current = false
    }
  }, [appendSamples, finishSession, modelVariables, options.stepSize, options.stopTime, runtimeVariables])

  const startContinuous = useCallback(async () => {
    if (!sessionRef.current || continuousRequestedRef.current) return
    continuousRequestedRef.current = true
    endAfterAdvanceRef.current = false
    if (mountedRef.current) setStatus('continuous')
    while (continuousRequestedRef.current && sessionRef.current) {
      const canContinue = await advanceStep({ continuous: true })
      if (!canContinue) break
    }
    if (sessionRef.current && !continuousRequestedRef.current && mountedRef.current) setStatus('paused')
  }, [advanceStep])

  const pauseContinuous = useCallback(() => {
    continuousRequestedRef.current = false
    if (mountedRef.current) setStatus(advanceInFlightRef.current ? 'pausing' : 'paused')
  }, [])

  const end = useCallback(() => {
    if (!sessionRef.current) {
      const controller = controllerRef.current
      if (controller) controller.abort()
      finishSession('cancelled')
      return
    }
    continuousRequestedRef.current = false
    if (advanceInFlightRef.current) {
      endAfterAdvanceRef.current = true
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
    endAfterAdvanceRef.current = false
    advanceInFlightRef.current = false
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
      batchControllerRef.current = requestedMode === 'continuous'
        ? createInteractiveBatchController({
          startTime: activeOptions.startTime,
          stopTime: activeOptions.stopTime,
          stepSize: activeOptions.stepSize,
        })
        : null
      latestSampleIndexRef.current = -1
      latestBatchReceivedAtRef.current = null
      renderedSampleIndexRef.current = -1
      observedRenderedSampleIndexRef.current = -1
      renderDelayRef.current = null
      if (mountedRef.current) setBatchMetrics(null)

      const connection = await getConnection({ signal: controller.signal })
      ensureCurrentRun()
      const session = await connectFmuSession(connection, { signal: controller.signal })
      if (controller.signal.aborted || controllerRef.current !== controller) {
        session.close()
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
      sessionRef.current = session
      if (requestedMode === 'continuous' && session.capabilities?.advanceSamples !== true) {
        throw new Error('The provider FMU runtime does not support batched simulation advances.')
      }
      await session.request('sim.initialize', 'sim.state', {
        parameters: normalizedParameters,
        options: { ...activeOptions, timeMode: requestedMode === 'continuous' ? 'simtime' : 'external' },
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
      appendSamples([{ time: initialTime, outputs: initialOutputs }])
      if (requestedMode === 'continuous') void startContinuous()
    } catch (error) {
      const wasCancelled = controller.signal.aborted || error?.name === 'AbortError'
      finishSession(wasCancelled ? 'cancelled' : 'error', error?.message, controller)
    }
  }, [appendSamples, editableVariables, finishSession, getConnection, modelVariables, onRunFinish, onRunStart, options, parameters, runtimeVariables, startContinuous, supported, variableAccess, variableAccessState])

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
    batchMetrics,
    hasActiveSession,
    runtimeInputEditing,
    start,
    advanceStep,
    startContinuous,
    pauseContinuous,
    end,
    handleInputChange,
    reportDisplayedSample,
  }
}
