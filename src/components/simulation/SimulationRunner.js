"use client";
import React, { useState, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import { getFmuMetadata } from '@/utils/resourceType'
import ParameterForm from './ParameterForm'
import SimulationOptions from './SimulationOptions'
import SimulationProgress from './SimulationProgress'
import ResultsChart from './ResultsChart'
import ResultsTable from './ResultsTable'
import DownloadButtons from './DownloadButtons'
import SimulationHistory from './SimulationHistory'
import devLog from '@/utils/dev/logger'
import { authenticateLabAccess, authenticateLabAccessSSO } from '@/utils/auth/labAuth'
import { useGetIsSSO } from '@/utils/hooks/authMode'
import { useAccount, useSignMessage, useSignTypedData } from 'wagmi'

const SIM_STATE = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error',
}

async function readNdjsonStream(response, onEvent) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line))
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer))
}

function resolveAuthEndpoint(accessUri) {
  const trimmed = String(accessUri || '').replace(/\/+$/, '')
  if (!trimmed) return ''
  if (trimmed.endsWith('/auth')) return trimmed
  return `${trimmed}/auth`
}

export default function SimulationRunner({ lab, reservationKey }) {
  const fmuMeta = getFmuMetadata(lab)
  const inputVars = (fmuMeta?.modelVariables || []).filter(v => v.causality === 'input')
  const isSSO = useGetIsSSO()
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { signTypedDataAsync } = useSignTypedData()

  const [parameters, setParameters] = useState(() => {
    const params = {}
    inputVars.forEach(v => { params[v.name] = v.start ?? '' })
    return params
  })
  const [options, setOptions] = useState({
    startTime: fmuMeta?.defaultStartTime ?? 0,
    stopTime: fmuMeta?.defaultStopTime ?? 10,
    stepSize: fmuMeta?.defaultStepSize ?? 0.01,
  })
  const [simState, setSimState] = useState(SIM_STATE.IDLE)
  const [results, setResults] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [progress, setProgress] = useState({ elapsedSeconds: 0, chunkIndex: null, totalChunks: null })
  const [gatewayToken, setGatewayToken] = useState(null)
  const [proxyDownloadState, setProxyDownloadState] = useState('idle')
  const [proxyDownloadMessage, setProxyDownloadMessage] = useState(null)
  const [proxyNeedsRegeneration, setProxyNeedsRegeneration] = useState(false)

  const authPromiseRef = useRef(null)

  const isModelExchange = fmuMeta?.simulationType === 'ModelExchange'
  const [solver, setSolver] = useState('Euler')

  const handleParamChange = useCallback((name, value) => {
    setParameters(prev => ({ ...prev, [name]: value }))
  }, [])

  const handleOptionChange = useCallback((name, value) => {
    setOptions(prev => ({ ...prev, [name]: value }))
  }, [])

  const ensureGatewayToken = useCallback(async () => {
    if (gatewayToken) return gatewayToken
    if (authPromiseRef.current) return authPromiseRef.current

    const gatewayUrl = lab.accessURI || ''
    const authEndpoint = resolveAuthEndpoint(gatewayUrl)
    const labId = String(lab.id ?? lab.tokenId ?? '')

    if (!authEndpoint || !labId) {
      throw new Error('Missing gateway auth endpoint or labId')
    }

    const authPromise = (async () => {
      let authData
      if (isSSO) {
        authData = await authenticateLabAccessSSO({
          labId,
          reservationKey,
          authEndpoint,
        })
      } else {
        if (!address) {
          throw new Error('Wallet not connected')
        }
        if (!signMessageAsync || !signTypedDataAsync) {
          throw new Error('Wallet signing functions are not available')
        }
        authData = await authenticateLabAccess(
          authEndpoint,
          address,
          labId,
          signMessageAsync,
          reservationKey,
          { signTypedDataAsync },
        )
      }

      const token = authData?.token
      if (!token) {
        throw new Error('Gateway authentication did not return a token')
      }

      setGatewayToken(token)
      return token
    })()

    authPromiseRef.current = authPromise
    try {
      return await authPromise
    } finally {
      authPromiseRef.current = null
    }
  }, [address, gatewayToken, isSSO, lab.accessURI, lab.id, lab.tokenId, reservationKey, signMessageAsync, signTypedDataAsync])

  const handleRun = useCallback(async () => {
    setSimState(SIM_STATE.RUNNING)
    setErrorMsg(null)
    setResults(null)
    setProgress({ elapsedSeconds: 0, chunkIndex: null, totalChunks: null })

    try {
      const gatewayUrl = lab.accessURI || ''
      if (!gatewayUrl) throw new Error('Lab gateway URL not available')

      const token = await ensureGatewayToken()

      const reqOptions = { ...options }
      if (isModelExchange) {
        reqOptions.fmiType = 'ModelExchange'
        reqOptions.solver = solver
      }

      const body = {
        labId: lab.id ?? lab.tokenId,
        reservationKey,
        gatewayUrl,
        parameters,
        options: reqOptions,
      }

      const res = await fetch('/api/simulations/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Simulation failed (${res.status})`)
      }

      const accTime = []
      const accOutputs = {}
      let finalMeta = {}

      await readNdjsonStream(res, (event) => {
        switch (event.type) {
          case 'started':
            devLog.log('Simulation started:', event.simId)
            break
          case 'progress':
            setProgress(prev => ({ ...prev, elapsedSeconds: event.elapsedSeconds }))
            break
          case 'data':
            if (event.time) accTime.push(...event.time)
            if (event.outputs) {
              for (const [k, v] of Object.entries(event.outputs)) {
                if (!accOutputs[k]) accOutputs[k] = []
                accOutputs[k].push(...v)
              }
            }
            setProgress(prev => ({ ...prev, chunkIndex: event.chunkIndex, totalChunks: event.totalChunks }))
            setResults({ time: [...accTime], outputs: { ...accOutputs } })
            break
          case 'completed':
            finalMeta = event
            break
          case 'error':
            throw new Error(event.detail || 'Simulation error')
          default:
            break
        }
      })

      setResults({
        time: accTime,
        outputs: accOutputs,
        outputVariables: finalMeta.outputVariables || Object.keys(accOutputs),
        simulationTime: finalMeta.simulationTime,
        fmiType: finalMeta.fmiType,
      })
      setSimState(SIM_STATE.COMPLETED)
      devLog.log('Simulation completed', { outputKeys: Object.keys(accOutputs), fmiType: finalMeta.fmiType })
    } catch (err) {
      devLog.error('Simulation error:', err)
      setErrorMsg(err.message)
      setSimState(SIM_STATE.ERROR)
    }
  }, [ensureGatewayToken, isModelExchange, lab, options, parameters, reservationKey, solver])

  const handleLoadResult = useCallback(async (simId) => {
    const gatewayUrl = lab.accessURI || ''
    const labId = String(lab.id ?? lab.tokenId ?? '')
    if (!gatewayUrl || !labId) return
    try {
      const token = await ensureGatewayToken()
      const qs = new URLSearchParams({ simId, labId, gatewayUrl })
      const res = await fetch(`/api/simulations/result?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Failed to load result (${res.status})`)
      const data = await res.json()
      if (data.result) {
        setResults(data.result)
      } else {
        setResults(data)
      }
      setSimState(SIM_STATE.COMPLETED)
    } catch (err) {
      devLog.error('Failed to load historical result:', err)
    }
  }, [ensureGatewayToken, lab])

  const resolveProxyError = useCallback((status, payload) => {
    const detailsRaw = payload?.details
    let gatewayDetail = null
    if (typeof detailsRaw === 'string') {
      try {
        gatewayDetail = JSON.parse(detailsRaw)
      } catch {
        gatewayDetail = { error: detailsRaw }
      }
    } else if (typeof detailsRaw === 'object' && detailsRaw !== null) {
      gatewayDetail = detailsRaw
    }

    const gatewayCode = String(gatewayDetail?.code || '').toUpperCase()
    if (gatewayCode === 'SESSION_TICKET_EXPIRED' || gatewayCode === 'SESSION_TICKET_ALREADY_USED') {
      setProxyNeedsRegeneration(true)
      return 'Proxy ticket expired or already used. Click "Regenerate Proxy FMU".'
    }
    if (status === 401) {
      setProxyNeedsRegeneration(true)
      return 'Authorization failed. Re-authenticate and regenerate the proxy FMU.'
    }
    return payload?.error || gatewayDetail?.error || `Proxy download failed (${status})`
  }, [])

  const triggerProxyDownload = useCallback(async () => {
    if (!reservationKey) return
    setProxyDownloadState('running')
    setProxyDownloadMessage(null)

    try {
      const token = await ensureGatewayToken()
      const qs = new URLSearchParams({
        labId: String(lab.id ?? lab.tokenId ?? ''),
        reservationKey: String(reservationKey),
        gatewayUrl: String(lab.accessURI || ''),
      })
      const response = await fetch(`/api/simulations/proxy?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        let payload = {}
        try {
          payload = await response.json()
        } catch {
          payload = {}
        }
        throw new Error(resolveProxyError(response.status, payload))
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition') || ''
      const filenameMatch = /filename="?([^"]+)"?/i.exec(contentDisposition)
      const filename = filenameMatch?.[1] || `fmu-proxy-lab-${lab.id ?? lab.tokenId}.fmu`

      const blobUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(blobUrl)

      setProxyNeedsRegeneration(false)
      setProxyDownloadState('success')
      setProxyDownloadMessage('Proxy FMU downloaded.')
    } catch (err) {
      devLog.error('Proxy FMU download failed:', err)
      setProxyDownloadState('error')
      setProxyDownloadMessage(err?.message || 'Unable to download proxy FMU')
    }
  }, [ensureGatewayToken, lab.accessURI, lab.id, lab.tokenId, reservationKey, resolveProxyError])

  if (!fmuMeta || !fmuMeta.fmuFileName) {
    return (
      <div className="text-center text-neutral-300 p-8">
        No FMU metadata available for this resource.
      </div>
    )
  }

  const gatewayUrl = lab.accessURI || ''

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-header-bg">
            Simulation: {lab?.name || 'Untitled FMU'}
          </h2>
          {fmuMeta.fmuFileName && (
            <p className="text-sm text-text-secondary mt-1">
              {fmuMeta.fmuFileName} &middot; FMI {fmuMeta.fmiVersion || '?'} &middot; {fmuMeta.simulationType || '?'}
            </p>
          )}
          <p className="text-xs text-text-secondary mt-1">
            Compatible with FMI 2.0.3 Co-Simulation
          </p>
        </div>
        <button onClick={() => setShowHistory(h => !h)} className="text-xs text-brand hover:underline">
          {showHistory ? 'Hide History' : 'Show History'}
        </button>
      </div>

      {reservationKey && (
        <div className="rounded border border-[#2a2f33] bg-[#1f2426] p-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={triggerProxyDownload}
              disabled={proxyDownloadState === 'running'}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                proxyDownloadState === 'running'
                  ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                  : 'bg-brand hover:bg-hover-dark text-white'
              }`}
            >
              {proxyDownloadState === 'running'
                ? 'Preparing Proxy FMU...'
                : (proxyNeedsRegeneration ? 'Regenerate Proxy FMU' : 'Download Proxy FMU')}
            </button>
            <span className="text-xs text-text-secondary">
              For reserved FMU sessions only. The real model is never downloaded.
            </span>
          </div>
          {proxyDownloadMessage && (
            <p className={`text-sm mt-2 ${proxyDownloadState === 'error' ? 'text-error-text' : 'text-green-500'}`}>
              {proxyDownloadMessage}
            </p>
          )}
        </div>
      )}

      {showHistory && (
        <SimulationHistory
          labId={String(lab.id ?? lab.tokenId ?? '')}
          gatewayUrl={gatewayUrl}
          gatewayToken={gatewayToken}
          onEnsureAuthToken={ensureGatewayToken}
          onLoadResult={handleLoadResult}
        />
      )}

      {inputVars.length > 0 && (
        <ParameterForm variables={inputVars} values={parameters} onChange={handleParamChange} disabled={simState === SIM_STATE.RUNNING} />
      )}

      <SimulationOptions options={options} onChange={handleOptionChange} disabled={simState === SIM_STATE.RUNNING} />

      {isModelExchange && (
        <div className="flex items-center gap-3">
          <label htmlFor="solver-select" className="text-xs text-text-secondary">ODE Solver:</label>
          <select
            id="solver-select"
            value={solver}
            onChange={(e) => setSolver(e.target.value)}
            disabled={simState === SIM_STATE.RUNNING}
            className="bg-[#1f2426] border border-[#2a2f33] rounded px-2 py-1 text-neutral-200 text-sm focus:outline-none focus:border-brand disabled:opacity-50"
          >
            <option value="Euler">Euler (fast, less accurate)</option>
            <option value="CVode">CVode (adaptive, more accurate)</option>
          </select>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          onClick={handleRun}
          disabled={simState === SIM_STATE.RUNNING}
          className={`px-6 py-2 rounded font-medium transition-colors ${
            simState === SIM_STATE.RUNNING ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-brand hover:bg-hover-dark text-white'
          }`}
        >
          {simState === SIM_STATE.RUNNING ? 'Running...' : simState === SIM_STATE.COMPLETED ? 'Re-run Simulation' : 'Run Simulation'}
        </button>
      </div>

      {simState === SIM_STATE.RUNNING && (
        <SimulationProgress elapsedSeconds={progress.elapsedSeconds} chunkIndex={progress.chunkIndex} totalChunks={progress.totalChunks} />
      )}

      {simState === SIM_STATE.ERROR && errorMsg && (
        <div className="bg-error-bg border border-error-border rounded-lg p-4">
          <p className="text-error-text text-sm font-medium">Simulation Error</p>
          <p className="text-error-text text-sm mt-1">{errorMsg}</p>
        </div>
      )}

      {(simState === SIM_STATE.COMPLETED || (simState === SIM_STATE.RUNNING && results)) && results && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-header-bg">
            Results
            {results.fmiType && <span className="ml-2 text-xs font-normal text-text-secondary">({results.fmiType})</span>}
          </h3>
          {results.outputs && Object.keys(results.outputs).length > 0 && (
            <ResultsChart outputs={results.outputs} time={results.time} />
          )}
          {simState === SIM_STATE.COMPLETED && results.outputs && (
            <ResultsTable outputs={results.outputs} time={results.time} />
          )}
          {simState === SIM_STATE.COMPLETED && (
            <DownloadButtons results={results} labName={lab?.name} />
          )}
        </div>
      )}
    </div>
  )
}

SimulationRunner.propTypes = {
  lab: PropTypes.object.isRequired,
  reservationKey: PropTypes.string,
}
