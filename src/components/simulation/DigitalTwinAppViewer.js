'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import InputScheduleEditor from './InputScheduleEditor'
import PlaybackRateControl from './PlaybackRateControl'
import { normalizeInputSchedule } from './simulationParameters'

const APP_READY_MESSAGE = 'decentralabs:digital-twin-ready'
const APP_ERROR_MESSAGE = 'decentralabs:digital-twin-error'
const HOST_READY_MESSAGE = 'decentralabs:digital-twin-host-ready'
const APP_MESSAGE_VERSION = 1
const PLAYBACK_RATE_CAPABILITY = 'playback-rate'
const APP_READY_TIMEOUT_MS = 30_000
const EMPTY_TIMES = []

function currentValue(series, index) {
  if (!Array.isArray(series) || series.length === 0) return undefined
  return series[Math.min(Math.max(index, 0), series.length - 1)]
}

export default function DigitalTwinAppViewer({ appUrl, title, results, modelVariables = [], enableInputSchedule, inputValues = {}, inputEvents = [], onInputEventsChange, startTime, stopTime, stepSize, isRunning, simulationState, simulationError, onRunSimulation, downloadError, fullScreen }) {
  const iframeRef = useRef(null)
  const sentSampleCountRef = useRef(0)
  const onRunSimulationRef = useRef(onRunSimulation)
  onRunSimulationRef.current = onRunSimulation
  const [appState, setAppState] = useState('loading')
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [appCapabilities, setAppCapabilities] = useState([])
  const [playbackRate, setPlaybackRate] = useState(1)
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
      type: 'decentralabs:fmi-sample',
      version: APP_MESSAGE_VERSION,
      time: Number.isFinite(timeValue) ? timeValue : null,
      outputs,
    }
  }, [outputDefaults, outputNames, results?.outputs, sampleIndex, times])

  useEffect(() => {
    setAppState('loading')
    setFrameLoaded(false)
    setAppCapabilities([])
    sentSampleCountRef.current = 0
    function notifyAppHostReady() {
      iframeRef.current?.contentWindow?.postMessage({
        type: HOST_READY_MESSAGE,
        version: APP_MESSAGE_VERSION,
      }, '*')
    }
    const handshake = window.setInterval(notifyAppHostReady, 500)
    const timeout = window.setTimeout(() => {
      window.clearInterval(handshake)
      setAppState((current) => current === 'ready' ? current : 'error')
    }, APP_READY_TIMEOUT_MS)

    function handleAppMessage(event) {
      if (event.source !== iframeRef.current?.contentWindow) return
      const message = event.data
      if (!message || typeof message !== 'object' || message.version !== APP_MESSAGE_VERSION) return
      if (message.type === APP_READY_MESSAGE) {
        window.clearInterval(handshake)
        window.clearTimeout(timeout)
        setAppCapabilities(Array.isArray(message.capabilities)
          ? message.capabilities.filter((capability) => capability === PLAYBACK_RATE_CAPABILITY)
          : [])
        setAppState('ready')
      } else if (message.type === APP_ERROR_MESSAGE) {
        window.clearInterval(handshake)
        window.clearTimeout(timeout)
        setAppState('error')
      } else if (message.type === 'decentralabs:fmi-run-request') {
        if (message.parameters === undefined || (
          message.parameters && typeof message.parameters === 'object' && !Array.isArray(message.parameters)
        )) {
          const options = message.options && typeof message.options === 'object' && !Array.isArray(message.options)
            ? message.options
            : {}
          onRunSimulationRef.current?.(message.parameters ?? {}, options)
        }
      }
    }

    window.addEventListener('message', handleAppMessage)
    notifyAppHostReady()
    return () => {
      window.clearInterval(handshake)
      window.clearTimeout(timeout)
      window.removeEventListener('message', handleAppMessage)
    }
  }, [appUrl, reloadKey])

  useEffect(() => {
    if (appState !== 'ready') return
    const target = iframeRef.current?.contentWindow
    if (!target) return
    const send = (type, payload = {}) => target.postMessage({
      type,
      version: APP_MESSAGE_VERSION,
      ...payload,
    }, '*')

    let sentSampleCount = sentSampleCountRef.current
    if (times.length < sentSampleCount) {
      send('decentralabs:fmi-reset')
      sentSampleCount = 0
      sentSampleCountRef.current = 0
    }

    if (times.length === 0) {
      target.postMessage(sample, '*')
    } else if (times.length > sentSampleCount) {
      const samples = []
      for (let index = sentSampleCount; index < times.length; index += 1) {
        const time = Number(times[index])
        if (!Number.isFinite(time)) continue
        const outputs = { ...outputDefaults }
        for (const name of outputNames) {
          const value = results?.outputs?.[name]?.[index]
          if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
            outputs[name] = value
          }
        }
        samples.push({ time, outputs })
      }
      if (samples.length > 0) send('decentralabs:fmi-samples', { samples })
      sentSampleCountRef.current = times.length
    }

    send('decentralabs:fmi-simulation-state', {
      state: simulationState === 'error' ? 'error' : isRunning ? 'running' : times.length > 0 ? 'completed' : 'idle',
    })
  }, [appState, isRunning, outputDefaults, outputNames, results, sample, simulationState, times])

  useEffect(() => {
    if (appState !== 'ready' || !appCapabilities.includes(PLAYBACK_RATE_CAPABILITY)) return
    iframeRef.current?.contentWindow?.postMessage({
      type: 'decentralabs:fmi-playback-control',
      version: APP_MESSAGE_VERSION,
      rate: playbackRate,
      rateUnit: 'model-seconds-per-real-second',
    }, '*')
  }, [appCapabilities, appState, playbackRate])

  function handleFrameLoad() {
    setFrameLoaded(true)
    iframeRef.current?.contentWindow?.postMessage({
      type: HOST_READY_MESSAGE,
      version: APP_MESSAGE_VERSION,
    }, '*')
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
        onError={() => setAppState('error')}
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
            <p>The provider application did not initialize successfully. Check its bundled assets and browser console errors.</p>
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
      {appState === 'ready' && !scheduleOpen && appCapabilities.includes(PLAYBACK_RATE_CAPABILITY) && (
        <div className="absolute bottom-16 left-3 z-20 w-[min(22rem,calc(100%-1.5rem))] shadow-xl sm:bottom-5 sm:left-5">
          <PlaybackRateControl rate={playbackRate} onChange={setPlaybackRate} modelDuration={modelDuration} />
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
  simulationState: PropTypes.string,
  simulationError: PropTypes.string,
  onRunSimulation: PropTypes.func,
  downloadError: PropTypes.string,
  fullScreen: PropTypes.bool,
}

DigitalTwinAppViewer.defaultProps = {
  title: 'Digital Twin',
  results: null,
  modelVariables: [],
  enableInputSchedule: true,
  inputValues: {},
  inputEvents: [],
  onInputEventsChange: null,
  startTime: 0,
  stopTime: 1,
  stepSize: 0.001,
  isRunning: false,
  simulationState: 'idle',
  simulationError: null,
  onRunSimulation: null,
  downloadError: null,
  fullScreen: false,
}
