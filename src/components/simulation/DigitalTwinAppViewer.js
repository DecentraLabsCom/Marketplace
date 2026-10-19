'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'

function currentValue(series, index) {
  if (!Array.isArray(series) || series.length === 0) return undefined
  return series[Math.min(Math.max(index, 0), series.length - 1)]
}

function formatValue(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'
  return String(value).slice(0, 64)
}

function formatTime(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} s` : '—'
}

export default function DigitalTwinAppViewer({ appUrl, title, results, modelVariables, isRunning }) {
  const iframeRef = useRef(null)
  const [appReady, setAppReady] = useState(false)
  const [sampleIndex, setSampleIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const times = Array.isArray(results?.time) ? results.time : []
  const lastIndex = Math.max(times.length - 1, 0)
  const displayedSampleIndex = isRunning ? lastIndex : Math.min(sampleIndex, lastIndex)

  useEffect(() => {
    setAppReady(false)
    setSampleIndex(0)
    setPlaying(false)
  }, [appUrl])

  useEffect(() => {
    if (isRunning) setPlaying(false)
  }, [isRunning])

  useEffect(() => {
    if (isRunning) return
    setSampleIndex((current) => current === lastIndex ? current : lastIndex)
  }, [isRunning, lastIndex, times.length])

  useEffect(() => {
    if (playing && !isRunning && lastIndex > 0 && sampleIndex >= lastIndex) setPlaying(false)
  }, [playing, isRunning, lastIndex, sampleIndex])

  useEffect(() => {
    if (!playing || isRunning || lastIndex < 1) return undefined
    const timer = window.setInterval(() => {
      setSampleIndex((current) => {
        return current >= lastIndex ? lastIndex : current + 1
      })
    }, 25)
    return () => window.clearInterval(timer)
  }, [playing, isRunning, lastIndex])

  const sample = useMemo(() => {
    const allowedOutputs = new Set(modelVariables
      .filter((variable) => variable?.causality === 'output' && typeof variable.name === 'string')
      .map((variable) => variable.name))
    const outputs = {}
    for (const [name, series] of Object.entries(results?.outputs || {})) {
      if (!allowedOutputs.has(name)) continue
      const value = currentValue(series, displayedSampleIndex)
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) outputs[name] = value
    }
    const timeValue = Number(times[displayedSampleIndex])
    return {
      type: 'decentralabs:fmi-sample',
      version: 1,
      time: Number.isFinite(timeValue) ? timeValue : null,
      outputs,
    }
  }, [results?.outputs, modelVariables, displayedSampleIndex, times])

  useEffect(() => {
    if (!appReady) return
    iframeRef.current?.contentWindow?.postMessage(sample, '*')
  }, [appReady, sample])

  const togglePlayback = useCallback(() => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (lastIndex < 1 || isRunning) return
    if (sampleIndex >= lastIndex) setSampleIndex(0)
    setPlaying(true)
  }, [playing, lastIndex, isRunning, sampleIndex])

  const stats = modelVariables
    .filter((variable) => variable?.causality === 'output' && typeof variable.name === 'string')
    .map((variable) => ({ variable, value: sample.outputs[variable.name] }))

  return (
    <section className="overflow-hidden rounded-2xl border border-[#283a42] bg-[#101a20] shadow-xl shadow-black/20">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26363d] px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#67d7cf]">FMI / Three.js application</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#29434a] bg-[#14262b] px-3 py-1.5 text-xs text-[#bad0d2]">
          <span className={`h-2 w-2 rounded-full ${appReady ? 'bg-[#59e1a2]' : 'bg-[#f5b942] animate-pulse'}`} />
          {appReady ? (isRunning ? 'Live simulation' : 'Application ready') : 'Loading provider application'}
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative h-90 overflow-hidden rounded-xl border border-[#253840] bg-[#0b141a] sm:h-110">
          <iframe
            key={appUrl}
            ref={iframeRef}
            src={appUrl}
            title={`${title} Three.js application`}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            onLoad={() => setAppReady(true)}
            className="h-full w-full border-0"
          />
          <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg border border-white/10 bg-[#071014]/80 px-3 py-2 text-[10px] text-[#a9c0c4] backdrop-blur">
            Isolated provider app · FMI outputs only
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {stats.map(({ variable, value }) => (
              <div key={variable.name} className="rounded-xl border border-[#26383f] bg-[#142128] px-3 py-3">
                <p className="truncate text-[10px] uppercase tracking-[0.13em] text-[#829ba1]" title={variable.description || variable.name}>
                  {variable.description || variable.name}
                </p>
                <p className="mt-1 break-words text-lg font-semibold tabular-nums text-white">
                  {formatValue(value)}
                  {variable.unit ? <span className="ml-1 text-xs font-normal text-[#91a7ac]">{variable.unit}</span> : null}
                </p>
              </div>
            ))}
            {stats.length === 0 && (
              <p className="rounded-xl border border-[#26383f] bg-[#142128] px-3 py-3 text-xs text-[#829ba1]">
                This FMU does not declare output variables for the application panel.
              </p>
            )}
          </div>

          <div className="mt-auto rounded-xl border border-[#26383f] bg-[#142128] p-3">
            <div className="flex items-center justify-between text-xs text-[#a9bec2]">
              <span>Simulation timeline</span>
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
              }}
              disabled={times.length < 2 || isRunning}
              className="mt-3 w-full accent-[#54d5c9] disabled:opacity-40"
            />
            <div className="mt-2 flex items-center justify-between text-[10px] text-[#829ba1]">
              <span>{formatTime(times[0])}</span>
              <span>{formatTime(times[lastIndex])}</span>
            </div>
            <button
              type="button"
              onClick={togglePlayback}
              disabled={times.length < 2 || isRunning}
              className="mt-3 w-full rounded-lg border border-[#35736f] bg-[#173e40] px-3 py-2 text-xs font-semibold text-[#b8fff1] transition hover:bg-[#205856] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {playing ? 'Pause replay' : 'Replay simulation'}
            </button>
          </div>
        </aside>
      </div>
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
