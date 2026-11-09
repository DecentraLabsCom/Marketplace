import { useCallback, useEffect, useRef, useState } from 'react'
import devLog from '@/utils/dev/logger'
import { normalizeInitializationParameters } from '../utils/simulationParameters'
import { resolveInputSchedule } from '../utils/inputSchedule'
import { normalizeSimulationTimeOptions } from '../utils/simulationTime'
import { createFmuStateCheckpointCandidate } from '../utils/fmuStateCheckpoint'
import { appendSimulationSamples } from '../utils/simulationSamples'
import { MAX_INTERACTIVE_HISTORY_SAMPLES } from '../utils/interactiveSampleHistory'
import { postFmuSimulationStream } from '@decentralabs/digital-twin-app-protocol/fmu-client'
import { normalizeSimulationStreamEvent, readNdjsonStream } from '@decentralabs/digital-twin-app-protocol/simulation-stream'

export const SIM_STATE = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ERROR: 'error',
}

const STREAMING_SAMPLE_UPDATE_INTERVAL = 128
const STREAMING_SAMPLE_UPDATE_MS = 250
const MAX_STREAMING_PREVIEW_SAMPLES = 2_000
const MAX_STREAMING_PREVIEW_VALUES = 250_000

function createStreamingPreview(time, outputs) {
  const sampleCount = time.length
  const seriesCount = Object.values(outputs).filter(Array.isArray).length
  const previewSampleLimit = Math.min(
    MAX_STREAMING_PREVIEW_SAMPLES,
    Math.max(2, Math.floor(MAX_STREAMING_PREVIEW_VALUES / Math.max(1, seriesCount))),
  )
  if (sampleCount <= previewSampleLimit) {
    return {
      time: [...time],
      outputs: Object.fromEntries(Object.entries(outputs).map(([name, values]) => [name, [...values]])),
    }
  }

  const selectedIndices = Array.from({ length: previewSampleLimit }, (_, index) => (
    Math.round((index * (sampleCount - 1)) / (previewSampleLimit - 1))
  ))

  return {
    time: selectedIndices.map((index) => time[index]),
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, values]) => [
      name,
      selectedIndices.map((index) => values[index] ?? null),
    ])),
  }
}

export default function useSimulationExecution({
  lab,
  reservationKey,
  getFmuConnection,
  variableAccess,
  variableAccessState,
  parameters,
  setParameters,
  options,
  inputEvents,
  isScheduledExecution,
  supportsInputSchedule,
  scheduledRuntimeVariables,
  accessibleModelVariables,
  editableVariables,
  selectedFmiLsExperimentId,
  selectableFmiLsExperiments,
  setCandidateFmuStateCheckpoint,
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
      const previousDiscontinuities = Array.isArray(current?.discontinuities)
        ? current.discontinuities
        : Array(previousTimes.length).fill(false)
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
        return [name, [...previousValues, ...sampleValues].slice(-MAX_INTERACTIVE_HISTORY_SAMPLES)]
      }))
      const droppedSamples = Math.max(0, previousTimes.length + samples.length - MAX_INTERACTIVE_HISTORY_SAMPLES)
      const time = samples[samples.length - 1].time
      return {
        time: [...previousTimes, ...samples.map((sample) => sample.time)].slice(-MAX_INTERACTIVE_HISTORY_SAMPLES),
        sampleIndexOffset: (Number(current?.sampleIndexOffset) || 0) + droppedSamples,
        sampleMetadata: [
          ...previousSampleMetadata,
          ...samples.map((sample) => Object.fromEntries(
            ['sequence', 'eventOccurred', 'eventHandlingNeeded', 'earlyReturn', 'terminateSimulation', 'finished', 'finishReason']
              .filter((key) => sample[key] !== undefined)
              .map((key) => [key, sample[key]]),
          )),
        ].slice(-MAX_INTERACTIVE_HISTORY_SAMPLES),
        discontinuities: [
          ...previousDiscontinuities,
          ...samples.map((sample, index) => Boolean(
            sample.eventOccurred
            || sample.eventHandlingNeeded
            || sample.earlyReturn
            || sample.discontinuity
            || (previousTimes.length + index > 0
              && Number(sample.time) <= Number((index > 0 ? samples[index - 1]?.time : previousTimes.at(-1)))),
          )),
        ].slice(-MAX_INTERACTIVE_HISTORY_SAMPLES),
        outputs: nextOutputs,
        outputVariables: [...outputNames],
        simulationTime: time,
        fmiType: variableAccess?.simulationType || 'CoSimulation',
      }
    })
  }, [variableAccess?.simulationType])

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

  const runSimulation = useCallback(async (activeInputEvents = inputEvents, stateOptions = {}) => {
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
      const activeParameters = parameters
      const normalizedTimeOptions = normalizeSimulationTimeOptions(options, {
        includeStepSize: !isScheduledExecution,
      })
      const resolvedActiveOptions = { ...options, ...normalizedTimeOptions }
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

      if (typeof getFmuConnection !== 'function') {
        throw new Error('The provider FMU connection is unavailable.')
      }
      const connection = await getFmuConnection({ signal: controller.signal })
      const response = await postFmuSimulationStream(connection, body, { signal: controller.signal })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.detail || `Simulation failed (${response.status})`)
      }

      const accumulatedTime = []
      const accumulatedOutputs = {}
      let finalMeta = {}
      let lastPublishedSampleCount = 0
      let lastPublishedAt = performance.now()
      const publishStreamingPreview = (force = false) => {
        const now = performance.now()
        if (!force
          && accumulatedTime.length - lastPublishedSampleCount < STREAMING_SAMPLE_UPDATE_INTERVAL
          && now - lastPublishedAt < STREAMING_SAMPLE_UPDATE_MS) return false
        const preview = createStreamingPreview(accumulatedTime, accumulatedOutputs)
        setResults({ ...preview, streaming: true })
        lastPublishedSampleCount = accumulatedTime.length
        lastPublishedAt = now
        return true
      }
      const streamSequence = { nextSequence: 0 }
      await readNdjsonStream(response, (event) => {
        const normalized = normalizeSimulationStreamEvent(event, streamSequence)
        switch (normalized.kind) {
          case 'started':
            devLog.log('Simulation started:', normalized.event.simId)
            break
          case 'progress':
            setProgress((previous) => ({ ...previous, elapsedSeconds: normalized.event.elapsedSeconds }))
            break
          case 'samples': {
            const samples = normalized.samples || []
            const outputNames = new Set(samples.flatMap((sample) => Object.keys(sample.outputs || {})))
            const outputSeries = Object.fromEntries([...outputNames].map((name) => [
              name,
              samples.map((sample) => sample.outputs?.[name]),
            ]))
            if (appendSimulationSamples(
              accumulatedTime,
              accumulatedOutputs,
              samples.map((sample) => sample.time),
              outputSeries,
            )) {
              if (publishStreamingPreview() && normalized.event?.type === 'data') {
                setProgress((previous) => ({
                  ...previous,
                  chunkIndex: normalized.event.chunkIndex,
                  totalChunks: normalized.event.totalChunks,
                }))
              }
            }
            break
          }
          case 'completed': {
            const event = normalized.metadata || {}
            finalMeta = event
            if (event.checkpoint) {
              const checkpointCandidate = createFmuStateCheckpointCandidate(
                event,
                { ...activeParameters, ...(checkpointBundle?.modelValues || {}) },
                inputSchedule,
              )
              if (!checkpointCandidate) {
                throw new Error('The FMU state checkpoint response is invalid.')
              }
              setCandidateFmuStateCheckpoint?.(checkpointCandidate)
            }
            break
          }
          case 'error':
            throw new Error(normalized.message || 'Simulation error')
          default:
            break
        }
      }, { signal: controller.signal })

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
  }, [accessibleModelVariables, editableVariables, getFmuConnection, inputEvents, isScheduledExecution, lab, options, parameters, reservationKey, scheduledRuntimeVariables, selectedFmiLsExperimentId, selectableFmiLsExperiments, setCandidateFmuStateCheckpoint, supportsInputSchedule, variableAccess, variableAccessState])

  return {
    simState,
    results,
    errorMsg,
    setErrorMsg,
    progress,
    runSimulation,
    appendInteractiveSamples,
    handleInteractiveRunStart,
    handleInteractiveRunFinish,
  }
}
