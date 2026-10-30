'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import Modal from '@/components/ui/Modal'
import InputScheduleDialog from './InputScheduleDialog'
import PlaybackRateControl from './PlaybackRateControl'
import FmiLsResourceSelect from './FmiLsResourceSelect'
import { normalizeInputSchedule } from './simulationParameters'
import FmiLsStructMapPanel from './FmiLsStructMapPanel'
import { getFmiLsStructMapSeries } from '@/utils/fmiLsStruct'
import { canScheduleFmiLsInputChanges } from '@/utils/fmiLsEligibility'
import {
  DIGITAL_TWIN_CAPABILITY, DIGITAL_TWIN_MESSAGE as MESSAGE, isValidAppMessage,
  isValidFmiLsExperiment, isValidHostMessage, makeProtocolMessage, isRecord,
} from './digitalTwinAppProtocol'

const PLAYBACK_RATE_CAPABILITY = DIGITAL_TWIN_CAPABILITY.PLAYBACK_RATE
const FMI_LS_PARAMETER_PRESETS_CAPABILITY = DIGITAL_TWIN_CAPABILITY.FMI_LS_PARAMETER_PRESETS
const FMI_LS_EXPERIMENTS_CAPABILITY = DIGITAL_TWIN_CAPABILITY.FMI_LS_EXPERIMENTS

export default function DigitalTwinAppViewer({
  appUrl, title = 'Digital Twin', onConnect, modelVariables = [], fmiLsParameterPresets = [], fmiLsExperiments = [], enableInputSchedule = false,
  scheduleVariables,
  inputValues = {}, inputEvents = [], onInputEventsChange, startTime = 0, stopTime = 1, stepSize,
  fmiLsStruct,
  onModelChangeRequest, hostExtensions = {}, downloadError, simulationError, fullScreen = false,
}) {
  const iframeRef = useRef(null)
  const controlsButtonRef = useRef(null)
  const controlsMenuRef = useRef(null)
  const connectRef = useRef(onConnect)
  const modelChangeRef = useRef(onModelChangeRequest)
  const extensionRef = useRef(hostExtensions)
  const grantRef = useRef(null)
  const loadedDocumentRef = useRef(false)
  const hostReadyAttemptedRef = useRef(false)
  const hostReadyRetryTimerRef = useRef(null)
  const stateRef = useRef('loading')
  connectRef.current = onConnect
  modelChangeRef.current = onModelChangeRequest
  extensionRef.current = hostExtensions
  const [appState, setAppState] = useState('loading')
  const [appFailureReason, setAppFailureReason] = useState('')
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [activeControlDialog, setActiveControlDialog] = useState(null)
  const [appCapabilities, setAppCapabilities] = useState([])
  const [playbackRate, setPlaybackRate] = useState(1)
  const [execution, setExecution] = useState({ state: 'idle' })
  const [selectedFmiLsParameterPresetId, setSelectedFmiLsParameterPresetId] = useState('')
  const [selectedFmiLsExperimentId, setSelectedFmiLsExperimentId] = useState('')
  const parameterPresetsInitializedRef = useRef(false)
  const isRunning = execution.state === 'running'
  const activeRunId = execution.runId
  const modelDuration = Number(execution.options?.stopTime ?? stopTime) - Number(execution.options?.startTime ?? startTime)
  const scheduledVariables = useMemo(
    () => (Array.isArray(scheduleVariables)
      ? scheduleVariables
      : modelVariables.filter((variable) => variable?.causality === 'input')),
    [modelVariables, scheduleVariables],
  )
  const fmiLsStructMapSeriesCount = useMemo(
    () => getFmiLsStructMapSeries(fmiLsStruct, modelVariables).length,
    [fmiLsStruct, modelVariables],
  )
  const availableFmiLsParameterPresets = useMemo(
    () => (Array.isArray(fmiLsParameterPresets) ? fmiLsParameterPresets : []).filter((preset) => (
      preset && typeof preset.id === 'string' && typeof preset.name === 'string'
      && preset.parameters && typeof preset.parameters === 'object' && !Array.isArray(preset.parameters)
      && Object.keys(preset.parameters).length > 0 && Object.keys(preset.parameters).length <= 256
      && Object.entries(preset.parameters).every(([name, value]) => (
        typeof name === 'string' && name.length > 0 && name.length <= 256
        && (typeof value === 'boolean'
          || (typeof value === 'number' && Number.isFinite(value))
          || (typeof value === 'string' && value.length <= 1024))
      ))
    )),
    [fmiLsParameterPresets],
  )
  const availableFmiLsExperiments = useMemo(
    () => (Array.isArray(fmiLsExperiments) ? fmiLsExperiments : []).filter(isValidFmiLsExperiment),
    [fmiLsExperiments],
  )
  const selectedFmiLsParameterPreset = availableFmiLsParameterPresets.find((preset) => preset.id === selectedFmiLsParameterPresetId)
  const selectedFmiLsExperiment = availableFmiLsExperiments.find((experiment) => experiment.id === selectedFmiLsExperimentId)
  const hasSystemConfigurationControl = appState === 'ready'
    && availableFmiLsParameterPresets.length > 0
    && appCapabilities.includes(FMI_LS_PARAMETER_PRESETS_CAPABILITY)
  const hasFmiLsExperimentsControl = appState === 'ready'
    && availableFmiLsExperiments.length > 0
    && appCapabilities.includes(FMI_LS_EXPERIMENTS_CAPABILITY)
  const hasPlaybackRateControl = appState === 'ready' && appCapabilities.includes(PLAYBACK_RATE_CAPABILITY)
  const hasScheduleControl = appState === 'ready'
    && canScheduleFmiLsInputChanges(enableInputSchedule, scheduledVariables)
  const hasFmiLsStructMapsControl = appState === 'ready' && fmiLsStructMapSeriesCount > 0
  const hasCancelControl = Boolean(isRunning && activeRunId
    && appCapabilities.includes(DIGITAL_TWIN_CAPABILITY.EXECUTION_CONTROL))
  const hasFloatingControls = hasSystemConfigurationControl || hasFmiLsExperimentsControl || hasPlaybackRateControl
    || hasScheduleControl || hasFmiLsStructMapsControl || hasCancelControl
  const scheduledInputEvents = Array.isArray(inputEvents) ? inputEvents : []
  const updateScheduledInputEvents = onInputEventsChange || (() => {})
  let scheduleError = ''
  try {
    if (enableInputSchedule && scheduledInputEvents.length) normalizeInputSchedule(
      scheduledInputEvents,
      scheduledVariables,
      modelVariables,
      selectedFmiLsExperiment?.options.startTime ?? startTime,
      selectedFmiLsExperiment?.options.stopTime ?? stopTime,
      selectedFmiLsExperiment?.options.stepSize ?? stepSize,
    )
  } catch (error) { scheduleError = error.message }

  useEffect(() => {
    if (!parameterPresetsInitializedRef.current && availableFmiLsParameterPresets.length > 0) {
      parameterPresetsInitializedRef.current = true
      setSelectedFmiLsParameterPresetId(availableFmiLsParameterPresets[0].id)
      return
    }
    if (selectedFmiLsParameterPresetId && !selectedFmiLsParameterPreset) setSelectedFmiLsParameterPresetId('')
  }, [availableFmiLsParameterPresets, selectedFmiLsParameterPreset, selectedFmiLsParameterPresetId])

  useEffect(() => {
    if (selectedFmiLsExperimentId && !selectedFmiLsExperiment) setSelectedFmiLsExperimentId('')
  }, [availableFmiLsExperiments, selectedFmiLsExperiment, selectedFmiLsExperimentId])

  useEffect(() => {
    if (appState !== 'ready' || !appCapabilities.includes(FMI_LS_PARAMETER_PRESETS_CAPABILITY) || !selectedFmiLsParameterPreset) return
    send(MESSAGE.FMI_LS_PARAMETER_PRESET, {
      id: selectedFmiLsParameterPreset.id,
      name: selectedFmiLsParameterPreset.name,
      description: selectedFmiLsParameterPreset.description || '',
      parameters: selectedFmiLsParameterPreset.parameters,
    })
  }, [appCapabilities, appState, selectedFmiLsParameterPreset])

  useEffect(() => {
    if (appState !== 'ready' || !appCapabilities.includes(FMI_LS_EXPERIMENTS_CAPABILITY)) return
    send(MESSAGE.FMI_LS_EXPERIMENT, { experiment: selectedFmiLsExperiment || null })
  }, [appCapabilities, appState, selectedFmiLsExperiment])

  function send(type, payload = {}) {
    const message = makeProtocolMessage(type, payload)
    if (isValidHostMessage(message)) iframeRef.current?.contentWindow?.postMessage(message, '*')
  }

  function sendHostReady() {
    hostReadyAttemptedRef.current = true
    send(MESSAGE.HOST_READY, isRecord(extensionRef.current) && Object.keys(extensionRef.current).length ? { extensions: extensionRef.current } : {})
  }

  function clearHostReadyRetry() {
    if (hostReadyRetryTimerRef.current === null) return
    window.clearTimeout(hostReadyRetryTimerRef.current)
    hostReadyRetryTimerRef.current = null
  }

  function scheduleHostReadyRetry() {
    clearHostReadyRetry()
    hostReadyRetryTimerRef.current = window.setTimeout(() => {
      hostReadyRetryTimerRef.current = null
      if (stateRef.current === 'loading') sendHostReady()
    }, 250)
  }

  useEffect(() => {
    stateRef.current = 'loading'
    loadedDocumentRef.current = false
    hostReadyAttemptedRef.current = false
    setAppState('loading')
    setAppFailureReason('')
    setFrameLoaded(false)
    setControlsOpen(false)
    setActiveControlDialog(null)
    setAppCapabilities([])
    setPlaybackRate(1)
    setExecution({ state: 'idle' })
    setSelectedFmiLsExperimentId('')
    const timeout = window.setTimeout(() => {
      if (stateRef.current !== 'loading') return
      clearHostReadyRetry()
      stateRef.current = 'error'
      setAppState('error')
      setAppFailureReason('The provider application did not initialize successfully. Check its bundled assets and browser console errors.')
    }, 30_000)
    return () => {
      window.clearTimeout(timeout)
      clearHostReadyRetry()
      grantRef.current?.abort()
      grantRef.current = null
    }
  }, [appUrl, reloadKey])

  useEffect(() => {
    async function receive(event) {
      if (event.source !== iframeRef.current?.contentWindow || !isValidAppMessage(event.data)) return
      const message = event.data
      if (message.type === MESSAGE.APP_HELLO) {
        if (stateRef.current !== 'loading') return
        // The initial iframe load can precede the app's listener. A late hello
        // means the app may have missed that first host-ready message.
        sendHostReady()
        scheduleHostReadyRetry()
      } else if (message.type === MESSAGE.APP_READY) {
        if (stateRef.current !== 'loading') return
        clearHostReadyRetry()
        stateRef.current = 'ready'
        setAppState('ready')
        setAppCapabilities(message.capabilities || [])
        setPlaybackRate(message.defaultPlaybackRate || 1)
      } else if (message.type === MESSAGE.APP_ERROR) {
        clearHostReadyRetry()
        stateRef.current = 'error'
        setAppState('error')
      } else if (message.type === MESSAGE.EXECUTION_STATE && stateRef.current === 'ready') {
        setExecution({ state: message.state, runId: message.runId, options: message.options })
      } else if (message.type === MESSAGE.MODEL_CHANGE && stateRef.current === 'ready') {
        modelChangeRef.current?.(message.modelId)
      } else if (message.type === MESSAGE.CONNECTION_REQUEST && stateRef.current === 'ready') {
        const target = event.source
        const reply = (type, payload) => {
          const response = makeProtocolMessage(type, { requestId: message.requestId, ...payload })
          if (target === iframeRef.current?.contentWindow && isValidHostMessage(response)) target.postMessage(response, '*')
        }
        if (grantRef.current || typeof connectRef.current !== 'function') {
          reply(MESSAGE.CONNECTION_ERROR, { code: 'CONNECTION_UNAVAILABLE' })
          return
        }
        const controller = new AbortController()
        grantRef.current = controller
        try {
          const runOptions = { ...(message.options || {}), ...(selectedFmiLsExperiment?.options || {}) }
          const interval = { startTime, stopTime, stepSize, ...runOptions }
          const schedule = enableInputSchedule
            ? normalizeInputSchedule(scheduledInputEvents, scheduledVariables, modelVariables, interval.startTime, interval.stopTime, interval.stepSize)
            : []
          const connection = await connectRef.current({ options: runOptions, signal: controller.signal })
          if (!controller.signal.aborted) reply(MESSAGE.CONNECTION_READY, { connection, inputSchedule: schedule })
        } catch {
          if (!controller.signal.aborted) reply(MESSAGE.CONNECTION_ERROR, { code: 'CONNECTION_AUTHORIZATION_FAILED' })
        } finally {
          if (grantRef.current === controller) grantRef.current = null
        }
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [enableInputSchedule, scheduledVariables, modelVariables, inputEvents, startTime, stopTime, stepSize, selectedFmiLsExperiment])

  useEffect(() => {
    if (appState === 'ready' && appCapabilities.includes(PLAYBACK_RATE_CAPABILITY)) {
      send(MESSAGE.PLAYBACK_CONTROL, { rate: playbackRate, rateUnit: 'model-seconds-per-real-second' })
    }
  }, [appCapabilities, appState, playbackRate])

  useEffect(() => {
    if (!controlsOpen) return undefined

    const closeOnOutsidePointer = (event) => {
      if (controlsMenuRef.current?.contains(event.target) || controlsButtonRef.current?.contains(event.target)
        || event.target.closest?.('[data-fmi-ls-option-listbox]')) return
      setControlsOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape' || activeControlDialog) return
      setControlsOpen(false)
      controlsButtonRef.current?.focus()
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [activeControlDialog, controlsOpen])

  function handleFrameLoad() {
    if (loadedDocumentRef.current) {
      grantRef.current?.abort()
      grantRef.current = null
      clearHostReadyRetry()
      hostReadyAttemptedRef.current = false
      stateRef.current = 'loading'
      setAppState('loading')
      setExecution({ state: 'idle' })
    }
    loadedDocumentRef.current = true
    setFrameLoaded(true)
    if (stateRef.current === 'loading' && !hostReadyAttemptedRef.current) {
      sendHostReady()
      scheduleHostReadyRetry()
    }
  }
  function cancelCurrentSimulation() {
    if (activeRunId) send(MESSAGE.EXECUTION_CANCEL, { runId: activeRunId })
  }

  return (
    <section className={fullScreen
      ? 'relative h-screen min-h-0 w-screen overflow-hidden bg-[#07151b]'
      : 'relative h-[min(82vh,60rem)] min-h-128 w-full overflow-hidden rounded-xl border border-[#253840] bg-[#07151b]'}>
      <iframe
        key={`${appUrl}:${reloadKey}`}
        ref={iframeRef}
        src={appUrl}
        title={`${title} digital twin application`}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        onLoad={handleFrameLoad}
        onError={() => {
          grantRef.current?.abort()
          clearHostReadyRetry()
          stateRef.current = 'error'
          setAppState('error')
        }}
        className="absolute inset-0 h-full w-full border-0"
      />
      {appState === 'loading' && (
        <div className="absolute inset-0 grid place-items-center bg-[#07151b]/90 p-6 text-center text-sm text-[#c4d9dd]" role="status" aria-live="polite">
          {frameLoaded ? 'Waiting for the application scene to initialize…' : 'Loading the provider application…'}
        </div>
      )}
      {appState === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-[#07151b]/95 p-6 text-center text-sm text-[#f5b4ba]" role="alert">
          <div className="max-w-md">
            <p>{appFailureReason || 'The provider application did not initialize successfully. Check its bundled assets and browser console errors.'}</p>
            <button
              type="button"
              onClick={() => setReloadKey((current) => current + 1)}
              className="mt-4 rounded-lg border border-[#7b4650] bg-[#321d24] px-4 py-2 text-xs font-semibold text-[#ffd2d7] transition hover:bg-[#48252e]"
            >
              Retry application
            </button>
          </div>
        </div>
      )}
      {downloadError && appState !== 'loading' && appState !== 'error' && (
        <div className="absolute left-3 right-3 top-3 rounded-lg border border-[#7b4650] bg-[#321d24]/95 px-4 py-3 text-xs text-[#ffd2d7] shadow-xl sm:left-6 sm:right-6 sm:top-6" role="alert">
          {downloadError}
        </div>
      )}
      {hasFloatingControls && (
        <>
          {controlsOpen && (
            <section
              ref={controlsMenuRef}
              id="digital-twin-controls-menu"
              aria-label="Digital twin controls"
              className="absolute bottom-[4.5rem] left-4 z-40 max-h-[min(74vh,44rem)] w-[min(15.5rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-[#36535a] bg-[#08181d]/95 p-3 text-left shadow-2xl backdrop-blur-xl sm:bottom-[5rem] sm:left-6 sm:p-4"
            >
              <div className="mb-3 border-b border-[#263a42] pb-3">
                <h2 className="text-sm font-semibold text-white">Digital twin controls</h2>
              </div>
              <div className="grid gap-3">
                {hasSystemConfigurationControl ? (
                  <FmiLsResourceSelect
                    options={availableFmiLsParameterPresets}
                    selectedOptionId={selectedFmiLsParameterPresetId}
                    onSelect={(id) => {
                      setSelectedFmiLsExperimentId('')
                      setSelectedFmiLsParameterPresetId(id)
                    }}
                    disabled={isRunning}
                    fullWidth
                  />
                ) : null}

                {hasFmiLsExperimentsControl ? (
                  <FmiLsResourceSelect
                    options={availableFmiLsExperiments}
                    selectedOptionId={selectedFmiLsExperimentId}
                    onSelect={(id) => {
                      setSelectedFmiLsParameterPresetId('')
                      setSelectedFmiLsExperimentId(id)
                    }}
                    choiceLabel="Experiment"
                    disabled={isRunning}
                    fullWidth
                  />
                ) : null}

                {hasPlaybackRateControl ? (
                  <PlaybackRateControl
                    rate={playbackRate}
                    onChange={setPlaybackRate}
                    modelDuration={modelDuration}
                    disabled={isRunning}
                  />
                ) : null}

                {hasScheduleControl ? (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setActiveControlDialog('schedule')}
                    disabled={isRunning}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[#30464d] bg-[#101d23] px-3 py-2 text-left transition hover:border-[#54d5c9] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>
                      <span className="block text-xs font-semibold text-[#dce9e9]">Schedule changes</span>
                      <span className="mt-1 block text-[11px] text-[#91a9ae]">Set inputs at simulation times</span>
                    </span>
                    <span className="rounded-full bg-[#20363d] px-2 py-0.5 font-mono text-[10px] text-[#9ab8bd]">{scheduledInputEvents.length}</span>
                  </button>
                ) : null}

                {hasFmiLsStructMapsControl ? (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setActiveControlDialog('maps')}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[#30464d] bg-[#101d23] px-3 py-2 text-left transition hover:border-[#54d5c9]"
                  >
                    <span>
                      <span className="block text-xs font-semibold text-[#dce9e9]">FMI-LS-STRUCT maps</span>
                      <span className="mt-1 block text-[11px] text-[#91a9ae]">View reference performance curves</span>
                    </span>
                    <span className="rounded-full bg-[#20363d] px-2 py-0.5 font-mono text-[10px] text-[#9ab8bd]">{mapSeriesCount}</span>
                  </button>
                ) : null}

                {hasCancelControl ? (
                  <button
                    type="button"
                    onClick={cancelCurrentSimulation}
                    className="min-h-11 rounded-xl border border-[#7b4650] bg-[#321d24] px-3 py-2 text-left text-xs font-semibold text-[#ffd2d7] transition hover:bg-[#48252e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8e9b]"
                  >
                    Cancel simulation
                  </button>
                ) : null}
              </div>
            </section>
          )}
          <button
            ref={controlsButtonRef}
            type="button"
            aria-label={controlsOpen ? 'Close digital twin controls' : 'Open digital twin controls'}
            aria-expanded={controlsOpen}
            aria-controls={controlsOpen ? 'digital-twin-controls-menu' : undefined}
            title={controlsOpen ? 'Close digital twin controls' : 'Digital twin controls'}
            onClick={() => setControlsOpen((open) => !open)}
            className="absolute bottom-4 left-4 z-50 grid h-12 w-12 place-items-center rounded-full border border-[#5c858b] bg-[#0b252b] text-[#bffff3] shadow-2xl transition hover:border-[#8bffe4] hover:bg-[#12383d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9] sm:bottom-6 sm:left-6"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              {controlsOpen ? (
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <>
                  <path d="M4 7h9m4 0h3M4 17h3m4 0h9M13 5v4M7 15v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="15" cy="7" r="2" fill="#0b252b" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="9" cy="17" r="2" fill="#0b252b" stroke="currentColor" strokeWidth="1.8" />
                </>
              )}
            </svg>
          </button>
        </>
      )}
      <InputScheduleDialog
        isOpen={activeControlDialog === 'schedule'}
        onClose={() => setActiveControlDialog(null)}
        variables={scheduledVariables}
        modelVariables={modelVariables}
        initialValues={{ ...inputValues, ...(selectedFmiLsExperiment?.parameters || {}) }}
        events={scheduledInputEvents}
        startTime={selectedFmiLsExperiment?.options.startTime ?? startTime}
        stopTime={selectedFmiLsExperiment?.options.stopTime ?? stopTime}
        stepSize={selectedFmiLsExperiment?.options.stepSize ?? stepSize}
        validationError={scheduleError}
        disabled={isRunning}
        onChange={updateScheduledInputEvents}
        zIndex={120}
      />
      <Modal
        isOpen={activeControlDialog === 'maps'}
        onClose={() => setActiveControlDialog(null)}
        title="FMI-LS-STRUCT maps"
        titleAside={`Reference curves declared in FMI-LS-STRUCT ${fmiLsStruct?.manifestVersion || ''}.`}
        size="3xl"
        theme="dark"
        portal
        zIndex={120}
      >
        <FmiLsStructMapPanel fmiLsStruct={fmiLsStruct} modelVariables={modelVariables} showHeading={false} />
      </Modal>
      {simulationError && appState !== 'loading' && appState !== 'error' && (
        <div className="absolute left-3 right-3 top-16 z-10 rounded-lg border border-[#7b4650] bg-[#321d24]/95 px-4 py-3 text-xs text-[#ffd2d7] shadow-xl sm:left-6 sm:right-6 sm:top-20" role="alert">
          {simulationError}
        </div>
      )}
    </section>
  )
}

DigitalTwinAppViewer.propTypes = {
  appUrl: PropTypes.string.isRequired, title: PropTypes.string, onConnect: PropTypes.func,
  modelVariables: PropTypes.array, fmiLsParameterPresets: PropTypes.array, fmiLsExperiments: PropTypes.array,
  enableInputSchedule: PropTypes.bool, scheduleVariables: PropTypes.array,
  fmiLsStruct: PropTypes.object,
  inputValues: PropTypes.object,
  inputEvents: PropTypes.array, onInputEventsChange: PropTypes.func,
  startTime: PropTypes.number, stopTime: PropTypes.number, stepSize: PropTypes.number,
  onModelChangeRequest: PropTypes.func, hostExtensions: PropTypes.object,
  downloadError: PropTypes.string, simulationError: PropTypes.string, fullScreen: PropTypes.bool,
}
