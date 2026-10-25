'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import InputScheduleEditor from './InputScheduleEditor'
import PlaybackRateControl from './PlaybackRateControl'
import { normalizeInputSchedule } from './simulationParameters'
import {
  DIGITAL_TWIN_CAPABILITY, DIGITAL_TWIN_MESSAGE as MESSAGE, isValidAppMessage,
  isValidHostMessage, makeProtocolMessage, isRecord,
} from './digitalTwinAppProtocol'

const PLAYBACK_RATE_CAPABILITY = DIGITAL_TWIN_CAPABILITY.PLAYBACK_RATE

export default function DigitalTwinAppViewer({
  appUrl, title = 'Digital Twin', onConnect, modelVariables = [], enableInputSchedule = false,
  scheduleVariables,
  inputValues = {}, inputEvents = [], onInputEventsChange, startTime = 0, stopTime = 1, stepSize,
  onModelChangeRequest, hostExtensions = {}, downloadError, simulationError, fullScreen = false,
}) {
  const iframeRef = useRef(null)
  const playbackTriggerRef = useRef(null)
  const playbackDialogRef = useRef(null)
  const connectRef = useRef(onConnect)
  const modelChangeRef = useRef(onModelChangeRequest)
  const extensionRef = useRef(hostExtensions)
  const grantRef = useRef(null)
  const loadedDocumentRef = useRef(false)
  const stateRef = useRef('loading')
  connectRef.current = onConnect
  modelChangeRef.current = onModelChangeRequest
  extensionRef.current = hostExtensions
  const [appState, setAppState] = useState('loading')
  const [appFailureReason, setAppFailureReason] = useState('')
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [playbackControlsOpen, setPlaybackControlsOpen] = useState(false)
  const [appCapabilities, setAppCapabilities] = useState([])
  const [playbackControlPosition, setPlaybackControlPosition] = useState(null)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [execution, setExecution] = useState({ state: 'idle' })
  const isRunning = execution.state === 'running'
  const activeRunId = execution.runId
  const modelDuration = Number(execution.options?.stopTime ?? stopTime) - Number(execution.options?.startTime ?? startTime)
  const playbackRateLabel = Number(playbackRate).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const scheduledVariables = useMemo(
    () => (Array.isArray(scheduleVariables)
      ? scheduleVariables
      : modelVariables.filter((variable) => variable?.causality === 'input')),
    [modelVariables, scheduleVariables],
  )
  const scheduledInputEvents = Array.isArray(inputEvents) ? inputEvents : []
  const updateScheduledInputEvents = onInputEventsChange || (() => {})
  let scheduleError = ''
  try {
    if (enableInputSchedule && scheduledInputEvents.length) normalizeInputSchedule(scheduledInputEvents, scheduledVariables, modelVariables, startTime, stopTime, stepSize)
  } catch (error) { scheduleError = error.message }

  function send(type, payload = {}) {
    const message = makeProtocolMessage(type, payload)
    if (isValidHostMessage(message)) iframeRef.current?.contentWindow?.postMessage(message, '*')
  }

  useEffect(() => {
    stateRef.current = 'loading'
    loadedDocumentRef.current = false
    setAppState('loading')
    setAppFailureReason('')
    setFrameLoaded(false)
    setAppCapabilities([])
    setPlaybackControlPosition(null)
    setPlaybackRate(1)
    setExecution({ state: 'idle' })
    const timeout = window.setTimeout(() => {
      if (stateRef.current !== 'loading') return
      stateRef.current = 'error'
      setAppState('error')
      setAppFailureReason('The provider application did not initialize successfully. Check its bundled assets and browser console errors.')
    }, 30_000)
    return () => { window.clearTimeout(timeout); grantRef.current?.abort(); grantRef.current = null }
  }, [appUrl, reloadKey])

  useEffect(() => {
    async function receive(event) {
      if (event.source !== iframeRef.current?.contentWindow || !isValidAppMessage(event.data)) return
      const message = event.data
      if (message.type === MESSAGE.APP_HELLO) {
        send(MESSAGE.HOST_READY, isRecord(extensionRef.current) && Object.keys(extensionRef.current).length ? { extensions: extensionRef.current } : {})
      } else if (message.type === MESSAGE.APP_READY) {
        if (stateRef.current !== 'loading') return
        stateRef.current = 'ready'
        setAppState('ready')
        setAppCapabilities(message.capabilities || [])
        setPlaybackControlPosition(message.playbackControlPosition || null)
        setPlaybackRate(message.defaultPlaybackRate || 1)
      } else if (message.type === MESSAGE.APP_ERROR) {
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
          const interval = { startTime, stopTime, stepSize, ...message.options }
          const schedule = enableInputSchedule
            ? normalizeInputSchedule(scheduledInputEvents, scheduledVariables, modelVariables, interval.startTime, interval.stopTime, interval.stepSize)
            : []
          const connection = await connectRef.current({ options: message.options || {}, signal: controller.signal })
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
  }, [enableInputSchedule, scheduledVariables, modelVariables, inputEvents, startTime, stopTime, stepSize])

  useEffect(() => {
    if (appState === 'ready' && appCapabilities.includes(PLAYBACK_RATE_CAPABILITY)) {
      send(MESSAGE.PLAYBACK_CONTROL, { rate: playbackRate, rateUnit: 'model-seconds-per-real-second' })
    }
  }, [appCapabilities, appState, playbackRate])

  useEffect(() => {
    if (!playbackControlsOpen) return undefined
    playbackDialogRef.current?.querySelector('select')?.focus()
    const close = (event) => { if (event.key === 'Escape') setPlaybackControlsOpen(false) }
    window.addEventListener('keydown', close)
    return () => { window.removeEventListener('keydown', close); playbackTriggerRef.current?.focus() }
  }, [playbackControlsOpen])

  function handleFrameLoad() {
    if (loadedDocumentRef.current) {
      grantRef.current?.abort()
      grantRef.current = null
      stateRef.current = 'loading'
      setAppState('loading')
      setExecution({ state: 'idle' })
    }
    loadedDocumentRef.current = true
    setFrameLoaded(true)
    send(MESSAGE.HOST_READY, isRecord(extensionRef.current) && Object.keys(extensionRef.current).length ? { extensions: extensionRef.current } : {})
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
      {isRunning && activeRunId && appCapabilities.includes(DIGITAL_TWIN_CAPABILITY.EXECUTION_CONTROL) && (
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
      {enableInputSchedule && scheduledVariables.length > 0 && appState === 'ready' && (
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
            {scheduleOpen ? 'Hide scheduled changes' : 'Schedule changes'}
          </button>
          {scheduleOpen && (
            <div
              id="digital-twin-input-schedule"
              className="absolute left-1/2 top-[60px] z-10 -translate-x-1/2 overflow-y-auto overscroll-contain rounded-2xl border border-[#36535a] bg-[#08181deF] p-4 text-left shadow-2xl backdrop-blur-xl max-[680px]:top-[54px]"
              style={{ width: 'min(44rem, calc(100% - 2rem))', maxHeight: 'min(76vh, 52rem, calc(100% - 76px))' }}
            >
              <InputScheduleEditor
                variables={scheduledVariables}
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
  appUrl: PropTypes.string.isRequired, title: PropTypes.string, onConnect: PropTypes.func,
  modelVariables: PropTypes.array, enableInputSchedule: PropTypes.bool, scheduleVariables: PropTypes.array,
  inputValues: PropTypes.object,
  inputEvents: PropTypes.array, onInputEventsChange: PropTypes.func,
  startTime: PropTypes.number, stopTime: PropTypes.number, stepSize: PropTypes.number,
  onModelChangeRequest: PropTypes.func, hostExtensions: PropTypes.object,
  downloadError: PropTypes.string, simulationError: PropTypes.string, fullScreen: PropTypes.bool,
}
