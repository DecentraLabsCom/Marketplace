import { useCallback, useEffect, useRef, useState } from 'react'
import devLog from '@/utils/dev/logger'
import { resolveGatewayFeatureError } from '../utils/gatewayErrors'
import {
  normalizeInitializationParameters,
  resolveInputSchedule,
} from '../utils/simulationParameters'
import { normalizeSimulationTimeOptions } from '../utils/simulationTime'
import { createFmuStateModelValues, createFmuStateSample } from '../utils/fmuStateCheckpoint'
import { appendSimulationSamples } from '../utils/simulationSamples'

export const SIM_STATE = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ERROR: 'error',
}

const STREAMING_SAMPLE_UPDATE_INTERVAL = 16

async function readNdjsonStream(response, onEvent) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line))
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer))
}

function resolveDigitalTwinSimulationOptions(baseOptions, requestedOptions, simulationType) {
  if (!requestedOptions || typeof requestedOptions !== 'object' || Array.isArray(requestedOptions)) {
    throw new Error('The digital twin requested invalid simulation options.')
  }

  const includeStepSize = simulationType !== 'ScheduledExecution'
  const allowedOptionNames = new Set(['startTime', 'stopTime', ...(includeStepSize ? ['stepSize'] : [])])
  if (Object.keys(requestedOptions).some((name) => !allowedOptionNames.has(name))) {
    throw new Error('The digital twin requested an unsupported simulation option.')
  }

  const resolved = { ...baseOptions, ...requestedOptions }
  return {
    ...resolved,
    ...normalizeSimulationTimeOptions(resolved, { includeStepSize }),
  }
}

export default function useSimulationExecution({
  lab,
  reservationKey,
  fetchGateway,
  variableAccess,
  variableAccessState,
  parameters,
  setParameters,
  options,
  setOptions,
  inputEvents,
  isModelExchange,
  isScheduledExecution,
  supportsInputSchedule,
  scheduledRuntimeVariables,
  accessibleModelVariables,
  editableVariables,
  selectedFmiLsExperimentId,
  selectableFmiLsExperiments,
  setCandidateFmuStateCheckpoint,
  solver,
  twinSimulationType,
}) {
  const [simState, setSimState] = useState(SIM_STATE.IDLE)
  const [results, setResults] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [progress, setProgress] = useState({ elapsedSeconds: 0, chunkIndex: null, totalChunks: null })
  const simulationInFlightRef = useRef(false)
  const simulationControllerRef = useRef(null)

  useEffect(() => () => {
    simulationControllerRef.current?.abort()
  }, [])

  const appendInteractiveSamples = useCallback((samples) => {
    if (!Array.isArray(samples) || samples.length === 0) return
    setResults((current) => {
      const previousTimes = Array.isArray(current?.time) ? current.time : []
      const previousOutputs = current?.outputs || {}
      const previousSampleMetadata = Array.isArray(current?.sampleMetadata)
        ? current.sampleMetadata
        : Array(previousTimes.length).fill({})
      const outputNames = new Set([
        ...Object.keys(previousOutputs),
        ...samples.flatMap((sample) => Object.keys(sample.outputs || {})),
      ])
      const nextOutputs = Object.fromEntries([...outputNames].map((name) => {
        const previousValues = Array.isArray(previousOutputs[name])
          ? previousOutputs[name]
          : Array(previousTimes.length).fill(null)
        const sampleValues = samples.map((sample) => (
          Object.prototype.hasOwnProperty.call(sample.outputs || {}, name) ? sample.outputs[name] : null
        ))
        return [name, [...previousValues, ...sampleValues]]
      }))
      const time = samples[samples.length - 1].time
      return {
        time: [...previousTimes, ...samples.map((sample) => sample.time)],
        sampleMetadata: [
          ...previousSampleMetadata,
          ...samples.map((sample) => Object.fromEntries(
            ['sequence', 'eventOccurred', 'eventHandlingNeeded', 'earlyReturn', 'terminateSimulation', 'finished', 'finishReason']
              .filter((key) => sample[key] !== undefined)
              .map((key) => [key, sample[key]]),
          )),
        ],
        outputs: nextOutputs,
        outputVariables: [...outputNames],
        simulationTime: time,
        fmiType: 'CoSimulation',
      }
    })
  }, [])

  const handleInteractiveRunStart = useCallback(() => {
    simulationInFlightRef.current = true
    setSimState(SIM_STATE.RUNNING)
    setErrorMsg(null)
    setResults(null)
    setProgress({ elapsedSeconds: 0, chunkIndex: null, totalChunks: null })
  }, [])

  const handleInteractiveRunFinish = useCallback(({ state, message, parameters: finalParameters }) => {
    if (finalParameters && typeof finalParameters === 'object' && !Array.isArray(finalParameters)) {
      setParameters(finalParameters)
    }
    simulationInFlightRef.current = false
    setErrorMsg(state === SIM_STATE.ERROR ? (message || 'The interactive FMU session failed.') : null)
    setSimState(state)
  }, [setParameters])

  const runSimulation = useCallback(async (requestedParameters = null, requestedOptions = null, requestedInputEvents = null, stateOptions = {}) => {
    if (variableAccessState !== 'ready' || !variableAccess) {
      setErrorMsg('Variable access is not ready for this reservation.')
      setSimState(SIM_STATE.ERROR)
      return
    }
    if (simulationInFlightRef.current) return
    simulationInFlightRef.current = true
    setCandidateFmuStateCheckpoint?.(null)
    const controller = new AbortController()
    simulationControllerRef.current = controller
    setSimState(SIM_STATE.RUNNING)
    setErrorMsg(null)
    setResults(null)
    setProgress({ elapsedSeconds: 0, chunkIndex: null, totalChunks: null })

    try {
      let activeParameters = parameters
      if (requestedParameters !== null) {
        if (!requestedParameters || typeof requestedParameters !== 'object' || Array.isArray(requestedParameters)) {
          throw new Error('The digital twin requested invalid simulation inputs.')
        }
        const allowedInitializationNames = new Set(editableVariables.map((variable) => variable.name))
        if (Object.keys(requestedParameters).some((name) => !allowedInitializationNames.has(name))) {
          throw new Error('The digital twin requested an FMU input or tunable parameter that this model does not expose.')
        }
        activeParameters = { ...parameters, ...requestedParameters }
        setParameters(activeParameters)
      }

      const activeOptions = requestedOptions === null || requestedOptions === undefined
        ? options
        : resolveDigitalTwinSimulationOptions(options, requestedOptions, twinSimulationType)
      if (requestedOptions !== null && requestedOptions !== undefined) setOptions(activeOptions)
      const normalizedTimeOptions = normalizeSimulationTimeOptions(activeOptions, {
        includeStepSize: !isScheduledExecution,
      })
      const resolvedActiveOptions = { ...activeOptions, ...normalizedTimeOptions }
      const scheduleValidationOptions = { ...resolvedActiveOptions }
      const checkpointBundle = stateOptions?.checkpoint || null
      const supportsFmuState = variableAccess?.fmuState?.getAndSet === true
        && variableAccess?.fmuState?.serialize === true
      if ((checkpointBundle || stateOptions?.captureFmuState) && !supportsFmuState) {
        throw new Error('This FMU or provider runtime does not support serialized FMU states.')
      }
      if (checkpointBundle) {
        if (!Number.isFinite(checkpointBundle.simTime)
          || checkpointBundle.simTime < resolvedActiveOptions.startTime
          || checkpointBundle.simTime >= resolvedActiveOptions.stopTime) {
          throw new Error('The saved FMU state must be within the simulation interval. Stop time is absolute and must be later than the saved state.')
        }
      }

      const activeInputEvents = requestedInputEvents === null || requestedInputEvents === undefined
        ? inputEvents
        : requestedInputEvents
      const selectedExperiment = selectableFmiLsExperiments.find((experiment) => experiment.id === selectedFmiLsExperimentId)
      const resolvedInputSchedule = resolveInputSchedule({
        experiment: selectedExperiment,
        inputEvents: activeInputEvents,
        scheduleVariables: scheduledRuntimeVariables,
        modelVariables: accessibleModelVariables,
        options: scheduleValidationOptions,
        ignoreEventsBeforeStartTime: Boolean(checkpointBundle),
        enabled: supportsInputSchedule,
      })
      const inputSchedule = checkpointBundle
        ? resolvedInputSchedule.filter((event) => event.time >= checkpointBundle.simTime - 1e-12)
        : resolvedInputSchedule

      const gatewayUrl = lab.accessURI || ''
      if (!gatewayUrl) throw new Error('Lab gateway URL not available')

      const reqOptions = { ...resolvedActiveOptions }
      if (isScheduledExecution) delete reqOptions.stepSize
      if (isModelExchange) {
        reqOptions.fmiType = 'ModelExchange'
        reqOptions.solver = solver
      }

      const writableInitializationNames = new Set(editableVariables.map((variable) => variable.name))
      const initializationValues = Object.fromEntries(Object.entries(activeParameters).filter(([name, value]) => (
        writableInitializationNames.has(name) && value !== '' && value !== null && value !== undefined
      )))
      const normalizedParameters = checkpointBundle
        ? {}
        : normalizeInitializationParameters(initializationValues, accessibleModelVariables)
      const body = {
        labId: String(lab.id ?? lab.tokenId ?? ''),
        reservationKey,
        parameters: normalizedParameters,
        options: reqOptions,
        ...(inputSchedule.length > 0 ? { inputSchedule } : {}),
        ...(checkpointBundle ? { checkpoint: checkpointBundle.checkpoint } : {}),
        ...(stateOptions?.captureFmuState ? { captureFmuState: true } : {}),
      }

      const response = await fetchGateway('/api/simulations/stream', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Simulation failed (${response.status})`)
      }

      const accumulatedTime = []
      const accumulatedOutputs = {}
      let finalMeta = {}
      await readNdjsonStream(response, (event) => {
        switch (event.type) {
          case 'started':
            devLog.log('Simulation started:', event.simId)
            break
          case 'progress':
            setProgress((previous) => ({ ...previous, elapsedSeconds: event.elapsedSeconds }))
            break
          case 'sim.step':
            if (appendSimulationSamples(accumulatedTime, accumulatedOutputs, event.time, event.outputs, false)) {
              if (accumulatedTime.length % STREAMING_SAMPLE_UPDATE_INTERVAL === 0) {
                setResults({ time: [...accumulatedTime], outputs: { ...accumulatedOutputs } })
              }
            }
            break
          case 'data':
            if (appendSimulationSamples(accumulatedTime, accumulatedOutputs, event.time, event.outputs)) {
              setProgress((previous) => ({ ...previous, chunkIndex: event.chunkIndex, totalChunks: event.totalChunks }))
              setResults({ time: [...accumulatedTime], outputs: { ...accumulatedOutputs } })
            }
            break
          case 'completed':
          case 'sim.done':
            finalMeta = event
            if (event.checkpoint && Number.isFinite(event.time ?? event.simulationTime)) {
              const checkpointTime = Number(event.time ?? event.simulationTime)
              const latestOutputs = Object.fromEntries(Object.entries(accumulatedOutputs).map(([name, values]) => (
                [name, values.at(-1)]
              )))
              const sample = createFmuStateSample(checkpointTime, latestOutputs)
              const modelValues = createFmuStateModelValues(
                { ...activeParameters, ...(checkpointBundle?.modelValues || {}) },
                inputSchedule,
                checkpointTime,
              )
              setCandidateFmuStateCheckpoint?.({
                version: 1,
                simTime: checkpointTime,
                checkpoint: event.checkpoint,
                ...(sample ? { sample } : {}),
                ...(Object.keys(modelValues).length ? { modelValues } : {}),
              })
            }
            break
          case 'error':
            throw new Error(event.detail || event.message || 'Simulation error')
          default:
            break
        }
      })

      if (controller.signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
      setResults({
        time: accumulatedTime,
        outputs: accumulatedOutputs,
        outputVariables: finalMeta.outputVariables || Object.keys(accumulatedOutputs),
        simulationTime: finalMeta.simulationTime ?? finalMeta.time,
        fmiType: finalMeta.fmiType,
      })
      setSimState(SIM_STATE.COMPLETED)
      devLog.log('Simulation completed', { outputKeys: Object.keys(accumulatedOutputs), fmiType: finalMeta.fmiType })
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        setErrorMsg(null)
        setSimState(SIM_STATE.CANCELLED)
      } else {
        devLog.error('Simulation error:', error)
        setErrorMsg(error.message)
        setSimState(SIM_STATE.ERROR)
      }
    } finally {
      if (simulationControllerRef.current === controller) {
        simulationControllerRef.current = null
        simulationInFlightRef.current = false
      }
    }
  }, [accessibleModelVariables, editableVariables, fetchGateway, inputEvents, isModelExchange, isScheduledExecution, lab, options, parameters, reservationKey, scheduledRuntimeVariables, selectedFmiLsExperimentId, selectableFmiLsExperiments, setCandidateFmuStateCheckpoint, setOptions, setParameters, solver, supportsInputSchedule, twinSimulationType, variableAccess, variableAccessState])

  const loadResult = useCallback(async (simId) => {
    const gatewayUrl = lab.accessURI || ''
    const labId = String(lab.id ?? lab.tokenId ?? '')
    if (!gatewayUrl || !labId) return
    try {
      const resultQuery = new URLSearchParams({
        simId: String(simId),
        labId,
        reservationKey: String(reservationKey || ''),
      })
      const response = await fetchGateway(`/api/simulations/result?${resultQuery.toString()}`, { credentials: 'include' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const gatewayError = resolveGatewayFeatureError(response.status, payload, {
          fallbackMessage: `Failed to load result (${response.status})`,
          unavailableMessage: 'Historical simulation results are not available yet for this FMU backend.',
        })
        throw new Error(gatewayError.message)
      }
      const data = await response.json()
      setResults(data.result || data)
      setSimState(SIM_STATE.COMPLETED)
    } catch (error) {
      devLog.error('Failed to load historical result:', error)
      setResults(null)
      setErrorMsg(error?.message || 'Unable to load historical simulation result')
      setSimState(SIM_STATE.ERROR)
    }
  }, [fetchGateway, lab, reservationKey])

  return {
    simState,
    setSimState,
    results,
    setResults,
    errorMsg,
    setErrorMsg,
    progress,
    runSimulation,
    loadResult,
    appendInteractiveSamples,
    handleInteractiveRunStart,
    handleInteractiveRunFinish,
    simulationInFlightRef,
  }
}
