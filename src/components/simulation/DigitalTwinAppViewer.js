'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'

const APP_READY_MESSAGE = 'decentralabs:digital-twin-ready'
const APP_ERROR_MESSAGE = 'decentralabs:digital-twin-error'
const HOST_READY_MESSAGE = 'decentralabs:digital-twin-host-ready'
const APP_MESSAGE_VERSION = 1
const APP_READY_TIMEOUT_MS = 30_000
const EMPTY_TIMES = []

function currentValue(series, index) {
  if (!Array.isArray(series) || series.length === 0) return undefined
  return series[Math.min(Math.max(index, 0), series.length - 1)]
}

export default function DigitalTwinAppViewer({ appUrl, title, results, modelVariables, isRunning }) {
  const iframeRef = useRef(null)
  const sentSampleCountRef = useRef(0)
  const [appState, setAppState] = useState('loading')
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const times = Array.isArray(results?.time) ? results.time : EMPTY_TIMES
  const sampleIndex = Math.max(times.length - 1, 0)
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
        setAppState('ready')
      } else if (message.type === APP_ERROR_MESSAGE) {
        window.clearInterval(handshake)
        window.clearTimeout(timeout)
        setAppState('error')
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
      state: isRunning ? 'running' : times.length > 0 ? 'completed' : 'idle',
    })
  }, [appState, isRunning, outputDefaults, outputNames, results, sample, times])

  function handleFrameLoad() {
    setFrameLoaded(true)
    iframeRef.current?.contentWindow?.postMessage({
      type: HOST_READY_MESSAGE,
      version: APP_MESSAGE_VERSION,
    }, '*')
  }

  return (
    <section className="relative h-[min(82vh,60rem)] min-h-128 w-full overflow-hidden rounded-xl border border-[#253840] bg-[#07151b]">
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
    </section>
  )
}

DigitalTwinAppViewer.propTypes = {
  appUrl: PropTypes.string.isRequired,
  title: PropTypes.string,
  results: PropTypes.shape({ time: PropTypes.array, outputs: PropTypes.object }),
  modelVariables: PropTypes.arrayOf(PropTypes.object),
  isRunning: PropTypes.bool,
}

DigitalTwinAppViewer.defaultProps = {
  title: 'Digital Twin',
  results: null,
  modelVariables: [],
  isRunning: false,
}
