'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import InputScheduleEditor from './InputScheduleEditor'
import PlaybackRateControl from './PlaybackRateControl'
import { normalizeInputSchedule } from './simulationParameters'
import {
  createProtocolId,
  DIGITAL_TWIN_CAPABILITY,
  DIGITAL_TWIN_MESSAGE,
  DIGITAL_TWIN_PROTOCOL_VERSION,
  isRecord,
  isProtocolEnvelope,
  isValidHostMessage,
  isValidAppMessage,
  isValidProtocolId,
  makeProtocolMessage,
  MAX_SAMPLE_BATCH_JSON_CHARS,
  MAX_SAMPLES_PER_BATCH,
  SAMPLE_ACK_TIMEOUT_MS,
} from './digitalTwinAppProtocol'

const APP_READY_MESSAGE = DIGITAL_TWIN_MESSAGE.APP_READY
const APP_ERROR_MESSAGE = DIGITAL_TWIN_MESSAGE.APP_ERROR
const HOST_READY_MESSAGE = DIGITAL_TWIN_MESSAGE.HOST_READY
const APP_MESSAGE_VERSION = DIGITAL_TWIN_PROTOCOL_VERSION
const PLAYBACK_RATE_CAPABILITY = DIGITAL_TWIN_CAPABILITY.PLAYBACK_RATE
const SAMPLE_ACK_CAPABILITY = DIGITAL_TWIN_CAPABILITY.SAMPLE_ACKNOWLEDGEMENT
const PLAYBACK_CONTROL_POSITIONS = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
const APP_READY_TIMEOUT_MS = 30_000
const EMPTY_TIMES = []

function currentValue(series, index) {
  if (!Array.isArray(series) || series.length === 0) return undefined
  return series[Math.min(Math.max(index, 0), series.length - 1)]
}

function reportProviderAppError(appStateRef, setAppState, setAppFailureReason, reason) {
  appStateRef.current = 'error'
  setAppFailureReason(reason)
  setAppState('error')
}

export default function DigitalTwinAppViewer({ appUrl, title, results, modelVariables = [], enableInputSchedule = false, inputValues = {}, inputEvents = [], onInputEventsChange, startTime, stopTime, stepSize, isRunning, activeRunId, simulationState, simulationError, onRunSimulation, onCancelSimulation, onModelChangeRequest, hostExtensions = {}, downloadError, fullScreen }) {
  const iframeRef = useRef(null)
  const playbackTriggerRef = useRef(null)
  const playbackDialogRef = useRef(null)
  const sentSampleCountRef = useRef(0)
  const previousRunIdRef = useRef(undefined)
  const pendingSampleBatchRef = useRef(null)
  const sampleAckTimeoutRef = useRef(null)
  const sampleContinuationTimeoutRef = useRef(null)
  const initialSampleSentRef = useRef(false)
  const lastSentStateRef = useRef('')
  const resultsCompleteRef = useRef(false)
  const runRequestPendingRef = useRef(false)
  const onRunSimulationRef = useRef(onRunSimulation)
  const onCancelSimulationRef = useRef(onCancelSimulation)
  const onModelChangeRequestRef = useRef(onModelChangeRequest)
  const hostExtensionsRef = useRef(hostExtensions)
  const activeRunIdRef = useRef(activeRunId)
  const appStateRef = useRef('loading')
  const isRunningRef = useRef(isRunning)
  onRunSimulationRef.current = onRunSimulation
  onCancelSimulationRef.current = onCancelSimulation
  onModelChangeRequestRef.current = onModelChangeRequest
  hostExtensionsRef.current = hostExtensions
  activeRunIdRef.current = activeRunId
  isRunningRef.current = isRunning
  const [appState, setAppState] = useState('loading')
  const [appFailureReason, setAppFailureReason] = useState('')
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [playbackControlsOpen, setPlaybackControlsOpen] = useState(false)
  const [appCapabilities, setAppCapabilities] = useState([])
  const [sampleAckVersion, setSampleAckVersion] = useState(0)
  const [playbackControlPosition, setPlaybackControlPosition] = useState(null)
  const [playbackRate, setPlaybackRate] = useState(1)
  useEffect(() => {
    if (!isRunning || ['completed', 'cancelled', 'error'].includes(simulationState)) {
      runRequestPendingRef.current = false
    }
  }, [isRunning, simulationState])
  const times = Array.isArray(results?.time) ? results.time : EMPTY_TIMES
  const scheduledInputEvents = Array.isArray(inputEvents) ? inputEvents : []
  const updateScheduledInputEvents = typeof onInputEventsChange === 'function' ? onInputEventsChange : () => {}
  const sampleIndex = Math.max(times.length - 1, 0)
  const modelDuration = times.length > 1
    ? Number(times[times.length - 1]) - Number(times[0])
    : Number(stopTime) - Number(startTime)
  const outputNames = useMemo(() => modelVariables
    .filter((variable) => variable?.causality === 'output' && typeof variable.name === 'string')
    .map((variable) => variable.name), [modelVariables])
  const outputDefaults = useMemo(() => {
    const defaults = {}
    for (const variable of modelVariables) {
      if (variable?.causality !== 'output' || typeof variable.name !== 'string' || variable.start === undefined) continue
      if (variable.type === 'Boolean' || typeof variable.start === 'boolean') {
        defaults[variable.name] = variable.start === true || variable.start === 'true'
      } else {
        const numericStart = Number(variable.start)
        if (Number.isFinite(numericStart)) defaults[variable.name] = numericStart
      }
    }
    return defaults
  }, [modelVariables])
  const inputVariables = useMemo(() => modelVariables.filter((variable) => variable?.causality === 'input'), [modelVariables])
  const playbackRateLabel = Number(playbackRate).toLocaleString(undefined, { maximumFractionDigits: 2 })
  let scheduleError = ''
  if (enableInputSchedule && scheduledInputEvents.length > 0) {
    try {
      normalizeInputSchedule(scheduledInputEvents, inputVariables, modelVariables, startTime, stopTime, stepSize)
    } catch (error) {
      scheduleError = error.message
    }
  }

  const sample = useMemo(() => {
    const allowedOutputs = new Set(outputNames)
    const outputs = { ...outputDefaults }
    for (const [name, series] of Object.entries(results?.outputs || {})) {
      if (!allowedOutputs.has(name)) continue
      const value = currentValue(series, sampleIndex)
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) outputs[name] = value
    }
    const timeValue = Number(times[sampleIndex])
    return {
      type: DIGITAL_TWIN_MESSAGE.SAMPLE,
      version: APP_MESSAGE_VERSION,
      ...(activeRunId ? { runId: activeRunId } : {}),
      time: Number.isFinite(timeValue) ? timeValue : null,
      outputs,
    }
  }, [activeRunId, outputDefaults, outputNames, results?.outputs, sampleIndex, times])

  useEffect(() => {
    appStateRef.current = 'loading'
    setAppState('loading')
    setAppFailureReason('')
    setFrameLoaded(false)
    setAppCapabilities([])
    setPlaybackControlPosition(null)
    setPlaybackRate(1)
    sentSampleCountRef.current = 0
    previousRunIdRef.current = undefined
    pendingSampleBatchRef.current = null
    initialSampleSentRef.current = false
    lastSentStateRef.current = ''
    resultsCompleteRef.current = false
    window.clearTimeout(sampleAckTimeoutRef.current)
    window.clearTimeout(sampleContinuationTimeoutRef.current)
    sampleContinuationTimeoutRef.current = null
    function notifyAppHostReady() {
      iframeRef.current?.contentWindow?.postMessage({
        ...(isRecord(hostExtensionsRef.current) && Object.keys(hostExtensionsRef.current).length
          ? { extensions: hostExtensionsRef.current }
          : {}),
        type: HOST_READY_MESSAGE,
        version: APP_MESSAGE_VERSION,
      }, '*')
    }
    const handshake = window.setInterval(notifyAppHostReady, 500)
    const timeout = window.setTimeout(() => {
      window.clearInterval(handshake)
      if (appStateRef.current !== 'ready') {
        appStateRef.current = 'error'
        setAppState('error')
      }
    }, APP_READY_TIMEOUT_MS)

    function handleAppMessage(event) {
      if (event.source !== iframeRef.current?.contentWindow) return
      const message = event.data
      if (!isProtocolEnvelope(message)) return
      if (message.type === APP_READY_MESSAGE) {
        if (!isValidAppMessage(message)) return
        window.clearInterval(handshake)
        window.clearTimeout(timeout)
        const capabilities = Array.isArray(message.capabilities)
          ? [...new Set(message.capabilities.filter((capability) => (
            capability === PLAYBACK_RATE_CAPABILITY || capability === SAMPLE_ACK_CAPABILITY
          )))]
          : []
        setAppCapabilities(capabilities)
        setPlaybackControlPosition(
          PLAYBACK_CONTROL_POSITIONS.has(message.playbackControlPosition)
            ? message.playbackControlPosition
            : null,
        )
        const defaultPlaybackRate = Number(message.defaultPlaybackRate)
        if (capabilities.includes(PLAYBACK_RATE_CAPABILITY)
            && Number.isFinite(defaultPlaybackRate)
            && defaultPlaybackRate > 0
            && defaultPlaybackRate <= 100_000) {
          setPlaybackRate(defaultPlaybackRate)
        }
        appStateRef.current = 'ready'
        setAppState('ready')
      } else if (message.type === APP_ERROR_MESSAGE) {
        if (!isValidAppMessage(message)) return
        window.clearInterval(handshake)
        window.clearTimeout(timeout)
        setAppFailureReason(typeof message.code === 'string'
          ? `The provider app reported startup error ${message.code}.`
          : 'The provider app reported a startup error.')
        appStateRef.current = 'error'
        setAppState('error')
      } else if (message.type === DIGITAL_TWIN_MESSAGE.RUN_REQUEST) {
        const appSuppliedRequestId = isValidProtocolId(message.requestId)
        const requestId = typeof message.requestId === 'string' ? message.requestId : createProtocolId('request')
        const target = iframeRef.current?.contentWindow
        if (!isValidAppMessage(message)) {
          target?.postMessage(makeProtocolMessage(DIGITAL_TWIN_MESSAGE.RUN_REJECTED, {
            ...(isValidProtocolId(message.requestId) ? { requestId: message.requestId } : {}),
            code: 'INVALID_RUN_REQUEST',
          }), '*')
          return
        }
        if (appStateRef.current === 'error'
            || isRunningRef.current
            || runRequestPendingRef.current
            || typeof onRunSimulationRef.current !== 'function') {
          target?.postMessage(makeProtocolMessage(DIGITAL_TWIN_MESSAGE.RUN_REJECTED, {
            requestId,
            code: appStateRef.current === 'error'
              ? 'APP_UNAVAILABLE'
              : isRunningRef.current || runRequestPendingRef.current
                ? 'SIMULATION_ALREADY_RUNNING'
                : 'SIMULATION_UNAVAILABLE',
          }), '*')
          return
        }
        const requestedRunId = createProtocolId('run')
        try {
          runRequestPendingRef.current = true
          let execution
          if (appSuppliedRequestId) {
            execution = onRunSimulationRef.current(message.parameters ?? {}, message.options ?? {}, {
              requestId,
              runId: requestedRunId,
            })
          } else {
            execution = onRunSimulationRef.current(message.parameters ?? {}, message.options ?? {})
          }
          if (execution?.accepted === false) {
            runRequestPendingRef.current = false
            target?.postMessage(makeProtocolMessage(DIGITAL_TWIN_MESSAGE.RUN_REJECTED, {
              requestId,
              code: 'SIMULATION_ALREADY_RUNNING',
            }), '*')
            return
          }
          const runId = !appSuppliedRequestId && isValidProtocolId(execution?.runId)
            ? execution.runId
            : requestedRunId
          activeRunIdRef.current = runId
          target?.postMessage(makeProtocolMessage(DIGITAL_TWIN_MESSAGE.RUN_ACCEPTED, { requestId, runId }), '*')
        } catch {
          runRequestPendingRef.current = false
          activeRunIdRef.current = null
          target?.postMessage(makeProtocolMessage(DIGITAL_TWIN_MESSAGE.RUN_REJECTED, {
            requestId,
            code: 'SIMULATION_START_FAILED',
          }), '*')
        }
      } else if (message.type === DIGITAL_TWIN_MESSAGE.RUN_CANCEL) {
        const runId = activeRunIdRef.current
        if (!isValidAppMessage(message) || message.runId !== runId) return
        if (onCancelSimulationRef.current?.(runId)) {
          iframeRef.current?.contentWindow?.postMessage(makeProtocolMessage(DIGITAL_TWIN_MESSAGE.RUN_CANCELLED, { runId }), '*')
        }
      } else if (message.type === DIGITAL_TWIN_MESSAGE.SAMPLES_ACK) {
        const pending = pendingSampleBatchRef.current
        if (!pending || !isValidAppMessage(message)) return
        if (
          message.runId !== pending.runId
          || message.batchId !== pending.batchId
          || message.lastSampleIndex !== pending.lastSampleIndex
        ) return
        window.clearTimeout(sampleAckTimeoutRef.current)
        pendingSampleBatchRef.current = null
        setSampleAckVersion((version) => version + 1)
      } else if (message.type === DIGITAL_TWIN_MESSAGE.MODEL_CHANGE) {
        if (!isValidAppMessage(message)) return
        onModelChangeRequestRef.current?.(message.modelId)
      }
    }

    window.addEventListener('message', handleAppMessage)
    notifyAppHostReady()
    return () => {
      window.clearInterval(handshake)
      window.clearTimeout(timeout)
      window.clearTimeout(sampleAckTimeoutRef.current)
      window.clearTimeout(sampleContinuationTimeoutRef.current)
      window.removeEventListener('message', handleAppMessage)
    }
  }, [appUrl, reloadKey])

  useEffect(() => {
    if (appState !== 'ready') return
    const target = iframeRef.current?.contentWindow
    if (!target) return
    const send = (type, payload = {}) => target.postMessage({
      ...payload,
      type,
      version: APP_MESSAGE_VERSION,
    }, '*')

    const runId = activeRunId || null
    let sentSampleCount = sentSampleCountRef.current
    if (previousRunIdRef.current !== runId || times.length < sentSampleCount) {
      window.clearTimeout(sampleAckTimeoutRef.current)
      window.clearTimeout(sampleContinuationTimeoutRef.current)
      sampleContinuationTimeoutRef.current = null
      pendingSampleBatchRef.current = null
      send(DIGITAL_TWIN_MESSAGE.RESET, { runId })
      previousRunIdRef.current = runId
      sentSampleCountRef.current = 0
      sentSampleCount = 0
      initialSampleSentRef.current = false
      resultsCompleteRef.current = false
      lastSentStateRef.current = ''
    }

    if (times.length === 0 && !initialSampleSentRef.current) {
      if (!isValidHostMessage(sample)) {
        reportProviderAppError(
          appStateRef,
          setAppState,
          setAppFailureReason,
          'The FMU outputs exceed the message limits supported by this provider app.',
        )
        return
      }
      target.postMessage(sample, '*')
      initialSampleSentRef.current = true
    } else if (times.length > sentSampleCount) {
      if (pendingSampleBatchRef.current) return
      if (sampleContinuationTimeoutRef.current) return
      const batchEndLimit = Math.min(sentSampleCount + MAX_SAMPLES_PER_BATCH, times.length)
      const supportsAcknowledgement = appCapabilities.includes(SAMPLE_ACK_CAPABILITY) && runId
      const batchId = supportsAcknowledgement ? createProtocolId('batch') : undefined
      const batchHeader = {
        type: DIGITAL_TWIN_MESSAGE.SAMPLES,
        version: APP_MESSAGE_VERSION,
        ...(runId ? { runId } : {}),
        ...(supportsAcknowledgement ? {
          batchId,
          firstSampleIndex: sentSampleCount,
          lastSampleIndex: Number.MAX_SAFE_INTEGER,
        } : {}),
        samples: [],
      }
      let batchCharacters = JSON.stringify(batchHeader).length
      const samples = []
      let nextSampleIndex = sentSampleCount
      for (let index = sentSampleCount; index < batchEndLimit; index += 1) {
        const time = Number(times[index])
        if (!Number.isFinite(time)) {
          reportProviderAppError(
            appStateRef,
            setAppState,
            setAppFailureReason,
            'The FMU returned a non-finite sample time that this app cannot replay.',
          )
          return
        }
        const outputs = { ...outputDefaults }
        for (const name of outputNames) {
          const value = results?.outputs?.[name]?.[index]
          if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
            outputs[name] = value
          }
        }
        const entry = { time, outputs }
        const entryCharacters = JSON.stringify(entry).length + (samples.length > 0 ? 1 : 0)
        if (batchCharacters + entryCharacters > MAX_SAMPLE_BATCH_JSON_CHARS && samples.length > 0) break
        if (batchCharacters + entryCharacters > MAX_SAMPLE_BATCH_JSON_CHARS) {
          reportProviderAppError(
            appStateRef,
            setAppState,
            setAppFailureReason,
            'One FMU output sample exceeds the message limits supported by this provider app.',
          )
          return
        }
        samples.push(entry)
        batchCharacters += entryCharacters
        nextSampleIndex = index + 1
      }
      if (samples.length > 0) {
        const lastSampleIndex = nextSampleIndex - 1
        const batch = {
          samples,
          ...(runId ? { runId } : {}),
          ...(supportsAcknowledgement ? {
            batchId,
            firstSampleIndex: sentSampleCount,
            lastSampleIndex,
          } : {}),
        }
        const message = { ...batch, type: DIGITAL_TWIN_MESSAGE.SAMPLES, version: APP_MESSAGE_VERSION }
        if (!isValidHostMessage(message)) {
          reportProviderAppError(
            appStateRef,
            setAppState,
            setAppFailureReason,
            'The FMU outputs exceed the message limits supported by this provider app.',
          )
          return
        }
        send(DIGITAL_TWIN_MESSAGE.SAMPLES, batch)
        sentSampleCountRef.current = nextSampleIndex
        if (supportsAcknowledgement) {
          pendingSampleBatchRef.current = { runId, batchId, lastSampleIndex }
          sampleAckTimeoutRef.current = window.setTimeout(() => {
            if (pendingSampleBatchRef.current?.batchId !== batchId) return
            pendingSampleBatchRef.current = null
            reportProviderAppError(
              appStateRef,
              setAppState,
              setAppFailureReason,
              'The provider app stopped acknowledging FMU output batches. Reload the app and try again.',
            )
          }, SAMPLE_ACK_TIMEOUT_MS)
        } else if (nextSampleIndex < times.length) {
          sampleContinuationTimeoutRef.current = window.setTimeout(() => {
            sampleContinuationTimeoutRef.current = null
            setSampleAckVersion((version) => version + 1)
          }, 50)
        }
      } else {
        sentSampleCountRef.current = nextSampleIndex
      }
    }

    const nextState = simulationState === 'error'
      ? 'error'
      : simulationState === 'cancelled'
        ? 'cancelled'
        : isRunning
          ? 'running'
          : times.length > 0
            ? 'completed'
            : 'idle'
    const stateKey = `${runId || ''}:${nextState}`
    if (lastSentStateRef.current !== stateKey) send(DIGITAL_TWIN_MESSAGE.SIMULATION_STATE, {
      ...(runId ? { runId } : {}),
      state: nextState,
    })
    lastSentStateRef.current = stateKey
    if (['completed', 'cancelled', 'error'].includes(nextState)
        && sentSampleCountRef.current === times.length
        && !pendingSampleBatchRef.current && !resultsCompleteRef.current) {
      send(DIGITAL_TWIN_MESSAGE.RESULTS_COMPLETE, {
        ...(runId ? { runId } : {}), sampleCount: times.length, state: nextState,
      })
      resultsCompleteRef.current = true
    }
  }, [activeRunId, appCapabilities, appState, isRunning, outputDefaults, outputNames, results, sample, sampleAckVersion, simulationState, times])

  useEffect(() => {
    if (appState !== 'ready' || !appCapabilities.includes(PLAYBACK_RATE_CAPABILITY)) return
    iframeRef.current?.contentWindow?.postMessage({
      type: DIGITAL_TWIN_MESSAGE.PLAYBACK_CONTROL,
      version: APP_MESSAGE_VERSION,
      rate: playbackRate,
      rateUnit: 'model-seconds-per-real-second',
    }, '*')
  }, [appCapabilities, appState, playbackRate])

  useEffect(() => {
    if (!playbackControlsOpen) return undefined
    playbackDialogRef.current?.querySelector('select')?.focus()
    function closeOnEscape(event) {
      if (event.key === 'Escape') setPlaybackControlsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      playbackTriggerRef.current?.focus()
    }
  }, [playbackControlsOpen])

  function handleFrameLoad() {
    setFrameLoaded(true)
    iframeRef.current?.contentWindow?.postMessage({
      ...(isRecord(hostExtensionsRef.current) && Object.keys(hostExtensionsRef.current).length
        ? { extensions: hostExtensionsRef.current }
        : {}),
      type: HOST_READY_MESSAGE,
      version: APP_MESSAGE_VERSION,
    }, '*')
  }

  function cancelCurrentSimulation() {
    if (activeRunId && onCancelSimulationRef.current?.(activeRunId)) {
      iframeRef.current?.contentWindow?.postMessage(makeProtocolMessage(DIGITAL_TWIN_MESSAGE.RUN_CANCELLED, {
        runId: activeRunId,
      }), '*')
    }
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
          appStateRef.current = 'error'
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
      {isRunning && activeRunId && typeof onCancelSimulation === 'function' && (
        <button
          type="button"
          onClick={cancelCurrentSimulation}
          className="absolute right-3 top-3 z-40 rounded-lg border border-[#7b4650] bg-[#321d24]/95 px-3 py-2 text-xs font-semibold text-[#ffd2d7] shadow-xl transition hover:bg-[#48252e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8e9b] sm:right-6 sm:top-6"
        >
          Cancel simulation
        </button>
      )}
      {appState === 'ready' && !scheduleOpen && appCapabilities.includes(PLAYBACK_RATE_CAPABILITY) && (
        <div
          data-testid="digital-twin-playback-rate"
          className={`digital-twin-playback-rate-dock${playbackControlPosition ? ` digital-twin-playback-rate-dock--${playbackControlPosition}` : ''} absolute z-20 w-max max-w-[calc(100%-1rem)]`}
        >
          <button
            ref={playbackTriggerRef}
            type="button"
            aria-label={`Speed settings, current ${playbackRateLabel}×`}
            aria-haspopup="dialog"
            aria-expanded={playbackControlsOpen}
            onClick={() => setPlaybackControlsOpen(true)}
            className="inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-[#30464d] bg-[#101d23] px-3 text-xs font-semibold text-[#dce9e9] shadow-xl transition hover:border-[#54d5c9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
          >
            <span>Speed</span>
            <span className="font-mono text-[#73e4cb]">{playbackRateLabel}×</span>
          </button>
        </div>
      )}
      {playbackControlsOpen && appState === 'ready' && appCapabilities.includes(PLAYBACK_RATE_CAPABILITY) && (
        <div
          role="presentation"
          onClick={(event) => { if (event.target === event.currentTarget) setPlaybackControlsOpen(false) }}
          className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-[#030c10]/75 p-4 backdrop-blur-sm"
        >
          <div
            ref={playbackDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="digital-twin-playback-rate-title"
            className="w-fit max-w-[calc(100vw-2rem)] rounded-xl border border-[#30464d] bg-[#0b171d] p-4 text-left shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="digital-twin-playback-rate-title" className="text-sm font-semibold text-white">Set visualization speed</h2>
              <button
                type="button"
                aria-label="Close playback controls"
                onClick={() => setPlaybackControlsOpen(false)}
                className="rounded-md border border-[#30464d] px-2 py-1 text-xs text-[#c4d9dd] transition hover:border-[#54d5c9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
              >
                Close
              </button>
            </div>
            <div className="flex w-fit justify-center">
              <PlaybackRateControl rate={playbackRate} onChange={setPlaybackRate} modelDuration={modelDuration} compact />
            </div>
          </div>
        </div>
      )}
      {simulationError && appState !== 'loading' && appState !== 'error' && (
        <div className="absolute left-3 right-3 top-16 z-10 rounded-lg border border-[#7b4650] bg-[#321d24]/95 px-4 py-3 text-xs text-[#ffd2d7] shadow-xl sm:left-6 sm:right-6 sm:top-20" role="alert">
          {simulationError}
        </div>
      )}
      {enableInputSchedule && inputVariables.length > 0 && appState === 'ready' && (
        <>
          <button
            type="button"
            aria-expanded={scheduleOpen}
            aria-controls="digital-twin-input-schedule"
            onClick={() => setScheduleOpen((open) => !open)}
            disabled={isRunning}
            className="absolute right-[312px] top-[20.5px] z-10 grid h-[29px] min-h-[29px] place-items-center rounded-md border border-[rgba(93,231,205,0.4)] bg-[rgba(14,62,58,0.78)] px-[10px] py-0 font-mono text-[7px] leading-none font-bold tracking-[0.09em] text-[#b9fff0] uppercase shadow-lg backdrop-blur transition hover:border-[#8bffe4] hover:bg-[rgba(22,91,81,0.92)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 max-[680px]:right-[239px] max-[680px]:top-[16.5px] max-[680px]:h-[27px] max-[680px]:min-h-[27px] max-[680px]:px-[7px] max-[680px]:text-[6px]"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            {scheduleOpen ? 'Hide input schedule' : 'Schedule input changes'}
          </button>
          {scheduleOpen && (
            <div
              id="digital-twin-input-schedule"
              className="absolute left-1/2 top-[60px] z-10 -translate-x-1/2 overflow-y-auto overscroll-contain rounded-2xl border border-[#36535a] bg-[#08181deF] p-4 text-left shadow-2xl backdrop-blur-xl max-[680px]:top-[54px]"
              style={{ width: 'min(44rem, calc(100% - 2rem))', maxHeight: 'min(76vh, 52rem, calc(100% - 76px))' }}
            >
              <InputScheduleEditor
                variables={inputVariables}
                modelVariables={modelVariables}
                initialValues={inputValues}
                events={scheduledInputEvents}
                startTime={startTime}
                stopTime={stopTime}
                stepSize={stepSize}
                validationError={scheduleError}
                disabled={isRunning}
                onChange={updateScheduledInputEvents}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}

DigitalTwinAppViewer.propTypes = {
  appUrl: PropTypes.string.isRequired,
  title: PropTypes.string,
  results: PropTypes.shape({ time: PropTypes.array, outputs: PropTypes.object }),
  modelVariables: PropTypes.arrayOf(PropTypes.object),
  enableInputSchedule: PropTypes.bool,
  inputValues: PropTypes.object,
  inputEvents: PropTypes.arrayOf(PropTypes.object),
  onInputEventsChange: PropTypes.func,
  startTime: PropTypes.number,
  stopTime: PropTypes.number,
  stepSize: PropTypes.number,
  isRunning: PropTypes.bool,
  activeRunId: PropTypes.string,
  simulationState: PropTypes.string,
  simulationError: PropTypes.string,
  onRunSimulation: PropTypes.func,
  onCancelSimulation: PropTypes.func,
  onModelChangeRequest: PropTypes.func,
  hostExtensions: PropTypes.object,
  downloadError: PropTypes.string,
  fullScreen: PropTypes.bool,
}

DigitalTwinAppViewer.defaultProps = {
  title: 'Digital Twin',
  results: null,
  modelVariables: [],
  inputValues: {},
  inputEvents: [],
  onInputEventsChange: null,
  startTime: 0,
  stopTime: 1,
  stepSize: 0.001,
  isRunning: false,
  activeRunId: null,
  simulationState: 'idle',
  simulationError: null,
  onRunSimulation: null,
  onCancelSimulation: null,
  onModelChangeRequest: null,
  hostExtensions: {},
  downloadError: null,
  fullScreen: false,
}
