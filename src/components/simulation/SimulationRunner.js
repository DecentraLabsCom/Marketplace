"use client";
import React, { useState, useCallback, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import PropTypes from 'prop-types'
import { getFmuMetadata, formatFmuSimulationType } from '@/utils/resourceType'
import ParameterForm from './ParameterForm'
import DigitalTwinSimulationForm from './DigitalTwinSimulationForm'
import InputScheduleEditor from './InputScheduleEditor'
import SimulationOptions from './SimulationOptions'
import SimulationProgress from './SimulationProgress'
import ResultsChart from './ResultsChart'
import ResultsTable from './ResultsTable'
import DownloadButtons from './DownloadButtons'
import SimulationHistory from './SimulationHistory'
import devLog from '@/utils/dev/logger'
import { authenticateLabAccessSSO } from '@/utils/auth/labAuth'
import { useGetIsSSO } from '@/utils/hooks/authMode'
import { resolveGatewayFeatureError } from './gatewayErrors'
import { establishFmuGatewaySession } from '@/utils/auth/fmuAccess'
import { normalizeInputSchedule, normalizeSimulationParameters } from './simulationParameters'
import { getInitialSimulationOptions, getSimulationOptionsError, normalizeSimulationTimeOptions } from './simulationTime'
import { safeExternalHttpsUrl } from '@/utils/security/safeUrl'
import { createProtocolId } from './digitalTwinAppProtocol'

const DigitalTwinViewer = dynamic(() => import('./DigitalTwinViewer'), { ssr: false })
const DigitalTwinAppViewer = dynamic(() => import('./DigitalTwinAppViewer'), { ssr: false })

const SIM_STATE = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
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

function resolveGatewayOrigin(accessUri) {
  try {
    return new URL(String(accessUri || '')).origin
  } catch {
    return ''
  }
}

function isAllowedGatewayOrigin(gateway) {
  if (gateway.protocol === 'https:') return true
  if (gateway.protocol !== 'http:') return false

  const hostname = gateway.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1') return true
  if (!/^127(?:\.\d{1,3}){3}$/.test(hostname)) return false
  return hostname.split('.').slice(1).every((part) => Number(part) <= 255)
}

function resolveSceneAssetUrl(value, gatewayOrigin, labId) {
  if (typeof value !== 'string' || value.length > 2048) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes('\\')) return null
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    try {
      const gateway = new URL(gatewayOrigin)
      const rawPath = trimmed.split(/[?#]/, 1)[0]
      if (!isAllowedGatewayOrigin(gateway) || gateway.username || gateway.password || rawPath.includes('%')) return null
      const parsed = new URL(trimmed, gateway.origin)
      const match = parsed.pathname.match(/^\/digital-twin-scenes\/(\d{1,78})\/([a-f0-9]{64})\.glb$/i)
      if (
        parsed.origin !== gateway.origin
        || parsed.search
        || parsed.hash
        || match?.[1] !== String(labId)
      ) return null
      return `/api/aas/digital-twin-scene/${match[1]}/${match[2].toLowerCase()}.glb`
    } catch {
      return null
    }
  }
  return safeExternalHttpsUrl(trimmed)
}

function resolveDigitalTwinAsset(asset, gatewayOrigin, labId) {
  if (asset?.contentType === 'model/gltf-binary') {
    const url = resolveSceneAssetUrl(asset.url, gatewayOrigin, labId)
    return url ? { type: 'glb', url } : null
  }
  if (asset?.contentType !== 'text/html' || !/^\d{1,78}$/.test(String(labId || ''))) return null

  try {
    const gateway = new URL(gatewayOrigin)
    const rawUrl = String(asset.url || '').trim()
    if (!rawUrl || rawUrl.length > 2048 || rawUrl.includes('\\')) return null
    const parsed = new URL(rawUrl, gateway.origin)
    const match = parsed.pathname.match(/^\/digital-twin-apps\/(\d{1,78})\/([a-f0-9]{64})\/index\.html$/i)
    if (
      !isAllowedGatewayOrigin(gateway)
      || gateway.username
      || gateway.password
      || parsed.origin !== gateway.origin
      || parsed.search
      || parsed.hash
      || match?.[1] !== String(labId)
    ) return null
    return {
      type: 'threejs-app',
      url: `/api/aas/digital-twin-app/${match[1]}/${match[2].toLowerCase()}/index.html`,
    }
  } catch {
    return null
  }
}

function resolveDigitalTwinSimulationOptions(baseOptions, requestedOptions, simulationType) {
  if (!requestedOptions || typeof requestedOptions !== 'object' || Array.isArray(requestedOptions)) {
    throw new Error('The digital twin requested invalid simulation options.')
  }

  const includeStepSize = simulationType !== 'ScheduledExecution'
  const allowedOptionNames = new Set(['startTime', 'stopTime', ...(includeStepSize ? ['stepSize'] : [])])
  if (Object.keys(requestedOptions).some((name) => !allowedOptionNames.has(name))) {
    throw new Error('The digital twin requested an unsupported simulation option.')
  }

  const resolved = { ...baseOptions, ...requestedOptions }
  return {
    ...resolved,
    ...normalizeSimulationTimeOptions(resolved, { includeStepSize }),
  }
}

export default function SimulationRunner({ lab, reservationKey }) {
  const fmuMeta = getFmuMetadata(lab)
  const modelVariables = fmuMeta?.modelVariables || []
  const inputVars = modelVariables.filter(v => v.causality === 'input')
  const isSSO = useGetIsSSO()

  const [parameters, setParameters] = useState(() => {
    const params = {}
    inputVars.forEach(v => { params[v.name] = v.start ?? '' })
    return params
  })
  const [inputEvents, setInputEvents] = useState([])
  const [options, setOptions] = useState(() => getInitialSimulationOptions(fmuMeta))
  const [simState, setSimState] = useState(SIM_STATE.IDLE)
  const [activeRunId, setActiveRunId] = useState(null)
  const [results, setResults] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [progress, setProgress] = useState({ elapsedSeconds: 0, chunkIndex: null, totalChunks: null })
  const [gatewaySessionOrigin, setGatewaySessionOrigin] = useState(null)
  const [proxyDownloadState, setProxyDownloadState] = useState('idle')
  const [proxyDownloadMessage, setProxyDownloadMessage] = useState(null)
  const [twinAsset, setTwinAsset] = useState(null)
  const [twinAssetState, setTwinAssetState] = useState('loading')

  const authPromiseRef = useRef(null)
  const proxyAttemptRef = useRef(null)
  const simulationInFlightRef = useRef(false)
  const simulationControllerRef = useRef(null)
  const activeRunIdRef = useRef(null)

  useEffect(() => () => {
    simulationControllerRef.current?.abort()
  }, [])

  const isModelExchange = fmuMeta?.simulationType === 'ModelExchange'
  const isScheduledExecution = fmuMeta?.simulationType === 'ScheduledExecution'
  const supportsInputSchedule = !isModelExchange && !isScheduledExecution
  const simulationTypeLabel = formatFmuSimulationType(fmuMeta?.simulationType)
  const [solver, setSolver] = useState('Euler')
  let inputScheduleError = ''
  const simulationOptionsError = getSimulationOptionsError(options, { includeStepSize: !isScheduledExecution })
  if (supportsInputSchedule && inputEvents.length > 0 && !simulationOptionsError) {
    try {
      normalizeInputSchedule(inputEvents, inputVars, modelVariables, options.startTime, options.stopTime, options.stepSize)
    } catch (error) {
      inputScheduleError = error.message
    }
  }
  const labId = String(lab.id ?? lab.tokenId ?? '')

  useEffect(() => {
    if (!labId) {
      setTwinAsset(null)
      setTwinAssetState('ready')
      return undefined
    }

    const controller = new AbortController()
    setTwinAsset(null)
    setTwinAssetState('loading')
    fetch(`/api/aas/shell?${new URLSearchParams({ labId })}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null
        return response.json()
      })
      .then((data) => {
        if (controller.signal.aborted) return
        const visualAssets = Array.isArray(data?.visualAssets) ? data.visualAssets : []
        // A provider Three.js app is a complete experience and takes precedence
        // over a GLB when both are linked to the same AAS.
        const visualAsset = [
          ...visualAssets.filter((asset) => asset?.contentType === 'text/html'),
          ...visualAssets.filter((asset) => asset?.contentType === 'model/gltf-binary'),
        ]
          .map((asset) => resolveDigitalTwinAsset(asset, resolveGatewayOrigin(lab.accessURI), labId))
          .find(Boolean) || null
        setTwinAsset(visualAsset)
        setTwinAssetState('ready')
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          devLog.warn('Digital twin visual asset discovery failed:', error?.message)
          setTwinAsset(null)
          setTwinAssetState('ready')
        }
      })

    return () => controller.abort()
  }, [labId, lab.accessURI])

  const proxyAttemptKey = reservationKey && fmuMeta?.fmuFileName
    ? `${labId}:${String(reservationKey).toLowerCase()}`
    : ''

  const handleParamChange = useCallback((name, value) => {
    setParameters(prev => ({ ...prev, [name]: value }))
  }, [])

  const handleOptionChange = useCallback((name, value) => {
    setOptions(prev => ({ ...prev, [name]: value }))
  }, [])

  const reauthenticateGatewaySession = useCallback(async () => {
    if (authPromiseRef.current) return authPromiseRef.current

    const labId = String(lab.id ?? lab.tokenId ?? '')
    if (!labId) {
      throw new Error('Missing labId')
    }

    const authPromise = (async () => {
      if (!isSSO) {
        throw new Error('Institutional login is required')
      }
      const authData = await authenticateLabAccessSSO({
        labId,
        reservationKey,
      })

      const accessCode = authData?.accessCode
      const labURL = authData?.labURL
      if (!accessCode || !labURL || authData?.resourceType !== 'fmu') {
        throw new Error('Gateway authentication did not return an FMU access code')
      }
      const canonicalReservationKey = authData?.reservationKey || reservationKey
      if (!canonicalReservationKey || (
        reservationKey && String(canonicalReservationKey).toLowerCase() !== String(reservationKey).toLowerCase()
      )) {
        throw new Error('Gateway returned a different FMU reservation context')
      }
      const gatewayOrigin = await establishFmuGatewaySession({
        accessCode,
        labId,
        reservationKey: canonicalReservationKey,
      })
      setGatewaySessionOrigin(gatewayOrigin)
      return gatewayOrigin
    })()

    authPromiseRef.current = authPromise
    try {
      return await authPromise
    } finally {
      authPromiseRef.current = null
    }
  }, [isSSO, lab.id, lab.tokenId, reservationKey])

  const ensureGatewaySession = useCallback(async () => {
    if (gatewaySessionOrigin) return gatewaySessionOrigin
    const gatewayOrigin = resolveGatewayOrigin(lab.accessURI)
    if (!gatewayOrigin) {
      throw new Error('Lab gateway URL not available')
    }
    // The FMU handoff normally established this HttpOnly session immediately
    // before navigation. Its validity can only be checked by the gateway, so
    // optimistically reuse it instead of minting another credential.
    setGatewaySessionOrigin(gatewayOrigin)
    return gatewayOrigin
  }, [gatewaySessionOrigin, lab.accessURI])

  const fetchGateway = useCallback(async (path, init = {}) => {
    await ensureGatewaySession()
    if (init.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
    let response = await fetch(path, init)
    if (response.status !== 401) return response
    if (init.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')

    setGatewaySessionOrigin(null)
    await reauthenticateGatewaySession()
    response = await fetch(path, init)
    return response
  }, [ensureGatewaySession, reauthenticateGatewaySession])

  const runSimulation = useCallback(async (requestedParameters = null, requestedOptions = null, requestedInputEvents = null, executionContext = null) => {
    if (simulationInFlightRef.current) return
    simulationInFlightRef.current = true
    const runId = executionContext?.runId || createProtocolId('run')
    activeRunIdRef.current = runId
    const controller = new AbortController()
    simulationControllerRef.current = controller
    setActiveRunId(runId)
    setSimState(SIM_STATE.RUNNING)
    setErrorMsg(null)
    setResults(null)
    setProgress({ elapsedSeconds: 0, chunkIndex: null, totalChunks: null })

    try {
      let activeParameters = parameters
      if (requestedParameters !== null) {
        if (!requestedParameters || typeof requestedParameters !== 'object' || Array.isArray(requestedParameters)) {
          throw new Error('The digital twin requested invalid simulation inputs.')
        }
        const allowedInitializationNames = new Set(modelVariables
          .filter((variable) => (
            variable?.causality === 'input'
            || (variable?.causality === 'parameter' && variable?.variability !== 'constant')
          ))
          .map((variable) => variable.name))
        if (Object.keys(requestedParameters).some((name) => !allowedInitializationNames.has(name))) {
          throw new Error('The digital twin requested an FMU input or tunable parameter that this model does not expose.')
        }
        activeParameters = { ...parameters, ...requestedParameters }
        setParameters(activeParameters)
      }

      const activeOptions = requestedOptions === null || requestedOptions === undefined
        ? options
        : resolveDigitalTwinSimulationOptions(options, requestedOptions, fmuMeta.simulationType)
      if (requestedOptions !== null && requestedOptions !== undefined) {
        setOptions(activeOptions)
      }
      const normalizedTimeOptions = normalizeSimulationTimeOptions(activeOptions, {
        includeStepSize: !isScheduledExecution,
      })
      const resolvedActiveOptions = { ...activeOptions, ...normalizedTimeOptions }

      const activeInputEvents = requestedInputEvents === null || requestedInputEvents === undefined
        ? inputEvents
        : requestedInputEvents
      const inputSchedule = supportsInputSchedule
        ? normalizeInputSchedule(
          activeInputEvents,
          inputVars,
          modelVariables,
          resolvedActiveOptions.startTime,
          resolvedActiveOptions.stopTime,
          resolvedActiveOptions.stepSize,
        )
        : []

      const gatewayUrl = lab.accessURI || ''
      if (!gatewayUrl) throw new Error('Lab gateway URL not available')

      const reqOptions = { ...resolvedActiveOptions }
      if (isScheduledExecution) delete reqOptions.stepSize
      if (isModelExchange) {
        reqOptions.fmiType = 'ModelExchange'
        reqOptions.solver = solver
      }

      const normalizedParameters = normalizeSimulationParameters(activeParameters, modelVariables)

      const body = {
        labId: String(lab.id ?? lab.tokenId ?? ''),
        reservationKey,
        parameters: normalizedParameters,
        options: reqOptions,
        ...(inputSchedule.length > 0 ? { inputSchedule } : {}),
      }

      const res = await fetchGateway('/api/simulations/stream', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
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

      if (controller.signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError')

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
      if (controller.signal.aborted || err?.name === 'AbortError') {
        setErrorMsg(null)
        setSimState(SIM_STATE.CANCELLED)
      } else {
        devLog.error('Simulation error:', err)
        setErrorMsg(err.message)
        setSimState(SIM_STATE.ERROR)
      }
    } finally {
      if (simulationControllerRef.current === controller) {
        simulationControllerRef.current = null
        simulationInFlightRef.current = false
      }
    }
  }, [fetchGateway, fmuMeta.simulationType, inputEvents, inputVars, isModelExchange, isScheduledExecution, lab, modelVariables, options, parameters, reservationKey, solver, supportsInputSchedule])

  const cancelSimulation = useCallback((runId) => {
    const controller = simulationControllerRef.current
    if (!controller || !simulationInFlightRef.current || runId !== activeRunIdRef.current) return false
    controller.abort()
    setErrorMsg(null)
    setSimState(SIM_STATE.CANCELLED)
    return true
  }, [])

  const handleRun = useCallback((scheduledEvents) => (
    Array.isArray(scheduledEvents)
      ? runSimulation(null, null, scheduledEvents)
      : runSimulation()
  ), [runSimulation])
  const handleLoadResult = useCallback(async (simId) => {
    const gatewayUrl = lab.accessURI || ''
    const labId = String(lab.id ?? lab.tokenId ?? '')
    if (!gatewayUrl || !labId) return
    try {
      const resultQuery = new URLSearchParams({
        simId: String(simId),
        labId,
        reservationKey: String(reservationKey || ''),
      })
      const res = await fetchGateway(
        `/api/simulations/result?${resultQuery.toString()}`,
        { credentials: 'include' },
      )
      if (!res.ok) {
        let payload = {}
        try {
          payload = await res.json()
        } catch {
          payload = {}
        }
        const gatewayError = resolveGatewayFeatureError(res.status, payload, {
          fallbackMessage: `Failed to load result (${res.status})`,
          unavailableMessage: 'Historical simulation results are not available yet for this FMU backend.',
        })
        throw new Error(gatewayError.message)
      }
      const data = await res.json()
      if (data.result) {
        setResults(data.result)
      } else {
        setResults(data)
      }
      setSimState(SIM_STATE.COMPLETED)
    } catch (err) {
      devLog.error('Failed to load historical result:', err)
      setResults(null)
      setErrorMsg(err?.message || 'Unable to load historical simulation result')
      setSimState(SIM_STATE.ERROR)
    }
  }, [fetchGateway, lab, reservationKey])

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
      return 'The reservation FMU could not be prepared. Re-enter the reserved laboratory to request a fresh file.'
    }
    if (status === 401) {
      return 'The reservation FMU could not be authorized. Re-enter the reserved laboratory and try again.'
    }
    return payload?.error || gatewayDetail?.error || `Proxy download failed (${status})`
  }, [])

  const triggerProxyDownload = useCallback(async () => {
    if (!reservationKey) return
    setProxyDownloadState('running')
    setProxyDownloadMessage(null)

    try {
      const qs = new URLSearchParams({
        labId: String(lab.id ?? lab.tokenId ?? ''),
        reservationKey: String(reservationKey),
      })
      const response = await fetchGateway(`/api/simulations/proxy?${qs.toString()}`, {
        credentials: 'include',
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
      anchor.hidden = true
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)

      setProxyDownloadState('success')
      setProxyDownloadMessage('Reservation FMU downloaded automatically.')
    } catch (err) {
      devLog.error('Proxy FMU download failed:', err)
      setProxyDownloadState('error')
      setProxyDownloadMessage(err?.message || 'Unable to download proxy FMU')
    }
  }, [fetchGateway, lab.id, lab.tokenId, reservationKey, resolveProxyError])

  useEffect(() => {
    if (twinAssetState !== 'ready' || twinAsset?.type === 'threejs-app' || !proxyAttemptKey || proxyAttemptRef.current === proxyAttemptKey) return
    proxyAttemptRef.current = proxyAttemptKey
    void triggerProxyDownload()
  }, [proxyAttemptKey, triggerProxyDownload, twinAsset, twinAssetState])

  if (!fmuMeta || !fmuMeta.fmuFileName) {
    return (
      <div className="text-center text-neutral-300 p-8">
        No FMU metadata available for this resource.
      </div>
    )
  }

  const gatewayUrl = lab.accessURI || ''

  if (twinAssetState === 'loading') {
    return (
      <div className="grid min-h-80 place-items-center rounded-2xl border border-[#283a42] bg-[#101a20] p-8 text-sm text-[#bad0d2]" role="status">
        Preparing the simulation view…
      </div>
    )
  }

  if (twinAsset?.type === 'threejs-app') {
    return (
      <div className="fixed inset-0 z-100 bg-[#07151b]">
        <DigitalTwinAppViewer
          appUrl={twinAsset.url}
          title={lab?.name || 'Digital Twin'}
          onConnect={async ({ signal }) => {
            const response = await fetchGateway('/api/simulations/connection', {
              method: 'POST', credentials: 'include', signal,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ labId: String(lab.id ?? lab.tokenId), reservationKey }),
            })
            if (!response.ok) throw new Error('The provider FMU connection could not be authorized.')
            return response.json()
          }}
          modelVariables={modelVariables}
          enableInputSchedule={supportsInputSchedule}
          inputValues={parameters}
          inputEvents={inputEvents}
          onInputEventsChange={setInputEvents}
          startTime={Number(options.startTime)}
          stopTime={Number(options.stopTime)}
          stepSize={Number(options.stepSize)}
          downloadError={proxyDownloadState === 'error' ? proxyDownloadMessage : null}
          fullScreen
        />
      </div>
    )
  }

  return (
    <div>
      {twinAsset?.type === 'glb' ? (
        <>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#67d7cf]">Interactive digital twin</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{lab?.name || 'Digital Twin'}</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">Run the FMU simulation to animate the linked GLB scene.</p>
            </div>
            <div className="rounded-xl border border-[#315057] bg-[#122328] px-4 py-3 text-xs text-[#b8d2d5]">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
              FMI {fmuMeta.fmiVersion || '?'} · {simulationTypeLabel || 'FMU'}
            </div>
          </div>

          {inputVars.length === 0 && (
            <p className="rounded-xl border border-[#26383f] bg-[#142128] p-3 text-xs text-[#9aafb4]">This model has no input variables. Run it with its default settings.</p>
          )}

          <DigitalTwinSimulationForm
            variables={inputVars}
            modelVariables={modelVariables}
            values={parameters}
            onInputChange={handleParamChange}
            simulationOptions={options}
            onSimulationOptionChange={handleOptionChange}
            simulationType={fmuMeta.simulationType}
            enableInputSchedule={supportsInputSchedule}
            inputEvents={inputEvents}
            onInputEventsChange={setInputEvents}
            running={simState === SIM_STATE.RUNNING}
            onRun={handleRun}
          />

          {reservationKey && proxyDownloadState !== 'idle' && (
            <p role={proxyDownloadState === 'error' ? 'alert' : 'status'} className={`mb-4 text-xs ${proxyDownloadState === 'error' ? 'text-error-text' : 'text-[#9aafb4]'}`}>
              {proxyDownloadState === 'running' ? 'Preparing the reservation FMU…' : proxyDownloadMessage}
            </p>
          )}
          {simState === SIM_STATE.RUNNING && <div className="mt-3"><SimulationProgress elapsedSeconds={progress.elapsedSeconds} chunkIndex={progress.chunkIndex} totalChunks={progress.totalChunks} /></div>}
          {simState === SIM_STATE.ERROR && errorMsg && <p role="alert" className="mt-3 rounded-lg border border-error-border bg-error-bg p-3 text-sm text-error-text">{errorMsg}</p>}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-header-bg">Simulation: {lab?.name || 'Untitled FMU'}</h2>
              <p className="mt-1 text-sm text-text-secondary">{fmuMeta.fmuFileName} &middot; FMI {fmuMeta.fmiVersion || '?'} &middot; {simulationTypeLabel || '?'}</p>
            </div>
            <button onClick={() => setShowHistory((visible) => !visible)} className="text-xs text-brand hover:underline">
              {showHistory ? 'Hide History' : 'Show History'}
            </button>
          </div>

          {reservationKey && proxyDownloadState !== 'idle' && (
            <p role={proxyDownloadState === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-3 text-xs ${proxyDownloadState === 'error' ? 'border-error-border bg-error-bg text-error-text' : 'border-[#2a2f33] bg-[#1f2426] text-text-secondary'}`}>
              {proxyDownloadState === 'running' ? 'Preparing the reservation FMU…' : proxyDownloadMessage}
            </p>
          )}

          {showHistory && (
            <SimulationHistory
              labId={String(lab.id ?? lab.tokenId ?? '')}
              reservationKey={reservationKey}
              gatewayUrl={gatewayUrl}
              gatewaySessionOrigin={gatewaySessionOrigin}
              onEnsureGatewaySession={ensureGatewaySession}
              onFetchGateway={fetchGateway}
              onLoadResult={handleLoadResult}
            />
          )}

          {inputVars.length > 0 && (
            <ParameterForm
              variables={inputVars}
              modelVariables={modelVariables}
              values={parameters}
              onChange={handleParamChange}
              disabled={simState === SIM_STATE.RUNNING}
            />
          )}

          {supportsInputSchedule && inputVars.length > 0 && (
            <InputScheduleEditor
              variables={inputVars}
              modelVariables={modelVariables}
              initialValues={parameters}
              events={inputEvents}
              startTime={Number(options.startTime)}
              stopTime={Number(options.stopTime)}
              stepSize={Number(options.stepSize)}
              validationError={inputScheduleError}
              disabled={simState === SIM_STATE.RUNNING}
              onChange={setInputEvents}
            />
          )}

          <SimulationOptions
            options={options}
            onChange={handleOptionChange}
            simulationType={fmuMeta.simulationType}
            disabled={simState === SIM_STATE.RUNNING}
          />

          {isModelExchange && (
            <div className="flex items-center gap-3">
              <label htmlFor="solver-select" className="text-xs text-text-secondary">ODE Solver:</label>
              <select
                id="solver-select"
                value={solver}
                onChange={(event) => setSolver(event.target.value)}
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
              disabled={simState === SIM_STATE.RUNNING || Boolean(inputScheduleError) || Boolean(simulationOptionsError)}
              className={`rounded px-6 py-2 font-medium transition-colors ${simState === SIM_STATE.RUNNING || inputScheduleError || simulationOptionsError ? 'cursor-not-allowed bg-gray-600 text-gray-400' : 'bg-brand text-white hover:bg-hover-dark'}`}
            >
              {simState === SIM_STATE.RUNNING ? 'Running…' : simState === SIM_STATE.COMPLETED ? 'Re-run Simulation' : 'Run Simulation'}
            </button>
          </div>

          {simState === SIM_STATE.RUNNING && <SimulationProgress elapsedSeconds={progress.elapsedSeconds} chunkIndex={progress.chunkIndex} totalChunks={progress.totalChunks} />}
          {simState === SIM_STATE.ERROR && errorMsg && (
            <div className="rounded-lg border border-error-border bg-error-bg p-4">
              <p className="text-sm font-medium text-error-text">Simulation Error</p>
              <p className="mt-1 text-sm text-error-text">{errorMsg}</p>
            </div>
          )}

          {(simState === SIM_STATE.COMPLETED || (simState === SIM_STATE.RUNNING && results)) && results && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-header-bg">
                Results
                {results.fmiType && <span className="ml-2 text-xs font-normal text-text-secondary">({results.fmiType})</span>}
              </h3>
              {results.outputs && Object.keys(results.outputs).length > 0 && (
                <ResultsChart outputs={results.outputs} time={results.time} variableMetadata={modelVariables} />
              )}
              {simState === SIM_STATE.COMPLETED && results.outputs && (
                <ResultsTable outputs={results.outputs} time={results.time} variableMetadata={modelVariables} />
              )}
              {simState === SIM_STATE.COMPLETED && (
                <DownloadButtons results={results} labName={lab?.name} variableMetadata={modelVariables} />
              )}
            </div>
          )}
        </>
      )}

      {twinAsset?.type === 'glb' && (
        <DigitalTwinViewer
          sceneUrl={twinAsset.url}
          title={lab?.name || 'Digital Twin'}
          results={results}
          modelVariables={modelVariables}
          isRunning={simState === SIM_STATE.RUNNING}
          startTime={Number(options.startTime)}
          stopTime={Number(options.stopTime)}
        />
      )}
    </div>
  )
}

SimulationRunner.propTypes = {
  lab: PropTypes.object.isRequired,
  reservationKey: PropTypes.string,
}
