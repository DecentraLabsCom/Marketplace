"use client";
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import PropTypes from 'prop-types'
import { getFmuMetadata, formatFmuSimulationType } from '@/utils/resourceType'
import ParameterForm from './ParameterForm'
import DigitalTwinSimulationForm from './DigitalTwinSimulationForm'
import FmiLsStructMapPanel from './FmiLsStructMapPanel'
import FmiLsResourceSelect from './FmiLsResourceSelect'
import InputScheduleEditor from './InputScheduleEditor'
import SimulationOptions from './SimulationOptions'
import SimulationProgress from './SimulationProgress'
import ResultsChart from './ResultsChart'
import ResultsTable from './ResultsTable'
import DownloadButtons from './DownloadButtons'
import SimulationHistory from './SimulationHistory'
import devLog from '@/utils/dev/logger'
import { MAX_SAMPLES_PER_BATCH } from '@decentralabs/digital-twin-app-protocol'
import { resolveGatewayFeatureError } from './gatewayErrors'
import { inputScheduleToEvents, mergeInputSchedules, normalizeInputSchedule, normalizeSimulationParameters } from './simulationParameters'
import { mergeAasSimulationVariables } from './aasSimulationVariables'
import { getInitialSimulationOptions, getSimulationOptionsError, normalizeSimulationTimeOptions } from './simulationTime'
import {
  filterModelVariablesByAccess,
  getInitializationEditableVariables,
  getRuntimeWritableVariables,
} from './simulationVariableAccess'
import {
  DigitalTwinExecutionModeSelector,
  DigitalTwinExecutionSessionActions,
} from './DigitalTwinExecutionControls'
import useInteractiveTwinExecution from './useInteractiveTwinExecution'
import useSimulationGatewaySession from './useSimulationGatewaySession'
import useDigitalTwinAssetDiscovery from './useDigitalTwinAssetDiscovery'
import {
  filterFmiLsExperimentsForVariables,
  filterFmiLsParameterPresets,
  supportsFmiLsInteractiveModes,
} from '@/utils/fmiLsEligibility'

const DigitalTwinViewer = dynamic(() => import('./DigitalTwinViewer'), { ssr: false })
const DigitalTwinAppViewer = dynamic(() => import('./DigitalTwinAppViewer'), { ssr: false })

const SIM_STATE = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ERROR: 'error',
}
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

export default function SimulationRunner({ lab, reservationKey }) {
  const fmuMeta = getFmuMetadata(lab)
  const { gatewaySessionOrigin, ensureGatewaySession, fetchGateway } = useSimulationGatewaySession({ lab, reservationKey })

  const [parameters, setParameters] = useState({})
  const [inputEvents, setInputEvents] = useState([])
  const [options, setOptions] = useState(() => getInitialSimulationOptions(fmuMeta))
  const [simState, setSimState] = useState(SIM_STATE.IDLE)
  const [results, setResults] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [progress, setProgress] = useState({ elapsedSeconds: 0, chunkIndex: null, totalChunks: null })
  const [proxyDownloadState, setProxyDownloadState] = useState('idle')
  const [proxyDownloadMessage, setProxyDownloadMessage] = useState(null)
  const [variableAccess, setVariableAccess] = useState(null)
  const [variableAccessState, setVariableAccessState] = useState(reservationKey ? 'loading' : 'unavailable')
  const [fmiLsParameterPresets, setFmiLsParameterPresets] = useState([])
  const [selectedFmiLsParameterPresetId, setSelectedFmiLsParameterPresetId] = useState('')
  const [selectedFmiLsExperimentId, setSelectedFmiLsExperimentId] = useState('')
  const [executionMode, setExecutionMode] = useState('batch')
  const [continuousBatchPolicy, setContinuousBatchPolicy] = useState('adaptive')
  const [fixedBatchSamples, setFixedBatchSamples] = useState(MAX_SAMPLES_PER_BATCH)
  const modelVariables = Array.isArray(variableAccess?.modelVariables) ? variableAccess.modelVariables : []

  const proxyAttemptRef = useRef(null)
  const simulationInFlightRef = useRef(false)
  const simulationControllerRef = useRef(null)

  useEffect(() => () => {
    simulationControllerRef.current?.abort()
  }, [])

  const isModelExchange = fmuMeta?.simulationType === 'ModelExchange'
  const isScheduledExecution = fmuMeta?.simulationType === 'ScheduledExecution'
  const supportsInputSchedule = !isModelExchange && !isScheduledExecution
  const [solver, setSolver] = useState('Euler')
  const labId = String(lab.id ?? lab.tokenId ?? '')
  const { asset: twinAsset, state: twinAssetState, simulationVariables: aasSimulationVariables } = useDigitalTwinAssetDiscovery({
    labId,
    accessUri: lab.accessURI,
  })
  const twinSimulationType = twinAsset
    ? variableAccess?.simulationType
    : fmuMeta?.simulationType
  const supportsTwinInputSchedule = twinSimulationType === 'CoSimulation'
  const simulationTypeLabel = formatFmuSimulationType(twinSimulationType)
  const accessibleModelVariables = useMemo(
    () => filterModelVariablesByAccess(modelVariables, variableAccess),
    [modelVariables, variableAccess],
  )
  const editableVariables = useMemo(
    () => getInitializationEditableVariables(accessibleModelVariables, variableAccess),
    [accessibleModelVariables, variableAccess],
  )
  const editableFmiLsParameterPresets = useMemo(
    () => filterFmiLsParameterPresets(fmiLsParameterPresets, editableVariables),
    [editableVariables, fmiLsParameterPresets],
  )
  const scheduledRuntimeVariables = useMemo(
    () => getRuntimeWritableVariables(accessibleModelVariables, variableAccess),
    [accessibleModelVariables, variableAccess],
  )
  const genericFmiLsExperiments = useMemo(
    () => filterFmiLsExperimentsForVariables(
      variableAccess?.fmiLsExperiments,
      editableVariables,
      scheduledRuntimeVariables,
    ),
    [editableVariables, scheduledRuntimeVariables, variableAccess?.fmiLsExperiments],
  )
  let inputScheduleError = ''
  const simulationOptionsError = getSimulationOptionsError(options, { includeStepSize: !isScheduledExecution })
  if (supportsInputSchedule && inputEvents.length > 0 && !simulationOptionsError) {
    try {
      normalizeInputSchedule(inputEvents, scheduledRuntimeVariables, accessibleModelVariables, options.startTime, options.stopTime, options.stepSize)
    } catch (error) {
      inputScheduleError = error.message
    }
  }
  const twinVariableResolution = useMemo(
    () => mergeAasSimulationVariables(aasSimulationVariables, modelVariables),
    [aasSimulationVariables, modelVariables],
  )
  const twinModelVariables = useMemo(
    () => filterModelVariablesByAccess(twinVariableResolution.variables, variableAccess),
    [twinVariableResolution.variables, variableAccess],
  )
  const twinEditableVariables = useMemo(
    () => getInitializationEditableVariables(twinModelVariables, variableAccess),
    [twinModelVariables, variableAccess],
  )
  const twinEditableVariableNames = useMemo(
    () => new Set(twinEditableVariables.map((variable) => variable.name)),
    [twinEditableVariables],
  )
  const twinScheduledRuntimeVariables = useMemo(
    () => getRuntimeWritableVariables(accessibleModelVariables, variableAccess),
    [accessibleModelVariables, variableAccess],
  )
  const twinFmiLsParameterPresets = useMemo(
    () => filterFmiLsParameterPresets(fmiLsParameterPresets, twinEditableVariableNames),
    [fmiLsParameterPresets, twinEditableVariableNames],
  )
  const twinFmiLsExperiments = useMemo(
    () => filterFmiLsExperimentsForVariables(
      variableAccess?.fmiLsExperiments,
      twinEditableVariableNames,
      twinScheduledRuntimeVariables,
    ),
    [twinEditableVariableNames, twinScheduledRuntimeVariables, variableAccess?.fmiLsExperiments],
  )
  const selectableFmiLsExperiments = twinAsset ? twinFmiLsExperiments : genericFmiLsExperiments
  const supportsInteractiveTwinModes = Boolean(
    twinAsset?.type === 'glb'
    && reservationKey
    && variableAccessState === 'ready'
    && supportsFmiLsInteractiveModes(variableAccess?.simulationType, variableAccess?.fmiVersion),
  )
  useEffect(() => {
    if (variableAccessState !== 'ready') return
    setParameters((current) => {
      let changed = false
      const next = { ...current }
      for (const variable of editableVariables) {
        if (next[variable.name] === undefined || next[variable.name] === '') {
          const permission = variableAccess.variables?.[variable.name]
          const defaultValue = permission?.read === true
            ? variable.start
            : variable.type === 'Boolean' ? false : undefined
          if (defaultValue === undefined || defaultValue === null) continue
          next[variable.name] = defaultValue
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [editableVariables, variableAccess, variableAccessState])

  useEffect(() => {
    if (twinAsset?.type !== 'glb') return
    setParameters((current) => {
      let changed = false
      const next = { ...current }
      for (const variable of twinEditableVariables) {
        if ((next[variable.name] === undefined || next[variable.name] === '') && variable.start != null) {
          next[variable.name] = variable.start
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [twinAsset?.type, twinEditableVariables])

  useEffect(() => {
    if (twinVariableResolution.conflicts.length > 0) {
      devLog.warn('AAS simulation metadata disagrees with the FMU description; conflicting fields use FMU metadata.',
        twinVariableResolution.conflicts.slice(0, 20))
    }
  }, [twinVariableResolution.conflicts])

  const proxyAttemptKey = reservationKey && fmuMeta?.fmuFileName
    ? `${labId}:${String(reservationKey).toLowerCase()}`
    : ''

  const handleParamChange = useCallback((name, value) => {
    setSelectedFmiLsParameterPresetId('')
    setSelectedFmiLsExperimentId('')
    setParameters(prev => ({ ...prev, [name]: value }))
  }, [])

  const handleFmiLsParameterPresetSelect = useCallback((presetId) => {
    const preset = fmiLsParameterPresets.find((candidate) => candidate.id === presetId)
    setSelectedFmiLsParameterPresetId(preset ? preset.id : '')
    setSelectedFmiLsExperimentId('')
    if (preset) setParameters((current) => ({ ...current, ...preset.parameters }))
  }, [fmiLsParameterPresets])

  const handleExperimentSelect = useCallback((experimentId) => {
    const experiment = selectableFmiLsExperiments.find((candidate) => candidate.id === experimentId)
    setSelectedFmiLsExperimentId(experiment ? experiment.id : '')
    setSelectedFmiLsParameterPresetId('')
    if (!experiment) return
    setParameters((current) => ({ ...current, ...experiment.parameters }))
    setOptions((current) => ({ ...current, ...experiment.options }))
  }, [selectableFmiLsExperiments])

  const handleOptionChange = useCallback((name, value) => {
    setSelectedFmiLsExperimentId('')
    setOptions(prev => ({ ...prev, [name]: value }))
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
  }, [])

  const getInteractiveConnection = useCallback(async ({ signal }) => {
    const response = await fetchGateway('/api/simulations/connection', {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labId, reservationKey }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.error || `The FMU session could not be authorized (${response.status}).`)
    }
    return response.json()
  }, [fetchGateway, labId, reservationKey])

  const interactiveExecution = useInteractiveTwinExecution({
    getConnection: getInteractiveConnection,
    options,
    parameters,
    modelVariables: twinModelVariables,
    editableVariables: twinEditableVariables,
    runtimeVariables: twinScheduledRuntimeVariables,
    variableAccess,
    variableAccessState,
    supported: supportsInteractiveTwinModes,
    batchPolicy: continuousBatchPolicy,
    fixedBatchSamples,
    onRunStart: handleInteractiveRunStart,
    onSamples: appendInteractiveSamples,
    onRunFinish: handleInteractiveRunFinish,
    onParameterChange: handleParamChange,
  })
  const liveSceneInputEditing = interactiveExecution.hasActiveSession
    && ['step', 'continuous'].includes(interactiveExecution.mode)
    && interactiveExecution.runtimeInputEditing
  const sceneInputVariables = useMemo(() => (
    liveSceneInputEditing
      ? twinScheduledRuntimeVariables.filter((variable) => variable.causality === 'input')
      : []
  ), [liveSceneInputEditing, twinScheduledRuntimeVariables])
  const sceneInputValues = interactiveExecution.hasActiveSession
    ? interactiveExecution.liveParameters
    : parameters

  useEffect(() => {
    if (!labId || !reservationKey) {
      setVariableAccess(null)
      setVariableAccessState('unavailable')
      setSelectedFmiLsExperimentId('')
      return undefined
    }

    const controller = new AbortController()
    setVariableAccess(null)
    setVariableAccessState('loading')
      setSelectedFmiLsExperimentId('')
    fetchGateway('/api/simulations/access', {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labId, reservationKey }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Variable access could not be resolved for this reservation.')
        }
        return response.json()
      })
      .then((access) => {
        if (controller.signal.aborted) return
        if (!access?.variables || typeof access.variables !== 'object' || Array.isArray(access.variables)
          || !Array.isArray(access.modelVariables)) {
          throw new Error('The provider returned an invalid variable access policy.')
        }
        setVariableAccess(access)
        setVariableAccessState('ready')
        setSelectedFmiLsExperimentId('')
        setErrorMsg(null)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setVariableAccessState('error')
        setErrorMsg(error?.message || 'Variable access could not be resolved for this reservation.')
      })
    return () => controller.abort()
  }, [fetchGateway, labId, reservationKey])

  useEffect(() => {
    if (!labId || !reservationKey || variableAccessState !== 'ready') {
      setFmiLsParameterPresets([])
      setSelectedFmiLsParameterPresetId('')
      return undefined
    }

    const controller = new AbortController()
    setFmiLsParameterPresets([])
    setSelectedFmiLsParameterPresetId('')
    fetchGateway('/api/simulations/parameter-sets', {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labId, reservationKey }),
    })
      .then(async (response) => {
        if (!response.ok) return { fmiLsParameterPresets: [] }
        const payload = await response.json().catch(() => null)
        return Array.isArray(payload?.fmiLsParameterPresets) ? payload : { fmiLsParameterPresets: [] }
      })
      .then((payload) => {
        if (!controller.signal.aborted) setFmiLsParameterPresets(payload.fmiLsParameterPresets)
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          devLog.warn('FMI-LS parameter sets are unavailable.', error?.message || error)
          setFmiLsParameterPresets([])
        }
      })

    return () => controller.abort()
  }, [fetchGateway, labId, reservationKey, variableAccessState])

  const runSimulation = useCallback(async (requestedParameters = null, requestedOptions = null, requestedInputEvents = null) => {
    if (variableAccessState !== 'ready' || !variableAccess) {
      setErrorMsg('Variable access is not ready for this reservation.')
      setSimState(SIM_STATE.ERROR)
      return
    }
    if (simulationInFlightRef.current) return
    simulationInFlightRef.current = true
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
        const allowedInitializationNames = new Set(editableVariables
          .map((variable) => variable.name))
        if (Object.keys(requestedParameters).some((name) => !allowedInitializationNames.has(name))) {
          throw new Error('The digital twin requested an FMU input or tunable parameter that this model does not expose.')
        }
        activeParameters = { ...parameters, ...requestedParameters }
        setParameters(activeParameters)
      }

      const activeOptions = requestedOptions === null || requestedOptions === undefined
        ? options
        : resolveDigitalTwinSimulationOptions(options, requestedOptions, twinSimulationType)
      if (requestedOptions !== null && requestedOptions !== undefined) {
        setOptions(activeOptions)
      }
      const normalizedTimeOptions = normalizeSimulationTimeOptions(activeOptions, {
        includeStepSize: !isScheduledExecution,
      })
      const resolvedActiveOptions = { ...activeOptions, ...normalizedTimeOptions }

      const activeInputEvents = requestedInputEvents === null || requestedInputEvents === undefined
        ? inputEvents
        : requestedInputEvents
      const selectedExperiment = selectableFmiLsExperiments.find((experiment) => experiment.id === selectedFmiLsExperimentId)
      const experimentSchedule = supportsInputSchedule
        ? normalizeInputSchedule(
          inputScheduleToEvents(selectedExperiment?.inputSchedule),
          scheduledRuntimeVariables,
          accessibleModelVariables,
          resolvedActiveOptions.startTime,
          resolvedActiveOptions.stopTime,
          resolvedActiveOptions.stepSize,
        )
        : []
      const userSchedule = supportsInputSchedule
        ? normalizeInputSchedule(
          activeInputEvents,
          scheduledRuntimeVariables,
          accessibleModelVariables,
          resolvedActiveOptions.startTime,
          resolvedActiveOptions.stopTime,
          resolvedActiveOptions.stepSize,
        )
        : []
      const inputSchedule = mergeInputSchedules(experimentSchedule, userSchedule)

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
      const normalizedParameters = normalizeSimulationParameters(initializationValues, accessibleModelVariables)

      const body = {
        labId: String(lab.id ?? lab.tokenId ?? ''),
        reservationKey,
        parameters: normalizedParameters,
        options: reqOptions,
        ...(inputSchedule.length > 0 ? { inputSchedule } : {}),
      }

      const res = await fetchGateway('/api/simulations/stream', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Simulation failed (${res.status})`)
      }

      const accTime = []
      const accOutputs = {}
      let finalMeta = {}

      await readNdjsonStream(res, (event) => {
        switch (event.type) {
          case 'started':
            devLog.log('Simulation started:', event.simId)
            break
          case 'progress':
            setProgress(prev => ({ ...prev, elapsedSeconds: event.elapsedSeconds }))
            break
          case 'data':
            if (event.time) accTime.push(...event.time)
            if (event.outputs) {
              for (const [k, v] of Object.entries(event.outputs)) {
                if (!accOutputs[k]) accOutputs[k] = []
                accOutputs[k].push(...v)
              }
            }
            setProgress(prev => ({ ...prev, chunkIndex: event.chunkIndex, totalChunks: event.totalChunks }))
            setResults({ time: [...accTime], outputs: { ...accOutputs } })
            break
          case 'completed':
            finalMeta = event
            break
          case 'error':
            throw new Error(event.detail || 'Simulation error')
          default:
            break
        }
      })

      if (controller.signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError')

      setResults({
        time: accTime,
        outputs: accOutputs,
        outputVariables: finalMeta.outputVariables || Object.keys(accOutputs),
        simulationTime: finalMeta.simulationTime,
        fmiType: finalMeta.fmiType,
      })
      setSimState(SIM_STATE.COMPLETED)
      devLog.log('Simulation completed', { outputKeys: Object.keys(accOutputs), fmiType: finalMeta.fmiType })
    } catch (err) {
      if (controller.signal.aborted || err?.name === 'AbortError') {
        setErrorMsg(null)
        setSimState(SIM_STATE.CANCELLED)
      } else {
        devLog.error('Simulation error:', err)
        setErrorMsg(err.message)
        setSimState(SIM_STATE.ERROR)
      }
    } finally {
      if (simulationControllerRef.current === controller) {
        simulationControllerRef.current = null
        simulationInFlightRef.current = false
      }
    }
  }, [accessibleModelVariables, editableVariables, fetchGateway, fmuMeta.simulationType, inputEvents, isModelExchange, isScheduledExecution, lab, options, parameters, reservationKey, scheduledRuntimeVariables, selectedFmiLsExperimentId, selectableFmiLsExperiments, solver, supportsInputSchedule, twinSimulationType, variableAccess, variableAccessState])

  const handleRun = useCallback((scheduledEvents) => {
    if (twinAsset?.type === 'glb' && executionMode !== 'batch') {
      return interactiveExecution.start(executionMode)
    }
    return Array.isArray(scheduledEvents)
      ? runSimulation(null, null, scheduledEvents)
      : runSimulation()
  }, [executionMode, interactiveExecution.start, runSimulation, twinAsset?.type])

  const handleLoadResult = useCallback(async (simId) => {
    const gatewayUrl = lab.accessURI || ''
    const labId = String(lab.id ?? lab.tokenId ?? '')
    if (!gatewayUrl || !labId) return
    try {
      const resultQuery = new URLSearchParams({
        simId: String(simId),
        labId,
        reservationKey: String(reservationKey || ''),
      })
      const res = await fetchGateway(
        `/api/simulations/result?${resultQuery.toString()}`,
        { credentials: 'include' },
      )
      if (!res.ok) {
        let payload = {}
        try {
          payload = await res.json()
        } catch {
          payload = {}
        }
        const gatewayError = resolveGatewayFeatureError(res.status, payload, {
          fallbackMessage: `Failed to load result (${res.status})`,
          unavailableMessage: 'Historical simulation results are not available yet for this FMU backend.',
        })
        throw new Error(gatewayError.message)
      }
      const data = await res.json()
      if (data.result) {
        setResults(data.result)
      } else {
        setResults(data)
      }
      setSimState(SIM_STATE.COMPLETED)
    } catch (err) {
      devLog.error('Failed to load historical result:', err)
      setResults(null)
      setErrorMsg(err?.message || 'Unable to load historical simulation result')
      setSimState(SIM_STATE.ERROR)
    }
  }, [fetchGateway, lab, reservationKey])

  const resolveProxyError = useCallback((status, payload) => {
    const detailsRaw = payload?.details
    let gatewayDetail = null
    if (typeof detailsRaw === 'string') {
      try {
        gatewayDetail = JSON.parse(detailsRaw)
      } catch {
        gatewayDetail = { error: detailsRaw }
      }
    } else if (typeof detailsRaw === 'object' && detailsRaw !== null) {
      gatewayDetail = detailsRaw
    }

    const gatewayCode = String(gatewayDetail?.code || '').toUpperCase()
    if (gatewayCode === 'SESSION_TICKET_EXPIRED' || gatewayCode === 'SESSION_TICKET_ALREADY_USED') {
      return 'The reservation FMU could not be prepared. Re-enter the reserved laboratory to request a fresh file.'
    }
    if (status === 401) {
      return 'The reservation FMU could not be authorized. Re-enter the reserved laboratory and try again.'
    }
    return payload?.error || gatewayDetail?.error || `Proxy download failed (${status})`
  }, [])

  const triggerProxyDownload = useCallback(async () => {
    if (!reservationKey) return
    setProxyDownloadState('running')
    setProxyDownloadMessage(null)

    try {
      const qs = new URLSearchParams({
        labId: String(lab.id ?? lab.tokenId ?? ''),
        reservationKey: String(reservationKey),
      })
      const response = await fetchGateway(`/api/simulations/proxy?${qs.toString()}`, {
        credentials: 'include',
      })
      if (!response.ok) {
        let payload = {}
        try {
          payload = await response.json()
        } catch {
          payload = {}
        }
        throw new Error(resolveProxyError(response.status, payload))
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition') || ''
      const filenameMatch = /filename="?([^"]+)"?/i.exec(contentDisposition)
      const filename = filenameMatch?.[1] || `fmu-proxy-lab-${lab.id ?? lab.tokenId}.fmu`

      const blobUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = filename
      anchor.hidden = true
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)

      setProxyDownloadState('success')
      setProxyDownloadMessage('Reservation FMU downloaded automatically.')
    } catch (err) {
      devLog.error('Proxy FMU download failed:', err)
      setProxyDownloadState('error')
      setProxyDownloadMessage(err?.message || 'Unable to download proxy FMU')
    }
  }, [fetchGateway, lab.id, lab.tokenId, reservationKey, resolveProxyError])

  useEffect(() => {
    if (twinAssetState !== 'ready' || twinAsset?.type === 'threejs-app' || !proxyAttemptKey || proxyAttemptRef.current === proxyAttemptKey) return
    proxyAttemptRef.current = proxyAttemptKey
    void triggerProxyDownload()
  }, [proxyAttemptKey, triggerProxyDownload, twinAsset, twinAssetState])

  if (!fmuMeta || !fmuMeta.fmuFileName) {
    return (
      <div className="text-center text-neutral-300 p-8">
        No FMU metadata available for this resource.
      </div>
    )
  }

  if (variableAccessState === 'unavailable') {
    return (
      <div className="grid min-h-80 place-items-center rounded-2xl border border-[#283a42] bg-[#101a20] p-8 text-center text-sm text-[#bad0d2]" role="alert">
        An active reservation is required to access this simulation.
      </div>
    )
  }

  if (variableAccessState === 'loading') {
    return (
      <div className="grid min-h-80 place-items-center rounded-2xl border border-[#283a42] bg-[#101a20] p-8 text-sm text-[#bad0d2]" role="status">
        Checking simulation access…
      </div>
    )
  }

  if (variableAccessState === 'error') {
    return (
      <div className="grid min-h-80 place-items-center rounded-2xl border border-error-border bg-error-bg p-8 text-center text-sm text-error-text" role="alert">
        {errorMsg || 'Variable access could not be resolved for this reservation.'}
      </div>
    )
  }

  const gatewayUrl = lab.accessURI || ''

  if (twinAssetState === 'loading') {
    return (
      <div className="grid min-h-80 place-items-center rounded-2xl border border-[#283a42] bg-[#101a20] p-8 text-sm text-[#bad0d2]" role="status">
        Preparing the simulation view…
      </div>
    )
  }

  if (twinAsset?.type === 'threejs-app') {
    return (
      <div className="fixed inset-0 z-100 bg-[#07151b]">
        <DigitalTwinAppViewer
          appUrl={twinAsset.url}
          title={lab?.name || 'Digital Twin'}
          onConnect={async ({ signal }) => {
            const response = await fetchGateway('/api/simulations/connection', {
              method: 'POST', credentials: 'include', signal,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ labId: String(lab.id ?? lab.tokenId), reservationKey }),
            })
            if (!response.ok) throw new Error('The provider FMU connection could not be authorized.')
            return response.json()
          }}
          modelVariables={accessibleModelVariables}
          fmiLsParameterPresets={twinFmiLsParameterPresets}
          fmiLsExperiments={twinFmiLsExperiments}
          fmiLsStruct={variableAccess?.fmiLsStruct}
          scheduleVariables={twinScheduledRuntimeVariables}
          enableInputSchedule={supportsTwinInputSchedule}
          inputValues={parameters}
          inputEvents={inputEvents}
          onInputEventsChange={setInputEvents}
          startTime={Number(options.startTime)}
          stopTime={Number(options.stopTime)}
          stepSize={Number(options.stepSize)}
          downloadError={proxyDownloadState === 'error' ? proxyDownloadMessage : null}
          fullScreen
        />
      </div>
    )
  }

  return (
    <div>
      {twinAsset?.type === 'glb' ? (
        <>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#67d7cf]">Interactive digital twin</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{lab?.name || 'Digital Twin'}</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">Run the FMU simulation to animate the linked GLB scene.</p>
            </div>
            <div className="rounded-xl border border-[#315057] bg-[#122328] px-4 py-3 text-xs text-[#b8d2d5]">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
              FMI {variableAccess?.fmiVersion || '?'} · {simulationTypeLabel || 'FMU'}
            </div>
          </div>

          <FmiLsStructMapPanel
            fmiLsStruct={variableAccess?.fmiLsStruct}
            modelVariables={accessibleModelVariables}
            values={parameters}
            outputs={results?.outputs}
          />

          {twinEditableVariables.length === 0 && (
            <p className="rounded-xl border border-[#26383f] bg-[#142128] p-3 text-xs text-[#9aafb4]">This model has no editable input variables or parameters. Run it with its declared defaults.</p>
          )}

          <DigitalTwinSimulationForm
            variables={twinEditableVariables}
            modelVariables={twinModelVariables}
            fmiLsStruct={variableAccess?.fmiLsStruct}
            scheduleVariables={twinScheduledRuntimeVariables}
            values={parameters}
            onInputChange={handleParamChange}
            simulationOptions={options}
            onSimulationOptionChange={handleOptionChange}
            simulationType={twinSimulationType}
            configurationSelector={(
              <>
                <FmiLsResourceSelect
                  options={twinFmiLsParameterPresets}
                  selectedOptionId={selectedFmiLsParameterPresetId}
                  onSelect={handleFmiLsParameterPresetSelect}
                  disabled={simState === SIM_STATE.RUNNING || interactiveExecution.hasActiveSession}
                />
                {twinAsset?.type === 'glb' ? (
                  <FmiLsResourceSelect
                    options={twinFmiLsExperiments}
                    selectedOptionId={selectedFmiLsExperimentId}
                    onSelect={handleExperimentSelect}
                    choiceLabel="Experiment"
                    disabled={simState === SIM_STATE.RUNNING || interactiveExecution.hasActiveSession}
                  />
                ) : null}
              </>
            )}
            executionMode={executionMode}
            continuousMetrics={interactiveExecution.mode === 'continuous' && interactiveExecution.hasActiveSession ? interactiveExecution.batchMetrics : null}
            executionModeControl={supportsInteractiveTwinModes ? (
              <DigitalTwinExecutionModeSelector
                executionMode={executionMode}
                onExecutionModeChange={setExecutionMode}
                executionModes={['batch', 'step', 'continuous']}
                batchPolicy={continuousBatchPolicy}
                onBatchPolicyChange={setContinuousBatchPolicy}
                fixedBatchSamples={fixedBatchSamples}
                onFixedBatchSamplesChange={setFixedBatchSamples}
                running={simState === SIM_STATE.RUNNING}
                status={interactiveExecution.status}
              />
            ) : null}
            executionSessionControls={supportsInteractiveTwinModes ? (
              <DigitalTwinExecutionSessionActions
                status={interactiveExecution.status}
                mode={interactiveExecution.mode}
                simulationTime={interactiveExecution.simulationTime}
                onAdvanceStep={() => void interactiveExecution.advanceStep()}
                onToggleContinuous={() => interactiveExecution.status === 'continuous'
                  ? interactiveExecution.pauseContinuous()
                  : void interactiveExecution.startContinuous()}
                onEnd={interactiveExecution.end}
                onCancel={interactiveExecution.end}
                runtimeVariables={twinScheduledRuntimeVariables}
                modelVariables={twinModelVariables}
                fmiLsStruct={variableAccess?.fmiLsStruct}
                values={interactiveExecution.liveParameters}
                runtimeInputEditing={interactiveExecution.runtimeInputEditing}
                onInputChange={interactiveExecution.handleInputChange}
              />
            ) : null}
            stickyToolbar
            stickyToolbarOffset={80}
            enableInputSchedule={supportsTwinInputSchedule && executionMode === 'batch'}
            inputEvents={inputEvents}
            onInputEventsChange={setInputEvents}
            running={simState === SIM_STATE.RUNNING}
            showRunButton={!interactiveExecution.hasActiveSession || executionMode === 'batch'}
            onRun={handleRun}
          />

          {reservationKey && proxyDownloadState !== 'idle' && (
            <p role={proxyDownloadState === 'error' ? 'alert' : 'status'} className={`mb-4 text-xs ${proxyDownloadState === 'error' ? 'text-error-text' : 'text-[#9aafb4]'}`}>
              {proxyDownloadState === 'running' ? 'Preparing the reservation FMU…' : proxyDownloadMessage}
            </p>
          )}
          {simState === SIM_STATE.RUNNING && executionMode === 'batch' && <div className="mt-3"><SimulationProgress elapsedSeconds={progress.elapsedSeconds} chunkIndex={progress.chunkIndex} totalChunks={progress.totalChunks} /></div>}
          {simState === SIM_STATE.ERROR && errorMsg && <p role="alert" className="mt-3 rounded-lg border border-error-border bg-error-bg p-3 text-sm text-error-text">{errorMsg}</p>}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-header-bg">Simulation: {lab?.name || 'Untitled FMU'}</h2>
              <p className="mt-1 text-sm text-text-secondary">{fmuMeta.fmuFileName} &middot; FMI {fmuMeta.fmiVersion || '?'} &middot; {simulationTypeLabel || '?'}</p>
            </div>
            <button onClick={() => setShowHistory((visible) => !visible)} className="text-xs text-brand hover:underline">
              {showHistory ? 'Hide History' : 'Show History'}
            </button>
          </div>

          <FmiLsStructMapPanel
            fmiLsStruct={variableAccess?.fmiLsStruct}
            modelVariables={accessibleModelVariables}
            values={parameters}
            outputs={results?.outputs}
          />

          {reservationKey && proxyDownloadState !== 'idle' && (
            <p role={proxyDownloadState === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-3 text-xs ${proxyDownloadState === 'error' ? 'border-error-border bg-error-bg text-error-text' : 'border-[#2a2f33] bg-[#1f2426] text-text-secondary'}`}>
              {proxyDownloadState === 'running' ? 'Preparing the reservation FMU…' : proxyDownloadMessage}
            </p>
          )}

          {showHistory && (
            <SimulationHistory
              labId={String(lab.id ?? lab.tokenId ?? '')}
              reservationKey={reservationKey}
              gatewayUrl={gatewayUrl}
              gatewaySessionOrigin={gatewaySessionOrigin}
              onEnsureGatewaySession={ensureGatewaySession}
              onFetchGateway={fetchGateway}
              onLoadResult={handleLoadResult}
            />
          )}

          {editableVariables.length > 0 && (
            <FmiLsResourceSelect
              options={editableFmiLsParameterPresets}
              selectedOptionId={selectedFmiLsParameterPresetId}
              onSelect={handleFmiLsParameterPresetSelect}
              disabled={simState === SIM_STATE.RUNNING}
            />
          )}

          {selectableFmiLsExperiments.length > 0 && (
            <FmiLsResourceSelect
              options={selectableFmiLsExperiments}
              selectedOptionId={selectedFmiLsExperimentId}
              onSelect={handleExperimentSelect}
              choiceLabel="Experiment"
              disabled={simState === SIM_STATE.RUNNING}
            />
          )}

          {editableVariables.length > 0 && (
            <ParameterForm
              variables={editableVariables}
              modelVariables={accessibleModelVariables}
              fmiLsStruct={variableAccess?.fmiLsStruct}
              values={parameters}
              onChange={handleParamChange}
              disabled={simState === SIM_STATE.RUNNING}
            />
          )}

          {supportsInputSchedule && scheduledRuntimeVariables.length > 0 && (
            <InputScheduleEditor
              variables={scheduledRuntimeVariables}
              modelVariables={accessibleModelVariables}
              initialValues={parameters}
              events={inputEvents}
              startTime={Number(options.startTime)}
              stopTime={Number(options.stopTime)}
              stepSize={Number(options.stepSize)}
              validationError={inputScheduleError}
              disabled={simState === SIM_STATE.RUNNING}
              onChange={setInputEvents}
            />
          )}

          <SimulationOptions
            options={options}
            onChange={handleOptionChange}
            simulationType={fmuMeta.simulationType}
            disabled={simState === SIM_STATE.RUNNING}
          />

          {isModelExchange && (
            <div className="flex items-center gap-3">
              <label htmlFor="solver-select" className="text-xs text-text-secondary">ODE Solver:</label>
              <select
                id="solver-select"
                value={solver}
                onChange={(event) => setSolver(event.target.value)}
                disabled={simState === SIM_STATE.RUNNING}
                className="bg-[#1f2426] border border-[#2a2f33] rounded px-2 py-1 text-neutral-200 text-sm focus:outline-none focus:border-brand disabled:opacity-50"
              >
                <option value="Euler">Euler (fast, less accurate)</option>
                <option value="CVode">CVode (adaptive, more accurate)</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              onClick={handleRun}
              disabled={simState === SIM_STATE.RUNNING || Boolean(inputScheduleError) || Boolean(simulationOptionsError)}
              className={`rounded px-6 py-2 font-medium transition-colors ${simState === SIM_STATE.RUNNING || inputScheduleError || simulationOptionsError ? 'cursor-not-allowed bg-gray-600 text-gray-400' : 'bg-brand text-white hover:bg-hover-dark'}`}
            >
              {simState === SIM_STATE.RUNNING ? 'Running…' : simState === SIM_STATE.COMPLETED ? 'Re-run Simulation' : 'Run Simulation'}
            </button>
          </div>

          {simState === SIM_STATE.RUNNING && <SimulationProgress elapsedSeconds={progress.elapsedSeconds} chunkIndex={progress.chunkIndex} totalChunks={progress.totalChunks} />}
          {simState === SIM_STATE.ERROR && errorMsg && (
            <div className="rounded-lg border border-error-border bg-error-bg p-4">
              <p className="text-sm font-medium text-error-text">Simulation Error</p>
              <p className="mt-1 text-sm text-error-text">{errorMsg}</p>
            </div>
          )}

          {(simState === SIM_STATE.COMPLETED || (simState === SIM_STATE.RUNNING && results)) && results && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-header-bg">
                Results
                {results.fmiType && <span className="ml-2 text-xs font-normal text-text-secondary">({results.fmiType})</span>}
              </h3>
              {results.outputs && Object.keys(results.outputs).length > 0 && (
                <ResultsChart outputs={results.outputs} time={results.time} variableMetadata={accessibleModelVariables} />
              )}
              {simState === SIM_STATE.COMPLETED && results.outputs && (
                <ResultsTable outputs={results.outputs} time={results.time} variableMetadata={accessibleModelVariables} />
              )}
              {simState === SIM_STATE.COMPLETED && (
                <DownloadButtons results={results} labName={lab?.name} variableMetadata={accessibleModelVariables} />
              )}
            </div>
          )}
        </>
      )}

      {twinAsset?.type === 'glb' && (
        <DigitalTwinViewer
          sceneUrl={twinAsset.url}
          title={lab?.name || 'Digital Twin'}
          results={results}
          modelVariables={twinModelVariables}
          inputValues={sceneInputValues}
          interactiveInputVariables={sceneInputVariables}
          inputEditingEnabled={sceneInputVariables.length > 0}
          onInputChange={interactiveExecution.handleInputChange}
          isRunning={simState === SIM_STATE.RUNNING}
          startTime={Number(options.startTime)}
          stopTime={Number(options.stopTime)}
          followLatest={interactiveExecution.mode !== null}
          onDisplayedSampleChange={interactiveExecution.reportDisplayedSample}
        />
      )}
    </div>
  )
}

SimulationRunner.propTypes = {
  lab: PropTypes.object.isRequired,
  reservationKey: PropTypes.string,
}
