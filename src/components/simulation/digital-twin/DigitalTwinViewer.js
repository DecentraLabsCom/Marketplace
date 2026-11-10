'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import PropTypes from 'prop-types'
import { Activity, ChartNoAxesCombined, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import PlaybackRateControl from '../controls/PlaybackRateControl'
import VariableDescriptionTooltip from '../controls/VariableDescriptionTooltip'
import SimulationGraphConfigurationDialog from './SimulationGraphConfigurationDialog'
import SimulationGraphPanel from './SimulationGraphPanel'
import { createGraphConfiguration, getGraphableVariables } from '../utils/simulationGraphData'
import {
  getVariableDescription,
  getVariableDisplayName,
  getVariableDisplayUnit,
  getVariableEnumerationLabel,
  toVariableDisplayValue,
} from '../utils/simulationParameters'
import { sortVariablesAlphabetically } from '../utils/sortVariablesAlphabetically'

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

function formatTime(value, unit = 's') {
  if (!Number.isFinite(Number(value))) return '—'
  const suffix = typeof unit === 'string' && unit.trim() ? ` ${unit.trim()}` : ''
  return `${Number(value).toFixed(2)}${suffix}`
}

function getFmiEventMarkers(results) {
  const times = Array.isArray(results?.time) ? results.time : []
  const markers = []
  for (let index = 0; index < times.length; index += 1) {
    const metadata = results?.sampleMetadata?.[index]
    const reasons = []
    if (results?.discontinuities?.[index] === true || metadata?.discontinuity) reasons.push('discontinuity')
    if (metadata?.eventOccurred || metadata?.eventHandlingNeeded) reasons.push('FMI event')
    if (metadata?.earlyReturn) reasons.push('early return')
    if (metadata?.terminateSimulation) reasons.push('termination')
    if (reasons.length) markers.push({ index, time: Number(times[index]), label: [...new Set(reasons)].join(', ') })
  }
  if (markers.length <= 256) return markers
  const stride = Math.ceil(markers.length / 256)
  return markers.filter((_, index) => index % stride === 0).slice(0, 256)
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

function interpolateSampleValue(current, next, fraction) {
  if (Number.isFinite(current) && Number.isFinite(next)) {
    return current + ((next - current) * fraction)
  }
  if (Array.isArray(current) && Array.isArray(next) && current.length === next.length
    && current.every((value, index) => Number.isFinite(value) && Number.isFinite(next[index]))) {
    return current.map((value, index) => value + ((next[index] - value) * fraction))
  }
  return current
}

function isDiscontinuitySample(results, index) {
  if (results?.discontinuities?.[index] === true) return true
  const metadata = results?.sampleMetadata?.[index]
  return Boolean(metadata && (
    metadata.eventOccurred
    || metadata.eventHandlingNeeded
    || metadata.earlyReturn
    || metadata.discontinuity
    || metadata.terminateSimulation
  ))
}

function getOutputValuesAtTime(results, modelTime, interpolatableVariables) {
  const times = Array.isArray(results?.time) ? results.time : []
  const outputs = results?.outputs || {}
  if (!times.length || !Number.isFinite(modelTime)) return {}

  const index = sampleIndexAtOrBefore(times, modelTime)
  const nextIndex = index + 1
  const currentTime = Number(times[index])
  const nextTime = Number(times[nextIndex])
  const canInterpolate = nextIndex < times.length
    && Number.isFinite(currentTime)
    && Number.isFinite(nextTime)
    && nextTime > currentTime
    && !isDiscontinuitySample(results, nextIndex)
  if (!canInterpolate) {
    return Object.fromEntries(Object.entries(outputs).map(([name, series]) => [name, getSampleValue(series, index)]))
  }

  const fraction = Math.max(0, Math.min(1, (modelTime - currentTime) / (nextTime - currentTime)))
  return Object.fromEntries(Object.entries(outputs).map(([name, series]) => {
    const current = getSampleValue(series, index)
    const next = getSampleValue(series, nextIndex)
    return [name, interpolatableVariables.has(name)
      ? interpolateSampleValue(current, next, fraction)
      : current]
  }))
}

export default function DigitalTwinViewer({
  sceneUrl,
  title,
  results,
  streamingResultsRef,
  modelVariables,
  modelStructure,
  inputValues = {},
  interactiveInputVariables = [],
  inputEditingEnabled = false,
  onInputChange,
  onInputInteractionStart,
  onInputInteractionEnd,
  isRunning,
  startTime,
  stopTime,
  followLatest,
  onDisplayedSampleChange,
  timeUnit = 's',
}) {
  const [sampleIndex, setSampleIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [loadState, setLoadState] = useState('loading')
  const [pinnedOutputNames, setPinnedOutputNames] = useState(() => new Set())
  const [controlsCollapsed, setControlsCollapsed] = useState(false)
  const [graphPanelOpen, setGraphPanelOpen] = useState(false)
  const [simulationGraphs, setSimulationGraphs] = useState([])
  const [simulationGraphPage, setSimulationGraphPage] = useState(0)
  const [graphConfigurationOpen, setGraphConfigurationOpen] = useState(false)
  const [selectedGraphConfigurationId, setSelectedGraphConfigurationId] = useState('')
  const [outputMarkersVisible, setOutputMarkersVisible] = useState(false)
  const [inputMarkersVisible, setInputMarkersVisible] = useState(false)
  const [sceneInputBindingNames, setSceneInputBindingNames] = useState([])
  const graphVariableSignature = useMemo(() => getGraphableVariables(modelVariables)
    .map((variable) => `${variable.name}:${variable.causality}:${variable.type}`)
    .join('|'), [modelVariables])
  const graphPageCount = Math.max(1, Math.ceil(simulationGraphs.length / 2))
  const currentGraphPage = Math.min(simulationGraphPage, graphPageCount - 1)
  const streamingResults = isRunning ? streamingResultsRef?.current : null
  const activeResults = streamingResults || results
  const times = Array.isArray(activeResults?.time) ? activeResults.time : []
  const sampleIndexOffset = Number(activeResults?.sampleIndexOffset) || 0
  const lastIndex = Math.max(times.length - 1, 0)
  const displayedSampleIndex = isRunning && followLatest ? lastIndex : Math.min(sampleIndex, lastIndex)
  const displayedSampleSequence = activeResults?.sampleMetadata?.[displayedSampleIndex]?.sequence
  const displayedSampleOrdinal = sampleIndexOffset + displayedSampleIndex
  const eventMarkers = useMemo(() => getFmiEventMarkers(activeResults), [activeResults])
  const interpolatableVariables = useMemo(() => new Set(modelVariables
    .filter((variable) => variable?.causality === 'output'
      && ['Real', 'Float32', 'Float64'].includes(variable?.type)
      && (!variable.variability || variable.variability === 'continuous'))
    .map((variable) => variable.name)), [modelVariables])
  const timesRef = useRef(times)
  const sampleIndexRef = useRef(sampleIndex)
  const isRunningRef = useRef(isRunning)
  const wasRunningRef = useRef(false)
  const autoPlaybackRef = useRef(false)
  const activeResultsRef = useRef(activeResults)
  const inputValuesRef = useRef(inputValues)
  const interpolatableVariablesRef = useRef(new Set())
  const animatedValuesRef = useRef({})
  timesRef.current = times
  sampleIndexRef.current = sampleIndex
  isRunningRef.current = isRunning
  activeResultsRef.current = activeResults
  inputValuesRef.current = inputValues
  interpolatableVariablesRef.current = interpolatableVariables
  const modelDuration = times.length > 1
    ? Number(times[lastIndex]) - Number(times[0])
    : Number.isFinite(Number(stopTime)) && Number.isFinite(Number(startTime))
      ? Number(stopTime) - Number(startTime)
      : 0

  useEffect(() => {
    setSampleIndex(0)
    setPlaying(false)
    setPinnedOutputNames(new Set())
    setControlsCollapsed(false)
    setGraphPanelOpen(false)
    setSceneInputBindingNames([])
    autoPlaybackRef.current = false
  }, [sceneUrl])

  useEffect(() => {
    setSimulationGraphs([])
    setSimulationGraphPage(0)
    setSelectedGraphConfigurationId('')
    setGraphPanelOpen(false)
    setGraphConfigurationOpen(false)
  }, [graphVariableSignature, sceneUrl])

  useEffect(() => {
    setSimulationGraphPage((page) => Math.min(page, graphPageCount - 1))
  }, [graphPageCount])

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
      const currentResults = activeResultsRef.current
      animatedValuesRef.current = {
        ...getOutputValuesAtTime(currentResults, modelTime, interpolatableVariablesRef.current),
        ...inputValuesRef.current,
      }
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
    Object.entries(activeResults?.outputs || {}).map(([name, series]) => [name, getSampleValue(series, displayedSampleIndex)]),
  ), [activeResults?.outputs, displayedSampleIndex])
  const sceneValues = useMemo(() => ({ ...values, ...inputValues }), [inputValues, values])
  animatedValuesRef.current = sceneValues

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

  const stats = sortVariablesAlphabetically(modelVariables
    .filter((variable) => variable?.causality === 'output' && typeof variable.name === 'string'))
    .map((variable) => ({
      variable,
      value: values[variable.name],
      description: getVariableDescription(variable),
      displayName: getVariableDisplayName(variable),
      displayUnit: getVariableDisplayUnit(variable),
    }))
  const pinnedStats = []
  stats.forEach((stat) => {
    if (pinnedOutputNames.has(stat.variable.name)) pinnedStats.push(stat)
  })
  const orderedStats = stats
  const editableInputNames = new Set(interactiveInputVariables.map(({ name }) => name))
  const hasAuthorizedSceneInputs = sceneInputBindingNames.some((name) => editableInputNames.has(name))
  const hasEditableSceneInputs = inputEditingEnabled && hasAuthorizedSceneInputs
  const graphPanelVisible = graphPanelOpen && simulationGraphs.length > 0
  const graphToggleBesidePinnedOutputs = controlsCollapsed
    && loadState === 'ready'
    && pinnedStats.length > 0
    && simulationGraphs.length > 0
  const graphPanelToggleButton = simulationGraphs.length > 0 ? (
    <VariableDescriptionTooltip
      name={graphPanelVisible ? 'Hide graph panel' : 'Show graph panel'}
      description={graphPanelVisible ? 'Hide the configured graphs.' : 'Show the configured graphs.'}
      align="right"
      portal
    >
      <button
        type="button"
        aria-label={graphPanelVisible ? 'Hide graph panel' : 'Show graph panel'}
        aria-pressed={graphPanelVisible}
        onClick={() => setGraphPanelOpen((visible) => !visible)}
        className={`grid size-8 shrink-0 place-items-center rounded-lg border bg-[#071014]/75 shadow-lg backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9] ${graphPanelVisible ? 'border-[#54d5c9] text-[#b8fff1]' : 'border-[#355158] text-[#9ab8bd] hover:border-[#54d5c9]'}`}
      >
        <ChartNoAxesCombined size={16} aria-hidden="true" />
      </button>
    </VariableDescriptionTooltip>
  ) : null

  const togglePinnedOutput = (name) => {
    setPinnedOutputNames((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const openGraphConfiguration = () => {
    setGraphConfigurationOpen(true)
  }

  const addSimulationGraph = () => {
    let graphNumber = simulationGraphs.length + 1
    while (simulationGraphs.some((graph) => graph.name === `Graph ${graphNumber}`)) graphNumber += 1
    const graph = createGraphConfiguration(graphNumber, modelVariables)
    setSimulationGraphs((current) => [...current, graph])
    setSelectedGraphConfigurationId(graph.id)
    setGraphPanelOpen(true)
    return graph
  }

  const saveSimulationGraph = (graph) => {
    setSimulationGraphs((current) => current.map((item) => item.id === graph.id ? graph : item))
    setGraphPanelOpen(true)
  }

  const deleteSimulationGraph = (graphId) => {
    const nextGraphs = simulationGraphs.filter((graph) => graph.id !== graphId)
    setSimulationGraphs(nextGraphs)
    if (nextGraphs.length === 0) setGraphPanelOpen(false)
    if (selectedGraphConfigurationId === graphId) {
      setSelectedGraphConfigurationId(nextGraphs[0]?.id || '')
    }
  }

  const editSimulationGraph = (graphId) => {
    setSelectedGraphConfigurationId(graphId)
    setGraphConfigurationOpen(true)
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#283a42] bg-[#101a20] shadow-xl shadow-black/20">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26363d] px-5 py-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {graphPanelVisible && simulationGraphs.length > 2 ? (
            <div className="flex max-w-44 shrink-0 items-center gap-0.5 overflow-x-auto [scrollbar-none]" role="tablist" aria-label="Graph pages">
              {Array.from({ length: graphPageCount }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  role="tab"
                  aria-label={`Show graph page ${index + 1}`}
                  aria-selected={currentGraphPage === index}
                  onClick={() => setSimulationGraphPage(index)}
                  className={`shrink-0 rounded px-2 py-1 text-[10px] font-medium ${currentGraphPage === index ? 'bg-[#173e40] text-[#b8fff1]' : 'text-[#829ba1] hover:bg-[#1b2b31] hover:text-white'}`}
                >
                  {index + 1} / {graphPageCount}
                </button>
              ))}
            </div>
          ) : null}
          <VariableDescriptionTooltip
            name="Configure graphs"
            description="Choose the X variable and one or more input or output variables for each graph."
            align="left"
            portal
          >
            <button
              type="button"
              aria-label="Configure simulation graphs"
              onClick={openGraphConfiguration}
              className="grid size-8 place-items-center rounded-lg border border-[#355158] bg-[#14262b] text-[#9bded8] transition hover:border-[#54d5c9] hover:bg-[#173e40] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#54d5c9]"
            >
              <ChartNoAxesCombined size={16} aria-hidden="true" />
            </button>
          </VariableDescriptionTooltip>
          <div className="flex items-center gap-2 rounded-full border border-[#29434a] bg-[#14262b] px-3 py-1.5 text-xs text-[#bad0d2]">
            <span className={`h-2 w-2 rounded-full ${loadState === 'ready' ? 'bg-[#59e1a2]' : loadState === 'error' ? 'bg-[#fa6673]' : 'bg-[#f5b942] animate-pulse'}`} />
            {loadState === 'ready' ? (isRunning ? 'Live simulation' : 'Scene ready') : loadState === 'error' ? 'Scene unavailable' : 'Loading GLB scene'}
          </div>
        </div>
      </header>

      <div className={`grid items-stretch gap-x-[13px] gap-y-4 p-4 lg:h-[78vh] lg:min-h-[36rem] lg:max-h-[52rem] ${graphPanelVisible
        ? (controlsCollapsed ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_3.5rem]' : 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_220px]')
        : (controlsCollapsed ? 'lg:grid-cols-[minmax(0,1fr)_3.5rem]' : 'lg:grid-cols-[minmax(0,1fr)_220px]')}`}>
        <div className="relative min-h-128 min-w-0 overflow-hidden rounded-xl border border-[#253840] bg-[#0b141a] lg:min-h-0">
          <DigitalTwinCanvas
            sceneUrl={sceneUrl}
            values={sceneValues}
            animatedValuesRef={animatedValuesRef}
            modelVariables={modelVariables}
            pinnedOutputNames={pinnedOutputNames}
            interactiveInputVariables={interactiveInputVariables}
            inputEditingEnabled={inputEditingEnabled}
            onInputChange={onInputChange}
            onInputInteractionStart={onInputInteractionStart}
            onInputInteractionEnd={onInputInteractionEnd}
            onSceneInputBindingsReady={setSceneInputBindingNames}
            showOutputMarkers={outputMarkersVisible}
            showInputMarkers={inputMarkersVisible}
            onStatus={setLoadState}
            sampleIndex={displayedSampleIndex}
            sampleSequence={displayedSampleSequence}
            sampleOrdinal={displayedSampleOrdinal}
            onSampleRendered={isRunning && followLatest && onDisplayedSampleChange
              ? (index, frameTime) => onDisplayedSampleChange(index + sampleIndexOffset, frameTime)
              : undefined}
          />
          {simulationGraphs.length > 0 && !graphToggleBesidePinnedOutputs ? (
            <div className="absolute right-3 top-3 z-30">
              {graphPanelToggleButton}
            </div>
          ) : null}
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
              {hasAuthorizedSceneInputs ? (
                <VariableDescriptionTooltip
                  name="Input markers"
                  description="Input markers can be dragged during an interactive run."
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
              <div className="pointer-events-none flex w-full shrink-0 items-center gap-2">
                {graphToggleBesidePinnedOutputs ? (
                  <div className="pointer-events-auto shrink-0">
                    {graphPanelToggleButton}
                  </div>
                ) : null}
                <div className={`pointer-events-auto flex h-8 min-w-0 shrink-0 items-center justify-between rounded-lg border border-[#355158] bg-[#071014]/70 px-2.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9ab8bd] shadow-lg backdrop-blur ${graphToggleBesidePinnedOutputs ? 'flex-1' : 'ml-auto w-[85%]'}`}>
                  <span>Outputs</span>
                  <span className="font-mono text-[#67d7cf]">{pinnedStats.length} pinned</span>
                </div>
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
              ? 'Drag bound inputs to move or rotate them · drag elsewhere to orbit · scroll to zoom'
              : 'Drag to orbit · scroll to zoom'}
          </div>
          {loadState === 'error' && (
            <div className="absolute inset-0 grid place-items-center bg-[#0b141a]/90 p-6 text-center text-sm text-[#f5b4ba]">
            The GLB scene could not be loaded. Check its AAS File URL and the provider Gateway response.
            </div>
          )}
        </div>

        {graphPanelVisible ? (
          <SimulationGraphPanel
            graphs={simulationGraphs}
            page={currentGraphPage}
            results={activeResults}
            modelVariables={modelVariables}
            inputValues={inputValues}
            timeUnit={timeUnit}
            onEditGraph={editSimulationGraph}
            onDeleteGraph={deleteSimulationGraph}
          />
        ) : null}

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
                {formatTime(times[0], timeUnit)}
              </span>
              <input
                aria-label="Digital twin simulation timeline"
                aria-orientation="vertical"
                aria-valuetext={formatTime(times[displayedSampleIndex], timeUnit)}
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
                {formatTime(times[lastIndex], timeUnit)}
              </span>
              {!(isRunning && followLatest) ? (
                <>
                  <PlaybackRateControl
                    rate={playbackRate}
                    onChange={setPlaybackRate}
                    modelDuration={modelDuration}
                    compact
                  />
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
                </>
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
              <div className="rounded-xl border border-[#26383f] bg-[#142128] p-3">
                <div className="flex items-center justify-between text-xs text-[#a9bec2]">
                  <span>Execution timeline</span>
                  <span className="font-mono text-white">{formatTime(times[displayedSampleIndex], timeUnit)}</span>
                </div>
                <input
                  aria-label="Digital twin simulation timeline"
                  aria-valuetext={formatTime(times[displayedSampleIndex], timeUnit)}
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
                {eventMarkers.length > 0 && lastIndex > 0 ? (
                  <div className="relative mt-1 h-3" role="group" aria-label="FMI event samples on timeline">
                    <span className="absolute left-0 top-1.5 h-px w-full bg-[#26383f]" aria-hidden="true" />
                    {eventMarkers.map((marker) => (
                      <button
                        key={`${marker.index}:${marker.label}`}
                        type="button"
                        aria-label={`${marker.label} at ${formatTime(marker.time, timeUnit)}`}
                        title={`${marker.label} at ${formatTime(marker.time, timeUnit)}`}
                        disabled={isRunning}
                        onClick={() => {
                          setPlaying(false)
                          setSampleIndex(marker.index)
                          autoPlaybackRef.current = false
                        }}
                        style={{ left: `${(marker.index / lastIndex) * 100}%` }}
                        className="absolute top-0.5 z-10 size-2 -translate-x-1/2 rounded-full border border-[#071014] bg-[#ffc96b] shadow-[0_0_7px_rgba(255,201,107,0.65)] disabled:cursor-not-allowed"
                      />
                    ))}
                  </div>
                ) : null}
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-[#829ba1]">
                  <span>{formatTime(times[0], timeUnit)}</span>
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
                  <span>{formatTime(times[lastIndex], timeUnit)}</span>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
      <SimulationGraphConfigurationDialog
        isOpen={graphConfigurationOpen}
        onClose={() => setGraphConfigurationOpen(false)}
        graphs={simulationGraphs}
        selectedGraphId={selectedGraphConfigurationId}
        modelVariables={modelVariables}
        modelStructure={modelStructure}
        timeUnit={timeUnit}
        onSelectGraph={setSelectedGraphConfigurationId}
        onAddGraph={addSimulationGraph}
        onSaveGraph={saveSimulationGraph}
        onDeleteGraph={deleteSimulationGraph}
      />
    </section>
  )
}

DigitalTwinViewer.propTypes = {
  sceneUrl: PropTypes.string.isRequired,
  title: PropTypes.string,
  results: PropTypes.shape({
    time: PropTypes.array,
    outputs: PropTypes.object,
    inputs: PropTypes.object,
    sampleMetadata: PropTypes.arrayOf(PropTypes.object),
    discontinuities: PropTypes.arrayOf(PropTypes.bool),
  }),
  streamingResultsRef: PropTypes.shape({ current: PropTypes.object }),
  modelVariables: PropTypes.arrayOf(PropTypes.object),
  modelStructure: PropTypes.object,
  inputValues: PropTypes.object,
  interactiveInputVariables: PropTypes.arrayOf(PropTypes.object),
  inputEditingEnabled: PropTypes.bool,
  onInputChange: PropTypes.func,
  onInputInteractionStart: PropTypes.func,
  onInputInteractionEnd: PropTypes.func,
  isRunning: PropTypes.bool,
  startTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  stopTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  followLatest: PropTypes.bool,
  onDisplayedSampleChange: PropTypes.func,
  timeUnit: PropTypes.string,
}

DigitalTwinViewer.defaultProps = {
  title: 'Digital Twin',
  results: null,
  streamingResultsRef: null,
  modelVariables: [],
  inputValues: {},
  interactiveInputVariables: [],
  inputEditingEnabled: false,
  isRunning: false,
  followLatest: false,
  startTime: 0,
}
