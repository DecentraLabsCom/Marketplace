'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'

const DigitalTwinAppViewer = dynamic(() => import('@/components/simulation/DigitalTwinAppViewer'), { ssr: false })
const EMPTY_RESULTS = { time: [], outputs: {} }

function consumeLine(line) {
  if (!line.trim()) return null
  return JSON.parse(line)
}

export default function DcMotorPreviewPage() {
  const [model, setModel] = useState(null)
  const [results, setResults] = useState(EMPTY_RESULTS)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [simulationState, setSimulationState] = useState('idle')

  useEffect(() => {
    let active = true
    fetch('/api/dev/dc-motor/model', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'The motor model could not be loaded.')
        if (active) setModel(data)
      })
      .catch((loadError) => active && setError(loadError.message))
    return () => { active = false }
  }, [])

  const appendSamples = useCallback((events) => {
    if (!events.length) return
    const outputVariables = (model?.modelVariables || []).filter((variable) => variable.causality === 'output')
    setResults((current) => {
      const outputs = { ...current.outputs }
      for (const variable of outputVariables) {
        outputs[variable.name] = [...(outputs[variable.name] || []), ...events.map((event) => event.outputs?.[variable.name] ?? null)]
      }
      return { time: [...current.time, ...events.map((event) => Number(event.time))], outputs }
    })
  }, [model])

  const runSimulation = useCallback(async (parameters) => {
    setRunning(true)
    setSimulationState('running')
    setError('')
    setResults(EMPTY_RESULTS)
    try {
      const response = await fetch('/api/dev/dc-motor/simulations/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters }),
      })
      if (!response.ok || !response.body) {
        const details = await response.json().catch(() => ({}))
        throw new Error(details.error || `The motor did not start (HTTP ${response.status}).`)
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const pending = []
      let buffer = ''
      let complete = false
      const flush = () => appendSamples(pending.splice(0))
      const consume = (line) => {
        const event = consumeLine(line)
        if (!event) return
        if (event.type === 'sim.step') {
          pending.push(event)
          if (pending.length >= 32) flush()
        } else if (event.type === 'sim.done') complete = true
        else if (event.type === 'error') throw new Error(event.message || event.code || 'The motor simulation failed.')
      }
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) consume(line)
      }
      if (buffer.trim()) consume(buffer)
      flush()
      if (!complete) throw new Error('The motor simulation ended before the final sample arrived.')
      setSimulationState('completed')
    } catch (simulationError) {
      setError(simulationError.message)
      setSimulationState('error')
    } finally {
      setRunning(false)
    }
  }, [appendSamples])

  const modelVariables = useMemo(() => model?.modelVariables || [], [model])
  if (!model) {
    return (
      <main className="grid h-screen w-screen place-items-center bg-[#071117] px-6 text-center text-sm text-[#c4d9dd]">
        <p role={error ? 'alert' : 'status'}>{error || 'Loading the DC motor model…'}</p>
      </main>
    )
  }
  return (
    <main className="h-screen w-screen overflow-hidden bg-[#071117]">
      {error ? <div role="alert" className="absolute left-1/2 top-3 z-20 max-w-2xl -translate-x-1/2 rounded-lg border border-rose-700 bg-rose-950/95 px-4 py-3 text-sm text-rose-100 shadow-xl">{error}</div> : null}
      <DigitalTwinAppViewer
        appUrl="/api/dev/dc-motor/app/index.html"
        title="DC motor laboratory"
        results={results}
        modelVariables={modelVariables}
        isRunning={running}
        simulationState={simulationState}
        onRunSimulation={runSimulation}
        fullScreen
      />
    </main>
  )
}
