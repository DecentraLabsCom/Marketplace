'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import PropTypes from 'prop-types'
import PlaybackRateControl from './PlaybackRateControl'
import {
  getVariableDescription,
  getVariableDisplayName,
  getVariableDisplayUnit,
  getVariableEnumerationLabel,
  toVariableDisplayValue,
} from './simulationParameters'

const DigitalTwinCanvas = dynamic(() => import('./DigitalTwinCanvas'), {
  ssr: false,
  loading: () => <div className="h-105 animate-pulse bg-[#0b141a]" />,
})

function getSampleValue(series, index) {
  if (!Array.isArray(series) || series.length === 0) return undefined
  return series[Math.min(Math.max(index, 0), series.length - 1)]
}

function formatOutputValue(value, variable) {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  const enumerationLabel = variable ? getVariableEnumerationLabel(variable, value) : null
  if (enumerationLabel) return enumerationLabel
  const displayValue = variable ? toVariableDisplayValue(variable, value) : value
  if (typeof displayValue === 'number') {
    return Number.isFinite(displayValue)
      ? displayValue.toLocaleString(undefined, { maximumFractionDigits: 4 })
      : '—'
  }
  if (Array.isArray(displayValue)) {
    const preview = displayValue.slice(0, 4).map((item) => formatOutputValue(item)).join(', ')
    return `[${preview}${displayValue.length > 4 ? ', …' : ''}]`
  }
  return String(displayValue).slice(0, 64)
}

function formatTime(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} s` : '—'
}

function sampleIndexAtOrBefore(times, time) {
  let low = 0
  let high = times.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (Number(times[middle]) <= time) low = middle
    else high = middle - 1
  }
  return low
}

export default function DigitalTwinViewer({ sceneUrl, title, results, modelVariables, isRunning, startTime, stopTime }) {
  const [sampleIndex, setSampleIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [loadState, setLoadState] = useState('loading')
  const times = Array.isArray(results?.time) ? results.time : []
  const lastIndex = Math.max(times.length - 1, 0)
  const displayedSampleIndex = Math.min(sampleIndex, lastIndex)
  const timesRef = useRef(times)
  const sampleIndexRef = useRef(sampleIndex)
  const isRunningRef = useRef(isRunning)
  const wasRunningRef = useRef(false)
  const autoPlaybackRef = useRef(false)
  timesRef.current = times
  sampleIndexRef.current = sampleIndex
  isRunningRef.current = isRunning
  const modelDuration = times.length > 1
    ? Number(times[lastIndex]) - Number(times[0])
    : Number(stopTime) - Number(startTime)

  useEffect(() => {
    setSampleIndex(0)
    setPlaying(false)
    autoPlaybackRef.current = false
  }, [sceneUrl])

  useEffect(() => {
    if (isRunning && !wasRunningRef.current) {
      autoPlaybackRef.current = true
      setSampleIndex(0)
      setPlaying(true)
    }
    wasRunningRef.current = isRunning
  }, [isRunning])

  useEffect(() => {
    if (isRunning || autoPlaybackRef.current) return
    setSampleIndex((current) => current === lastIndex ? current : lastIndex)
  }, [isRunning, lastIndex, times.length])

  useEffect(() => {
    if (playing && !isRunning && lastIndex > 0 && sampleIndex >= lastIndex) setPlaying(false)
  }, [playing, isRunning, lastIndex, sampleIndex])

  useEffect(() => {
    if (!playing) return undefined
    let modelTime = null
    let previousFrameTime = null
    let animationFrame = 0

    const advance = (frameTime) => {
      const currentTimes = timesRef.current
      if (previousFrameTime !== null && modelTime !== null) {
        modelTime += ((frameTime - previousFrameTime) / 1000) * playbackRate
      }
      previousFrameTime = frameTime

      if (currentTimes.length === 0) {
        animationFrame = window.requestAnimationFrame(advance)
        return
      }

      if (modelTime === null || !Number.isFinite(modelTime)) {
        modelTime = Number(currentTimes[Math.min(sampleIndexRef.current, currentTimes.length - 1)])
      }

      const finalIndex = currentTimes.length - 1
      const finalTime = Number(currentTimes[finalIndex])
      if (modelTime > finalTime) modelTime = finalTime
      if (!Number.isFinite(modelTime)) {
        animationFrame = window.requestAnimationFrame(advance)
        return
      }

      const nextIndex = sampleIndexAtOrBefore(currentTimes, modelTime)
      setSampleIndex((current) => current === nextIndex ? current : nextIndex)
      if (!isRunningRef.current && modelTime >= finalTime) {
        setSampleIndex(finalIndex)
        autoPlaybackRef.current = false
        setPlaying(false)
        return
      }

      animationFrame = window.requestAnimationFrame(advance)
    }

    animationFrame = window.requestAnimationFrame(advance)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [playing, isRunning, playbackRate])

  const values = useMemo(() => Object.fromEntries(
    Object.entries(results?.outputs || {}).map(([name, series]) => [name, getSampleValue(series, displayedSampleIndex)]),
  ), [results?.outputs, displayedSampleIndex])

  const togglePlayback = useCallback(() => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (lastIndex < 1) return
    if (!isRunning && sampleIndex >= lastIndex) setSampleIndex(0)
    setPlaying(true)
  }, [playing, lastIndex, isRunning, sampleIndex])

  const stats = modelVariables
    .filter((variable) => variable?.causality === 'output' && typeof variable.name === 'string')
    .map((variable) => ({
      variable,
      value: values[variable.name],
      description: getVariableDescription(variable),
      displayName: getVariableDisplayName(variable),
      displayUnit: getVariableDisplayUnit(variable),
    }))

  return (
    <section className="overflow-hidden rounded-2xl border border-[#283a42] bg-[#101a20] shadow-xl shadow-black/20">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26363d] px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#67d7cf]">FMI / GLB digital twin</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#29434a] bg-[#14262b] px-3 py-1.5 text-xs text-[#bad0d2]">
          <span className={`h-2 w-2 rounded-full ${loadState === 'ready' ? 'bg-[#59e1a2]' : loadState === 'error' ? 'bg-[#fa6673]' : 'bg-[#f5b942] animate-pulse'}`} />
          {loadState === 'ready' ? (isRunning ? 'Live simulation' : 'Scene ready') : loadState === 'error' ? 'Scene unavailable' : 'Loading GLB scene'}
        </div>
      </header>

      <div className="grid items-stretch gap-4 p-4 lg:h-[78vh] lg:min-h-[36rem] lg:max-h-[52rem] lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative min-h-128 overflow-hidden rounded-xl border border-[#253840] bg-[#0b141a] lg:min-h-0">
          <DigitalTwinCanvas
            sceneUrl={sceneUrl}
            values={values}
            modelVariables={modelVariables}
            onStatus={setLoadState}
          />
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-white/10 bg-[#071014]/80 px-3 py-2 text-[11px] text-[#a9c0c4] backdrop-blur">
            Drag to orbit · scroll to zoom
          </div>
          {loadState === 'error' && (
            <div className="absolute inset-0 grid place-items-center bg-[#0b141a]/90 p-6 text-center text-sm text-[#f5b4ba]">
            The GLB scene could not be loaded. Check its AAS File URL and the provider Gateway response.
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-3 lg:h-full lg:min-h-0">
          <div className="max-h-128 min-h-0 space-y-2 overflow-y-auto pr-1 lg:max-h-none lg:flex-1">
            {stats.map(({ variable, value, description, displayName, displayUnit }) => (
              <div key={variable.name} className="rounded-xl border border-[#26383f] bg-[#142128] px-3 py-3">
                <p className="truncate text-[10px] uppercase tracking-[0.13em] text-[#829ba1]" title={description || variable.name}>
                  {displayName !== variable.name ? displayName : description || variable.name}
                </p>
                <p className="mt-1 wrap-break-words text-lg font-semibold tabular-nums text-white">
                  {formatOutputValue(value, variable)}
                  {displayUnit ? <span className="ml-1 text-xs font-normal text-[#91a7ac]">{displayUnit}</span> : null}
                </p>
              </div>
            ))}
            {stats.length === 0 && (
              <p className="rounded-xl border border-[#26383f] bg-[#142128] px-3 py-3 text-xs text-[#829ba1]">
                This FMU does not declare output variables for the scene panel.
              </p>
            )}
          </div>

          <div>
            <PlaybackRateControl rate={playbackRate} onChange={setPlaybackRate} modelDuration={modelDuration} />
          </div>

          <div className="rounded-xl border border-[#26383f] bg-[#142128] p-3">
            <div className="flex items-center justify-between text-xs text-[#a9bec2]">
              <span>Execution timeline</span>
              <span className="font-mono text-white">{formatTime(times[displayedSampleIndex])}</span>
            </div>
            <input
              aria-label="Digital twin simulation timeline"
              type="range"
              min="0"
              max={lastIndex}
              value={displayedSampleIndex}
              onChange={(event) => {
                setPlaying(false)
                setSampleIndex(Number(event.target.value))
                autoPlaybackRef.current = false
              }}
              disabled={times.length < 2 || isRunning}
              className="mt-3 w-full accent-[#54d5c9] disabled:opacity-40"
            />
            <div className="mt-2 flex items-center justify-between text-[10px] text-[#829ba1]">
              <span>{formatTime(times[0])}</span>
              <span>{formatTime(times[lastIndex])}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={togglePlayback}
            disabled={times.length < 2}
            className="w-full rounded-lg border border-[#35736f] bg-[#173e40] px-3 py-2 text-xs font-semibold text-[#b8fff1] transition hover:bg-[#205856] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {playing ? 'Pause replay' : 'Replay simulation'}
          </button>
        </aside>
      </div>
    </section>
  )
}

DigitalTwinViewer.propTypes = {
  sceneUrl: PropTypes.string.isRequired,
  title: PropTypes.string,
  results: PropTypes.shape({ time: PropTypes.array, outputs: PropTypes.object }),
  modelVariables: PropTypes.arrayOf(PropTypes.object),
  isRunning: PropTypes.bool,
  startTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  stopTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
}

DigitalTwinViewer.defaultProps = {
  title: 'Digital Twin',
  results: null,
  modelVariables: [],
  isRunning: false,
  startTime: 0,
  stopTime: 1,
}
