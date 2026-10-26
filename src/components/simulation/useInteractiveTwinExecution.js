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
import {
  getInputUpdateIntervalMs,
  getInputUpdateRetryDelayMs,
  getInputUpdateQuota,
} from '@decentralabs/digital-twin-app-protocol/input-update-quota'

const VALID_ADVANCE_STOP_REASONS = new Set([
  'target_reached', 'max_samples', 'compute_budget', 'early_return', 'simulation_finished',
])
const STEP_SAMPLE_METADATA_KEYS = [
  'eventOccurred', 'earlyReturn', 'terminateSimulation', 'finished', 'finishReason',
]

function hasValidAdvanceMetrics(response, samples) {
  return Number.isFinite(response?.computeMs) && response.computeMs >= 0
    && response.samplesReturned === samples.length
    && Number.isFinite(response.sampleBytes) && response.sampleBytes >= 0
    && Number.isSafeInteger(response.stepsExecuted) && response.stepsExecuted > 0
    && Number.isSafeInteger(response.inputEventsApplied) && response.inputEventsApplied >= 0
    && Number.isFinite(response.computeBudgetOverrunMs) && response.computeBudgetOverrunMs >= 0
    && VALID_ADVANCE_STOP_REASONS.has(response.stopReason)
}

function sameParameterValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function getReadableOutputNames(modelVariables, access) {
  return modelVariables
    .filter((variable) => variable?.causality === 'output' && access?.variables?.[variable.name]?.read === true)
    .map((variable) => variable.name)
}

async function waitForRealtimeRetry(delayMs, signal, maxDelayMs = 10_000) {
  if (!Number.isFinite(delayMs) || delayMs < 1 || delayMs > maxDelayMs) {
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

async function requestRealtimeOperation(session, type, expectedType, payload, signal, onRequestComplete) {
  const operationStartedAt = performance.now()
  let rateLimitWaitMs = 0
  for (;;) {
    signal?.throwIfAborted()
    try {
      const response = await session.request(type, expectedType, payload)
      onRequestComplete?.({
        responseMs: performance.now() - operationStartedAt,
        rateLimitWaitMs,
      })
      return response
    } catch (error) {
      if (error?.code !== 'OUTPUT_READ_RATE_LIMITED') {
        onRequestComplete?.({
          responseMs: performance.now() - operationStartedAt,
          rateLimitWaitMs,
        })
        throw error
      }
      const retryStartedAt = performance.now()
      await waitForRealtimeRetry(Number(error.retryAfterMs), signal)
      rateLimitWaitMs += performance.now() - retryStartedAt
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
  const pendingPresentationSampleIndexRef = useRef(null)
  const lastSampleSequenceRef = useRef(null)
  const renderDelayRef = useRef(null)
  const batchControllerRef = useRef(null)
  const liveParametersRef = useRef({})
  const appliedRuntimeParametersRef = useRef({})
  const pendingRuntimeInputChangedAtRef = useRef(null)
  const lastInputUpdateAtRef = useRef(null)
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
    if (typeof onSamples === 'function') {
      onSamples(samples)
      return
    }
    for (const sample of samples) onSample?.(sample.time, sample.outputs)
  }, [onSample, onSamples])

  const reportDisplayedSample = useCallback((sampleIndex, frameTime) => {
    const displayedIndex = Number(sampleIndex)
    if (!Number.isFinite(displayedIndex)) return
    const pendingSampleIndex = pendingPresentationSampleIndexRef.current
    if (pendingSampleIndex === null || displayedIndex < pendingSampleIndex || latestBatchReceivedAtRef.current === null) return

    const renderedAt = Number.isFinite(frameTime) ? frameTime : performance.now()
    const renderDelayMs = Math.max(0, renderedAt - latestBatchReceivedAtRef.current)
    renderedSampleIndexRef.current = pendingSampleIndex
    pendingPresentationSampleIndexRef.current = null
    latestBatchReceivedAtRef.current = null
    renderDelayRef.current = renderDelayMs
    if (mountedRef.current) {
      setBatchMetrics((current) => current ? { ...current, renderDelayMs, presentationConfirmed: true } : current)
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

      let inputChangedAt = null
      let changedValues = getChangedRuntimeValues()
      if (Object.keys(changedValues).length > 0) {
        const quota = getInputUpdateQuota(session.capabilities)
        for (;;) {
          ensureCurrentSession()
          const intervalMs = getInputUpdateIntervalMs(session.capabilities)
          const waitMs = lastInputUpdateAtRef.current === null
            ? 0
            : lastInputUpdateAtRef.current + intervalMs - performance.now()
          if (waitMs > 0) await waitForRealtimeRetry(waitMs, controller.signal, quota.windowMs + 1000)
          ensureCurrentSession()
          changedValues = getChangedRuntimeValues()
          if (Object.keys(changedValues).length === 0) break
          const submittedInputChangedAt = pendingRuntimeInputChangedAtRef.current
          try {
            await session.request('sim.setInputs', 'sim.inputs.updated', { values: changedValues })
            ensureCurrentSession()
            lastInputUpdateAtRef.current = performance.now()
            appliedRuntimeParametersRef.current = { ...appliedRuntimeParametersRef.current, ...changedValues }
            inputChangedAt = submittedInputChangedAt
            if (pendingRuntimeInputChangedAtRef.current === submittedInputChangedAt) {
              pendingRuntimeInputChangedAtRef.current = null
            }
          } catch (error) {
            const retryAfterMs = getInputUpdateRetryDelayMs(error, session.capabilities)
            if (retryAfterMs === null) throw error
            await waitForRealtimeRetry(retryAfterMs, controller.signal, quota.windowMs + 1000)
            ensureCurrentSession()
            continue
          }
          if (Object.keys(getChangedRuntimeValues()).length === 0) break
        }
      } else if (pendingRuntimeInputChangedAtRef.current !== null) {
        pendingRuntimeInputChangedAtRef.current = null
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
        let responseMetrics = null
        const response = await requestRealtimeOperation(session, 'sim.advance', 'sim.samples', {
          targetTime: plan.targetTime,
          maxSamples: plan.maxSamples,
          stepSize,
          maxComputeMs: plan.maxComputeMs,
        }, controller.signal, (metrics) => { responseMetrics = metrics })
        ensureCurrentSession()

        const samples = response.samples
        const nextTime = Number(response.simTime)
        const tolerance = Math.max(1e-9, Math.abs(stepSize) * 1e-7)
        if (!Array.isArray(samples) || samples.length < 1 || samples.length > plan.maxSamples
          || !Number.isFinite(nextTime) || nextTime < currentTime - tolerance || nextTime > plan.targetTime + tolerance) {
          throw new Error('The FMU returned an invalid sample batch for the requested advance.')
        }
        if (!hasValidAdvanceMetrics(response, samples)
          || response.maxComputeMs !== plan.maxComputeMs
          || samples.some((sample) => !Number.isSafeInteger(sample?.sequence) || sample.sequence < 1)) {
          throw new Error('The FMU runtime returned invalid compute-budget or event-sequence metadata.')
        }
        let previousTime = currentTime
        let previousSequence = lastSampleSequenceRef.current
        for (const sample of samples) {
          const sampleTime = Number(sample?.time)
          const sequence = sample?.sequence
          const hasSequence = Number.isSafeInteger(sequence) && sequence > 0
          const sameTime = Math.abs(sampleTime - previousTime) <= tolerance
          if (!Number.isFinite(sampleTime) || sampleTime < previousTime - tolerance || sampleTime > nextTime + tolerance
            || !sample.outputs || typeof sample.outputs !== 'object' || Array.isArray(sample.outputs)) {
            throw new Error('The FMU returned an invalid timeline in the sample batch.')
          }
          if ((sameTime && (!hasSequence || (Number.isSafeInteger(previousSequence) && sequence <= previousSequence)))
            || (hasSequence && Number.isSafeInteger(previousSequence) && sequence <= previousSequence)) {
            throw new Error('The FMU returned unordered or unsequenced same-time event samples.')
          }
          if (!sameTime && !hasSequence && Number.isSafeInteger(previousSequence)) {
            throw new Error('The FMU returned a sample timeline with inconsistent sequence metadata.')
          }
          previousTime = sampleTime
          if (hasSequence) previousSequence = sequence
        }
        if (Math.abs(previousTime - nextTime) > tolerance) {
          throw new Error('The FMU returned an incomplete timeline for the requested advance.')
        }
        if (Math.abs(nextTime - currentTime) <= tolerance
          && (!Number.isSafeInteger(previousSequence) || previousSequence <= (lastSampleSequenceRef.current ?? 0))) {
          throw new Error('The FMU returned an advance without a new simulation step or event.')
        }
        lastSampleSequenceRef.current = Number.isSafeInteger(previousSequence) ? previousSequence : null
        const interactionDelayMs = inputChangedAt === null ? null : performance.now() - inputChangedAt
        if (inputChangedAt !== null && pendingRuntimeInputChangedAtRef.current === inputChangedAt) {
          pendingRuntimeInputChangedAtRef.current = null
        }

        simulationTimeRef.current = nextTime
        if (mountedRef.current) setSimulationTime(nextTime)
        const batchReceivedAt = performance.now()
        appendSamples(samples)
        latestBatchReceivedAtRef.current = batchReceivedAt
        pendingPresentationSampleIndexRef.current = latestSampleIndexRef.current

        const hasFreshRenderDelay = renderedSampleIndexRef.current > observedRenderedSampleIndexRef.current
        const renderDelayMs = hasFreshRenderDelay ? renderDelayRef.current : null
        if (hasFreshRenderDelay) observedRenderedSampleIndexRef.current = renderedSampleIndexRef.current

        const nextController = observeInteractiveBatch(batchController, {
          responseMs: responseMetrics?.responseMs,
          computeMs: response.computeMs,
          sampleCount: response.samplesReturned ?? samples.length,
          payloadBytes: response.sampleBytes,
          renderDelayMs,
          rateLimitWaitMs: responseMetrics?.rateLimitWaitMs,
          interactionDelayMs,
          stopReason: response.stopReason,
        })
        batchControllerRef.current = nextController
        if (mountedRef.current) {
          setBatchMetrics({
            responseMs: nextController.responseEwmaMs ?? responseMetrics?.responseMs ?? 0,
            computeMs: nextController.computeEwmaMs,
            renderDelayMs: nextController.consumerDelayEwmaMs,
            presentationConfirmed: hasFreshRenderDelay,
            interactionDelayMs,
            interactionDelayEwmaMs: nextController.interactionDelayEwmaMs,
            simulationDelta: nextTime - currentTime,
            nextBatchSamples: nextController.sampleCount,
            samples: samples.length,
            sampleBytes: response.sampleBytes,
            maxComputeMs: plan.maxComputeMs,
            computeBudgetOverrunMs: response.computeBudgetOverrunMs ?? 0,
            stopReason: response.stopReason || 'unknown',
            targetReachable: nextController.targetReachable,
            estimatedBatchResponseMs: nextController.estimatedBatchResponseMs,
            batchConstraint: nextController.batchConstraint,
            rateLimitWaitMs: responseMetrics?.rateLimitWaitMs ?? 0,
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
      const tolerance = Math.max(1e-9, Math.abs(stepSize) * 1e-7)
      const sequence = response.sequence
      const hasSequence = Number.isSafeInteger(sequence) && sequence > 0
      const sameTime = Math.abs(nextTime - currentTime) <= tolerance
      if (!Number.isFinite(nextTime) || nextTime < currentTime - tolerance
        || nextTime > stopTime + tolerance
        || (sameTime && (!hasSequence || (Number.isSafeInteger(lastSampleSequenceRef.current)
          && sequence <= lastSampleSequenceRef.current)))
        || (hasSequence && Number.isSafeInteger(lastSampleSequenceRef.current)
          && sequence <= lastSampleSequenceRef.current)
        || (!hasSequence && Number.isSafeInteger(lastSampleSequenceRef.current))) {
        throw new Error('The FMU returned an invalid simulation time for the requested step.')
      }
      if (hasSequence) lastSampleSequenceRef.current = sequence
      simulationTimeRef.current = nextTime
      if (mountedRef.current) setSimulationTime(nextTime)
      const sample = {
        time: nextTime,
        outputs: response.values || response.outputs || {},
      }
      if (hasSequence) sample.sequence = sequence
      for (const key of STEP_SAMPLE_METADATA_KEYS) {
        if (response[key] !== undefined) sample[key] = response[key]
      }
      appendSamples([sample])

      if (nextTime >= stopTime - 1e-12 || response.terminated === true
        || response.terminateSimulation === true || response.finished === true) {
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
      pendingPresentationSampleIndexRef.current = null
      lastSampleSequenceRef.current = null
      pendingRuntimeInputChangedAtRef.current = null
      lastInputUpdateAtRef.current = null
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
      if (requestedMode === 'continuous' && session.capabilities?.advanceComputeBudget !== true) {
        throw new Error('The provider FMU runtime does not support compute-bounded simulation advances.')
      }
      if (requestedMode === 'continuous' && session.capabilities?.advanceSampleSequences !== true) {
        throw new Error('The provider FMU runtime does not preserve ordered same-time event samples.')
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
      pendingRuntimeInputChangedAtRef.current = performance.now()
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
