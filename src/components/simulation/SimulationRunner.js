"use client";
import React, { useState, useCallback, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import PropTypes from 'prop-types'
import { getFmuMetadata, formatFmuSimulationType } from '@/utils/resourceType'
import devLog from '@/utils/dev/logger'
import { MAX_SAMPLES_PER_BATCH } from '@decentralabs/digital-twin-app-protocol'
import { normalizeInputSchedule } from './simulationParameters'
import { getInitialSimulationOptions, getSimulationOptionsError } from './simulationTime'
import useInteractiveTwinExecution from './useInteractiveTwinExecution'
import useSimulationGatewaySession from './useSimulationGatewaySession'
import useDigitalTwinAssetDiscovery from './useDigitalTwinAssetDiscovery'
import { supportsFmiLsInteractiveModes } from '@/utils/fmiLsEligibility'
import useSimulationModelResources from './useSimulationModelResources'
import useSimulationExecution, { SIM_STATE } from './useSimulationExecution'
import useProxyFmuDownload from './useProxyFmuDownload'
import { GlbSimulationPanel, GenericFmuSimulationPanel } from './SimulationRunnerPanels'

const DigitalTwinViewer = dynamic(() => import('./DigitalTwinViewer'), { ssr: false })
const DigitalTwinAppViewer = dynamic(() => import('./DigitalTwinAppViewer'), { ssr: false })

export default function SimulationRunner({ lab, reservationKey }) {
  const fmuMeta = getFmuMetadata(lab)
  const { gatewaySessionOrigin, ensureGatewaySession, fetchGateway } = useSimulationGatewaySession({ lab, reservationKey })

  const [parameters, setParameters] = useState({})
  const [inputEvents, setInputEvents] = useState([])
  const [options, setOptions] = useState(() => getInitialSimulationOptions(fmuMeta))
  const [showHistory, setShowHistory] = useState(false)
  const [variableAccess, setVariableAccess] = useState(null)
  const [variableAccessState, setVariableAccessState] = useState(reservationKey ? 'loading' : 'unavailable')
  const [fmiLsParameterPresets, setFmiLsParameterPresets] = useState([])
  const [selectedFmiLsParameterPresetId, setSelectedFmiLsParameterPresetId] = useState('')
  const [selectedFmiLsExperimentId, setSelectedFmiLsExperimentId] = useState('')
  const [executionMode, setExecutionMode] = useState('batch')
  const [continuousBatchPolicy, setContinuousBatchPolicy] = useState('adaptive')
  const [fixedBatchSamples, setFixedBatchSamples] = useState(MAX_SAMPLES_PER_BATCH)
  const modelVariables = Array.isArray(variableAccess?.modelVariables) ? variableAccess.modelVariables : []

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
  const proxyDownload = useProxyFmuDownload({
    fetchGateway,
    lab,
    reservationKey,
    hasFmuMetadata: Boolean(fmuMeta?.fmuFileName),
    twinAsset,
    twinAssetState,
  })
  const { state: proxyDownloadState, message: proxyDownloadMessage } = proxyDownload
  const modelResources = useSimulationModelResources({
    modelVariables,
    access: variableAccess,
    parameterPresets: fmiLsParameterPresets,
    aasSimulationVariables,
  })
  const {
    accessibleModelVariables,
    editableVariables,
    editableFmiLsParameterPresets,
    scheduledRuntimeVariables,
    fmiLsExperiments: genericFmiLsExperiments,
    twinVariableResolution,
    twinModelVariables,
    twinEditableVariables,
    twinScheduledRuntimeVariables,
    twinFmiLsParameterPresets,
    twinFmiLsExperiments,
  } = modelResources
  let inputScheduleError = ''
  const simulationOptionsError = getSimulationOptionsError(options, { includeStepSize: !isScheduledExecution })
  if (supportsInputSchedule && inputEvents.length > 0 && !simulationOptionsError) {
    try {
      normalizeInputSchedule(inputEvents, scheduledRuntimeVariables, accessibleModelVariables, options.startTime, options.stopTime, options.stepSize)
    } catch (error) {
      inputScheduleError = error.message
    }
  }
  const selectableFmiLsExperiments = twinAsset ? twinFmiLsExperiments : genericFmiLsExperiments
  const execution = useSimulationExecution({
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
    solver,
    twinSimulationType,
  })
  const {
    simState,
    results,
    errorMsg,
    setErrorMsg,
    progress,
    runSimulation,
    loadResult: handleLoadResult,
    appendInteractiveSamples,
    handleInteractiveRunStart,
    handleInteractiveRunFinish,
  } = execution
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

  const handleRun = useCallback((scheduledEvents) => {
    if (twinAsset?.type === 'glb' && executionMode !== 'batch') {
      return interactiveExecution.start(executionMode)
    }
    return Array.isArray(scheduledEvents)
      ? runSimulation(null, null, scheduledEvents)
      : runSimulation()
  }, [executionMode, interactiveExecution.start, runSimulation, twinAsset?.type])

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
        <GlbSimulationPanel
          lab={lab}
          model={{ fmiVersion: variableAccess?.fmiVersion, simulationTypeLabel, fmiLsStruct: variableAccess?.fmiLsStruct }}
          resources={{ modelVariables: twinModelVariables, structModelVariables: accessibleModelVariables, editableVariables: twinEditableVariables, runtimeVariables: twinScheduledRuntimeVariables }}
          simulation={{
            simulationType: twinSimulationType,
            enableInputSchedule: supportsTwinInputSchedule,
            parameters,
            onParameterChange: handleParamChange,
            options,
            onOptionChange: handleOptionChange,
            inputEvents,
            onInputEventsChange: setInputEvents,
            onRun: handleRun,
            results,
          }}
          configuration={{
            presets: twinFmiLsParameterPresets,
            experiments: twinFmiLsExperiments,
            selectedPresetId: selectedFmiLsParameterPresetId,
            selectedExperimentId: selectedFmiLsExperimentId,
            onPresetSelect: handleFmiLsParameterPresetSelect,
            onExperimentSelect: handleExperimentSelect,
          }}
          interactive={{
            executionMode,
            onExecutionModeChange: setExecutionMode,
            continuousBatchPolicy,
            onContinuousBatchPolicyChange: setContinuousBatchPolicy,
            fixedBatchSamples,
            onFixedBatchSamplesChange: setFixedBatchSamples,
            supportedModes: supportsInteractiveTwinModes,
            execution: interactiveExecution,
            state: simState,
            progress,
            errorMessage: errorMsg,
          }}
          proxy={{ visible: Boolean(reservationKey), state: proxyDownloadState, message: proxyDownloadMessage }}
        />
      ) : (
        <GenericFmuSimulationPanel
          lab={lab}
          fmuMeta={fmuMeta}
          simulationTypeLabel={simulationTypeLabel}
          model={{ fmiLsStruct: variableAccess?.fmiLsStruct }}
          resources={{ modelVariables: accessibleModelVariables, editableVariables, runtimeVariables: scheduledRuntimeVariables }}
          simulation={{
            state: simState,
            results,
            errorMessage: errorMsg,
            progress,
            parameters,
            onParameterChange: handleParamChange,
            options,
            onOptionChange: handleOptionChange,
            inputEvents,
            onInputEventsChange: setInputEvents,
            onRun: handleRun,
            solver,
            onSolverChange: setSolver,
            optionsError: simulationOptionsError,
            scheduleError: inputScheduleError,
            supportsInputSchedule,
          }}
          configuration={{
            presets: editableFmiLsParameterPresets,
            experiments: selectableFmiLsExperiments,
            selectedPresetId: selectedFmiLsParameterPresetId,
            selectedExperimentId: selectedFmiLsExperimentId,
            onPresetSelect: handleFmiLsParameterPresetSelect,
            onExperimentSelect: handleExperimentSelect,
          }}
          history={{
            visible: showHistory,
            onToggle: () => setShowHistory((visible) => !visible),
            reservationKey,
            gatewayUrl,
            gatewaySessionOrigin,
            onEnsureGatewaySession: ensureGatewaySession,
            onFetchGateway: fetchGateway,
            onLoadResult: handleLoadResult,
          }}
          proxy={{ visible: Boolean(reservationKey), state: proxyDownloadState, message: proxyDownloadMessage }}
        />
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
