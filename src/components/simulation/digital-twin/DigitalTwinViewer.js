'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import PropTypes from 'prop-types'
import { Activity, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import PlaybackRateControl from '../controls/PlaybackRateControl'
import VariableDescriptionTooltip from '../controls/VariableDescriptionTooltip'
import {
  getVariableDescription,
  getVariableDisplayName,
  getVariableDisplayUnit,
  getVariableEnumerationLabel,
  toVariableDisplayValue,
} from '../utils/simulationParameters'

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

export default function DigitalTwinViewer({
  sceneUrl,
  title,
  results,
  modelVariables,
  inputValues = {},
  interactiveInputVariables = [],
  inputEditingEnabled = false,
  onInputChange,
  isRunning,
  startTime,
  stopTime,
  followLatest,
  onDisplayedSampleChange,
}) {
  const [sampleIndex, setSampleIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [loadState, setLoadState] = useState('loading')
  const [pinnedOutputNames, setPinnedOutputNames] = useState(() => new Set())
  const [controlsCollapsed, setControlsCollapsed] = useState(false)
  const [outputMarkersVisible, setOutputMarkersVisible] = useState(false)
  const [inputMarkersVisible, setInputMarkersVisible] = useState(false)
  const [sceneInputBindingNames, setSceneInputBindingNames] = useState([])
  const times = Array.isArray(results?.time) ? results.time : []
  const lastIndex = Math.max(times.length - 1, 0)
  const displayedSampleIndex = isRunning && followLatest ? lastIndex : Math.min(sampleIndex, lastIndex)
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
    setPinnedOutputNames(new Set())
    setControlsCollapsed(false)
    setSceneInputBindingNames([])
    autoPlaybackRef.current = false
  }, [sceneUrl])

  useEffect(() => {
    if (isRunning && !wasRunningRef.current) {
      autoPlaybackRef.current = !followLatest
      setSampleIndex(followLatest ? lastIndex : 0)
      setPlaying(!followLatest)
    } else if (isRunning && followLatest) {
      autoPlaybackRef.current = false
      setPlaying(false)
    }
    wasRunningRef.current = isRunning
  }, [followLatest, isRunning, lastIndex])

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
  const sceneValues = useMemo(() => ({ ...values, ...inputValues }), [inputValues, values])

  const togglePlayback = useCallback(() => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (lastIndex < 1) return
    if (!isRunning && sampleIndex >= lastIndex) setSampleIndex(0)
    setPlaying(true)
  }, [playing, lastIndex, isRunning, sampleIndex])

  const handleTimelineWheel = useCallback((event) => {
    if (event.deltaY === 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || isRunning || lastIndex < 1) return

    const direction = event.deltaY < 0 ? 1 : -1
    const currentIndex = sampleIndexRef.current
    const nextIndex = Math.min(lastIndex, Math.max(0, currentIndex + direction))
    if (nextIndex === currentIndex) return

    event.preventDefault()
    autoPlaybackRef.current = false
    setPlaying(false)
    sampleIndexRef.current = nextIndex
    setSampleIndex(nextIndex)
  }, [isRunning, lastIndex])

  const stats = modelVariables
    .filter((variable) => variable?.causality === 'output' && typeof variable.name === 'string')
    .map((variable) => ({
      variable,
      value: values[variable.name],
      description: getVariableDescription(variable),
      displayName: getVariableDisplayName(variable),
      displayUnit: getVariableDisplayUnit(variable),
    }))
  const pinnedStats = []
  const otherStats = []
  stats.forEach((stat) => {
    (pinnedOutputNames.has(stat.variable.name) ? pinnedStats : otherStats).push(stat)
  })
  const orderedStats = [...pinnedStats, ...otherStats]
  const editableInputNames = new Set(interactiveInputVariables.map(({ name }) => name))
  const hasEditableSceneInputs = inputEditingEnabled
    && sceneInputBindingNames.some((name) => editableInputNames.has(name))

  const togglePinnedOutput = (name) => {
    setPinnedOutputNames((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#283a42] bg-[#101a20] shadow-xl shadow-black/20">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26363d] px-5 py-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#29434a] bg-[#14262b] px-3 py-1.5 text-xs text-[#bad0d2]">
          <span className={`h-2 w-2 rounded-full ${loadState === 'ready' ? 'bg-[#59e1a2]' : loadState === 'error' ? 'bg-[#fa6673]' : 'bg-[#f5b942] animate-pulse'}`} />
          {loadState === 'ready' ? (isRunning ? 'Live simulation' : 'Scene ready') : loadState === 'error' ? 'Scene unavailable' : 'Loading GLB scene'}
        </div>
      </header>

      <div className={`grid items-stretch gap-4 p-4 lg:h-[78vh] lg:min-h-[36rem] lg:max-h-[52rem] ${controlsCollapsed
        ? 'grid-cols-[minmax(0,1fr)_3.5rem]'
        : 'lg:grid-cols-[minmax(0,1fr)_220px]'}`}>
        <div className="relative min-h-128 overflow-hidden rounded-xl border border-[#253840] bg-[#0b141a] lg:min-h-0">
          <DigitalTwinCanvas
            sceneUrl={sceneUrl}
            values={sceneValues}
            modelVariables={modelVariables}
            pinnedOutputNames={pinnedOutputNames}
            interactiveInputVariables={interactiveInputVariables}
            inputEditingEnabled={inputEditingEnabled}
            onInputChange={onInputChange}
            onSceneInputBindingsReady={setSceneInputBindingNames}
            showOutputMarkers={outputMarkersVisible}
            showInputMarkers={inputMarkersVisible}
            onStatus={setLoadState}
            sampleIndex={displayedSampleIndex}
            onSampleRendered={isRunning && followLatest ? onDisplayedSampleChange : undefined}
          />
          {loadState === 'ready' ? (
            <div className="absolute left-3 top-3 z-30 flex gap-2">
              <VariableDescriptionTooltip
                name="Output markers"
                description={outputMarkersVisible
                  ? 'Hide output markers.'
                  : 'Show markers for described or pinned outputs.'}
                align="left"
                portal
              >
                <button
                  type="button"
                  aria-label={outputMarkersVisible ? 'Hide output markers' : 'Show output markers'}
                  aria-pressed={outputMarkersVisible}
                  onClick={() => setOutputMarkersVisible((visible) => !visible)}
                  className="grid size-8 place-items-center rounded-lg border border-[#355158] bg-[#071014]/75 shadow-lg backdrop-blur transition hover:border-[#54d5c9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2.5 rounded-full border border-[#9cf7eb] transition ${outputMarkersVisible ? 'animate-pulse bg-[#72f3e4] shadow-[0_0_9px_2px_rgba(84,213,201,0.55)]' : 'bg-[#204d50]'}`}
                  />
                </button>
              </VariableDescriptionTooltip>
              {hasEditableSceneInputs ? (
                <VariableDescriptionTooltip
                  name="Input markers"
                  description={inputMarkersVisible
                    ? 'Hide markers for writable inputs bound to scene objects.'
                    : 'Show markers for writable inputs bound to scene objects.'}
                  align="left"
                  portal
                >
                  <button
                    type="button"
                    aria-label={inputMarkersVisible ? 'Hide input markers' : 'Show input markers'}
                    aria-pressed={inputMarkersVisible}
                    onClick={() => setInputMarkersVisible((visible) => !visible)}
                    className="grid size-8 place-items-center rounded-lg border border-[#74602d] bg-[#071014]/75 shadow-lg backdrop-blur transition hover:border-[#ffd166] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd166]"
                  >
                    <span
                      aria-hidden="true"
                      className={`size-2.5 rounded-full border border-[#fff1bd] transition ${inputMarkersVisible ? 'animate-pulse bg-[#ffd166] shadow-[0_0_9px_2px_rgba(255,209,102,0.55)]' : 'bg-[#58471f]'}`}
                    />
                  </button>
                </VariableDescriptionTooltip>
              ) : null}
            </div>
          ) : null}
          {controlsCollapsed && loadState === 'ready' && pinnedStats.length > 0 ? (
            <div
              role="region"
              aria-label="Pinned live output indicators"
              className="pointer-events-none absolute inset-y-3 right-3 z-20 flex w-56 max-w-[calc(100%-1.5rem)] flex-col gap-2 overflow-y-auto"
            >
              <div className="pointer-events-auto flex w-[85%] shrink-0 self-end items-center justify-between rounded-lg border border-[#355158] bg-[#071014]/70 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9ab8bd] shadow-lg backdrop-blur">
                <span>Outputs</span>
                <span className="font-mono text-[#67d7cf]">{pinnedStats.length} pinned</span>
              </div>
              {pinnedStats.map(({ variable, value, description, displayName, displayUnit }) => (
                <VariableDescriptionTooltip
                  key={variable.name}
                  name={variable.name}
                  description={description}
                  positionKey={pinnedOutputNames}
                  portal
                >
                  <div className="pointer-events-auto flex w-3/4 min-w-0 shrink-0 self-end items-center gap-2 rounded-lg border border-[#355158] bg-[#071014]/70 px-2.5 py-2 shadow-lg backdrop-blur">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md border border-[#315057] bg-[#122328] text-[#67d7cf]">
                      <Activity size={14} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-[#9ab8bd]" title={variable.name}>
                        {displayName}
                      </p>
                      <p className="flex min-w-0 items-baseline gap-1 font-mono text-sm font-bold tabular-nums text-white">
                        <span className="min-w-0 truncate">{formatOutputValue(value, variable)}</span>
                        {displayUnit ? <span className="shrink-0 text-[9px] font-normal text-[#91a7ac]">{displayUnit}</span> : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Unpin ${variable.name} indicator`}
                      aria-pressed="true"
                      onClick={() => togglePinnedOutput(variable.name)}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-[#67d7cf] transition hover:bg-[#173e40] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path
                          d="m10 2.5 2.3 4.8 5.3.8-3.8 3.7.9 5.2-4.7-2.5-4.7 2.5.9-5.2-3.8-3.7 5.3-.8L10 2.5Z"
                          fill="currentColor"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </VariableDescriptionTooltip>
              ))}
            </div>
          ) : null}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-white/10 bg-[#071014]/80 px-3 py-2 text-[11px] text-[#a9c0c4] backdrop-blur">
            {hasEditableSceneInputs && inputMarkersVisible
              ? 'Drag bound inputs to move them · drag elsewhere to orbit · scroll to zoom'
              : 'Drag to orbit · scroll to zoom'}
          </div>
          {loadState === 'error' && (
            <div className="absolute inset-0 grid place-items-center bg-[#0b141a]/90 p-6 text-center text-sm text-[#f5b4ba]">
            The GLB scene could not be loaded. Check its AAS File URL and the provider Gateway response.
            </div>
          )}
        </div>

        <aside className={controlsCollapsed
          ? 'flex min-h-0 min-w-0 flex-col items-center gap-2 rounded-xl border border-[#26383f] bg-[#142128] p-2 lg:h-full'
          : 'flex flex-col gap-3 lg:h-full lg:min-h-0'}>
          {controlsCollapsed ? (
            <>
              <button
                type="button"
                aria-label="Expand controls panel"
                aria-expanded="false"
                onClick={() => setControlsCollapsed(false)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[#30464d] text-[#a9bec2] transition hover:border-[#54d5c9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <span className="shrink-0 whitespace-nowrap text-center font-mono text-[8px] leading-tight tracking-tight text-[#829ba1]">
                {formatTime(times[0])}
              </span>
              <input
                aria-label="Digital twin simulation timeline"
                aria-orientation="vertical"
                aria-valuetext={formatTime(times[displayedSampleIndex])}
                type="range"
                min="0"
                max={lastIndex}
                value={displayedSampleIndex}
                onChange={(event) => {
                  setPlaying(false)
                  setSampleIndex(Number(event.target.value))
                  autoPlaybackRef.current = false
                }}
                onWheel={handleTimelineWheel}
                disabled={times.length < 2 || isRunning}
                style={{ writingMode: 'vertical-lr', direction: 'ltr' }}
                className="min-h-0 w-6 flex-1 accent-[#54d5c9] disabled:opacity-40"
              />
              <span className="shrink-0 whitespace-nowrap text-center font-mono text-[8px] leading-tight tracking-tight text-[#829ba1]">
                {formatTime(times[lastIndex])}
              </span>
              {!(isRunning && followLatest) ? (
                <button
                  type="button"
                  onClick={togglePlayback}
                  disabled={times.length < 2}
                  aria-label={playing ? 'Pause replay' : 'Replay simulation'}
                  title={playing ? 'Pause replay' : 'Replay'}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[#35736f] bg-[#173e40] text-[#b8fff1] transition hover:bg-[#205856] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#829ba1]">
                  <span className="mr-1 font-mono text-[#b8d2d5]">{stats.length}</span>Outputs
                </p>
                <button
                  type="button"
                  aria-label="Minimize controls panel"
                  aria-expanded="true"
                  onClick={() => setControlsCollapsed(true)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[#30464d] text-[#a9bec2] transition hover:border-[#54d5c9] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
                >
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              </div>
              <div className="max-h-128 min-h-0 flex-1 overflow-y-auto pr-1 lg:max-h-none">
                {orderedStats.length > 0 ? (
                  <div className="grid grid-cols-2 content-start gap-2">
                    {orderedStats.map(({ variable, value, description, displayName, displayUnit }) => {
                      const isPinned = pinnedOutputNames.has(variable.name)
                      return (
                        <VariableDescriptionTooltip
                          key={variable.name}
                          name={variable.name}
                          description={description}
                          positionKey={pinnedOutputNames}
                          portal
                        >
                          <div role="group" aria-label={variable.name} className="relative min-w-0 rounded-xl border border-[#26383f] bg-[#142128] px-2.5 pb-1.5 pt-5">
                            <p className="min-w-0 truncate pr-0.5 text-[10px] uppercase tracking-[0.1em] text-[#a2b7bb]">
                              {displayName}
                            </p>
                            <button
                              type="button"
                              aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${variable.name} indicator`}
                              aria-pressed={isPinned}
                              onClick={() => togglePinnedOutput(variable.name)}
                              className={`absolute right-1.5 top-1 grid h-4 w-4 place-items-center rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9] ${isPinned ? 'text-[#67d7cf]' : 'text-[#718b90] hover:text-[#d6e9e9]'}`}
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                <path
                                  d="m10 2.5 2.3 4.8 5.3.8-3.8 3.7.9 5.2-4.7-2.5-4.7 2.5.9-5.2-3.8-3.7 5.3-.8L10 2.5Z"
                                  fill={isPinned ? 'currentColor' : 'none'}
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                            <p className="mt-0.5 flex min-w-0 items-baseline gap-1 text-base font-semibold tabular-nums text-white">
                              <span className="min-w-0 truncate">{formatOutputValue(value, variable)}</span>
                              {displayUnit ? <span className="shrink-0 text-[10px] font-normal text-[#91a7ac]">{displayUnit}</span> : null}
                            </p>
                          </div>
                        </VariableDescriptionTooltip>
                      )
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl border border-[#26383f] bg-[#142128] px-3 py-3 text-xs text-[#829ba1]">
                    This FMU does not declare output variables for the scene panel.
                  </p>
                )}
              </div>
              {isRunning && followLatest ? (
                <p className="text-[10px] text-[#829ba1]">Showing the latest interactive sample.</p>
              ) : (
                <div>
                  <PlaybackRateControl rate={playbackRate} onChange={setPlaybackRate} modelDuration={modelDuration} />
                </div>
              )}
              <div className="rounded-xl border border-[#26383f] bg-[#142128] p-3">
                <div className="flex items-center justify-between text-xs text-[#a9bec2]">
                  <span>Execution timeline</span>
                  <span className="font-mono text-white">{formatTime(times[displayedSampleIndex])}</span>
                </div>
                <input
                  aria-label="Digital twin simulation timeline"
                  aria-valuetext={formatTime(times[displayedSampleIndex])}
                  type="range"
                  min="0"
                  max={lastIndex}
                  value={displayedSampleIndex}
                  onChange={(event) => {
                    setPlaying(false)
                    setSampleIndex(Number(event.target.value))
                    autoPlaybackRef.current = false
                  }}
                  onWheel={handleTimelineWheel}
                  disabled={times.length < 2 || isRunning}
                  className="mt-2 w-full accent-[#54d5c9] disabled:opacity-40"
                />
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-[#829ba1]">
                  <span>{formatTime(times[0])}</span>
                  {!(isRunning && followLatest) ? (
                    <button
                      type="button"
                      onClick={togglePlayback}
                      disabled={times.length < 2}
                      aria-label={playing ? 'Pause replay' : 'Replay simulation'}
                      className="shrink-0 rounded-md border border-[#35736f] bg-[#173e40] px-3 py-1.5 text-sm font-semibold text-[#b8fff1] transition hover:bg-[#205856] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {playing ? 'Pause' : 'Replay'}
                    </button>
                  ) : null}
                  <span>{formatTime(times[lastIndex])}</span>
                </div>
              </div>
            </>
          )}
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
  inputValues: PropTypes.object,
  interactiveInputVariables: PropTypes.arrayOf(PropTypes.object),
  inputEditingEnabled: PropTypes.bool,
  onInputChange: PropTypes.func,
  isRunning: PropTypes.bool,
  startTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  stopTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  followLatest: PropTypes.bool,
  onDisplayedSampleChange: PropTypes.func,
}

DigitalTwinViewer.defaultProps = {
  title: 'Digital Twin',
  results: null,
  modelVariables: [],
  inputValues: {},
  interactiveInputVariables: [],
  inputEditingEnabled: false,
  isRunning: false,
  followLatest: false,
  startTime: 0,
  stopTime: 1,
}
