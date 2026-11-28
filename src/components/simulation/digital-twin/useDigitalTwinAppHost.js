import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_SAMPLES_PER_BATCH,
  MAX_SAMPLE_BATCH_JSON_CHARS,
  DIGITAL_TWIN_MESSAGE as MESSAGE,
  isValidAppMessage,
  isValidFmuStateCheckpointBundle,
  isValidHostMessage,
  makeProtocolMessage,
  isRecord,
} from './digitalTwinAppProtocol'
import {
  normalizeSimulationStreamEvent,
  readNdjsonStream,
  selectSimulationOutputs,
} from '@decentralabs/digital-twin-app-protocol/simulation-stream'

const INITIALIZATION_TIMEOUT_MS = 30_000
const HOST_READY_RETRY_MS = 250

/** Own the iframe protocol lifecycle, handshake and connection grants. */
export default function useDigitalTwinAppHost({
  appUrl,
  reloadKey,
  hostExtensions = {},
  onAppReady,
  onExecutionState,
  onFmuStateSaved,
  onFmuStateError,
  onModelChangeRequest,
  onConnectionRequest,
  onBatchSimulation,
}) {
  const iframeRef = useRef(null)
  const callbacksRef = useRef({})
  const extensionsRef = useRef(hostExtensions)
  const capabilitiesRef = useRef([])
  const grantRef = useRef(null)
  const batchRequestsRef = useRef(new Map())
  const batchAcknowledgementsRef = useRef(new Map())
  const loadedDocumentRef = useRef(false)
  const documentGenerationRef = useRef(0)
  const hostReadyAttemptedRef = useRef(false)
  const hostReadyRetryTimerRef = useRef(null)
  const stateRef = useRef('loading')

  callbacksRef.current = {
    onAppReady,
    onExecutionState,
    onFmuStateSaved,
    onFmuStateError,
    onModelChangeRequest,
    onConnectionRequest,
    onBatchSimulation,
  }
  extensionsRef.current = hostExtensions

  const [appState, setAppState] = useState('loading')
  const [appFailureReason, setAppFailureReason] = useState('')
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [appCapabilities, setAppCapabilities] = useState([])
  const [execution, setExecution] = useState({ state: 'idle' })

  const send = useCallback((type, payload = {}) => {
    const message = makeProtocolMessage(type, payload)
    if (isValidHostMessage(message)) iframeRef.current?.contentWindow?.postMessage(message, '*')
  }, [])

  const clearHostReadyRetry = useCallback(() => {
    if (hostReadyRetryTimerRef.current === null) return
    window.clearTimeout(hostReadyRetryTimerRef.current)
    hostReadyRetryTimerRef.current = null
  }, [])

  const sendHostReady = useCallback(() => {
    hostReadyAttemptedRef.current = true
    const extensions = extensionsRef.current
    send(MESSAGE.HOST_READY, isRecord(extensions) && Object.keys(extensions).length ? { extensions } : {})
  }, [send])

  const scheduleHostReadyRetry = useCallback(() => {
    clearHostReadyRetry()
    hostReadyRetryTimerRef.current = window.setTimeout(() => {
      hostReadyRetryTimerRef.current = null
      if (stateRef.current === 'loading') sendHostReady()
    }, HOST_READY_RETRY_MS)
  }, [clearHostReadyRetry, sendHostReady])

  const replyToConnectionRequest = useCallback((target, requestId, type, payload = {}) => {
    const response = makeProtocolMessage(type, { requestId, ...payload })
    if (target === iframeRef.current?.contentWindow && isValidHostMessage(response)) {
      target.postMessage(response, '*')
    }
  }, [])

  useEffect(() => {
    stateRef.current = 'loading'
    loadedDocumentRef.current = false
    hostReadyAttemptedRef.current = false
    setAppState('loading')
    setAppFailureReason('')
    setFrameLoaded(false)
    setAppCapabilities([])
    capabilitiesRef.current = []
    setExecution({ state: 'idle' })

    const timeout = window.setTimeout(() => {
      if (stateRef.current !== 'loading') return
      clearHostReadyRetry()
      stateRef.current = 'error'
      setAppState('error')
      setAppFailureReason('The provider application did not initialize successfully. Check its bundled assets and browser console errors.')
    }, INITIALIZATION_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timeout)
      clearHostReadyRetry()
      grantRef.current?.abort()
      grantRef.current = null
      for (const controller of batchRequestsRef.current.values()) controller.abort()
      batchRequestsRef.current.clear()
    }
  }, [appUrl, clearHostReadyRetry, reloadKey])

  useEffect(() => {
    async function receive(event) {
      if (event.source !== iframeRef.current?.contentWindow || !isValidAppMessage(event.data)) return
      const message = event.data

      if (message.type === MESSAGE.APP_HELLO) {
        if (stateRef.current !== 'loading') return
        // A late hello means the app may have missed the host-ready message sent on iframe load.
        sendHostReady()
        scheduleHostReadyRetry()
      } else if (message.type === MESSAGE.APP_READY) {
        if (stateRef.current !== 'loading') return
        clearHostReadyRetry()
        stateRef.current = 'ready'
        setAppState('ready')
        const capabilities = message.capabilities || []
        capabilitiesRef.current = capabilities
        setAppCapabilities(capabilities)
        callbacksRef.current.onAppReady?.(message)
      } else if (message.type === MESSAGE.APP_ERROR) {
        clearHostReadyRetry()
        stateRef.current = 'error'
        setAppState('error')
      } else if (message.type === MESSAGE.EXECUTION_STATE && stateRef.current === 'ready') {
        setExecution({ state: message.state, runId: message.runId, options: message.options })
        callbacksRef.current.onExecutionState?.(message)
      } else if (message.type === MESSAGE.FMU_STATE_SAVED && stateRef.current === 'ready'
        && isValidFmuStateCheckpointBundle(message.bundle)) {
        callbacksRef.current.onFmuStateSaved?.(message.bundle)
      } else if (message.type === MESSAGE.FMU_STATE_ERROR && stateRef.current === 'ready') {
        callbacksRef.current.onFmuStateError?.(message)
      } else if (message.type === MESSAGE.MODEL_CHANGE && stateRef.current === 'ready') {
        callbacksRef.current.onModelChangeRequest?.(message.modelId)
      } else if (message.type === MESSAGE.CONNECTION_REQUEST && stateRef.current === 'ready') {
        const target = event.source
        const requestId = message.requestId
        const connectionRequest = callbacksRef.current.onConnectionRequest
        if (grantRef.current || typeof connectionRequest !== 'function') {
          replyToConnectionRequest(target, requestId, MESSAGE.CONNECTION_ERROR, { code: 'CONNECTION_UNAVAILABLE' })
          return
        }

        const controller = new AbortController()
        grantRef.current = controller
        try {
          const payload = await connectionRequest({
            options: message.options || {},
            capabilities: capabilitiesRef.current,
            transport: message.transport || 'websocket',
            executionPace: message.executionPace,
            signal: controller.signal,
          })
          if (!controller.signal.aborted) {
            replyToConnectionRequest(target, requestId, MESSAGE.CONNECTION_READY, payload || {})
          }
        } catch {
          if (!controller.signal.aborted) {
            replyToConnectionRequest(target, requestId, MESSAGE.CONNECTION_ERROR, { code: 'CONNECTION_AUTHORIZATION_FAILED' })
          }
        } finally {
          if (grantRef.current === controller) grantRef.current = null
        }
      } else if (message.type === MESSAGE.BATCH_EXECUTION_CANCEL && stateRef.current === 'ready') {
        batchRequestsRef.current.get(message.requestId)?.abort(new DOMException('Cancelled', 'AbortError'))
      } else if (message.type === MESSAGE.BATCH_EXECUTION_ACK && stateRef.current === 'ready') {
        const acknowledgement = batchAcknowledgementsRef.current.get(message.requestId)
        if (acknowledgement?.eventId === message.eventId) acknowledgement.resolve()
      } else if (message.type === MESSAGE.BATCH_EXECUTION_REQUEST && stateRef.current === 'ready') {
        const requestId = message.requestId
        const target = event.source
        const documentGeneration = documentGenerationRef.current
        const batchSimulation = callbacksRef.current.onBatchSimulation
        if (typeof batchSimulation !== 'function' || batchRequestsRef.current.has(requestId)) {
          send(MESSAGE.BATCH_EXECUTION_END, { requestId, code: 'BATCH_EXECUTION_UNAVAILABLE' })
          return
        }
        const controller = new AbortController()
        batchRequestsRef.current.set(requestId, controller)
        const sendBatchMessage = (type, payload = {}) => {
          if (target !== iframeRef.current?.contentWindow
            || documentGeneration !== documentGenerationRef.current
            || stateRef.current !== 'ready') return false
          const response = makeProtocolMessage(type, { requestId, ...payload })
          if (!isValidHostMessage(response)) return false
          target.postMessage(response, '*')
          return true
        }
        const selectedOutputs = message.batchOptions.outputVariables
        const maxSamples = Math.min(message.batchOptions.maxSamples, MAX_SAMPLES_PER_BATCH)
        let sampleBatch = []
        let lastSampleTime
        let lastSample
        let lastDeliveredSampleKey = null
        let nextEventId = 0
        const waitForAcknowledgement = (eventId) => new Promise((resolve, reject) => {
          let timeout
          const cleanup = () => {
            window.clearTimeout(timeout)
            controller.signal.removeEventListener('abort', onAbort)
            if (batchAcknowledgementsRef.current.get(requestId)?.eventId === eventId) {
              batchAcknowledgementsRef.current.delete(requestId)
            }
          }
          const onAbort = () => {
            cleanup()
            reject(controller.signal.reason || new DOMException('Cancelled', 'AbortError'))
          }
          timeout = window.setTimeout(() => {
            cleanup()
            reject(new Error('BATCH_ACK_TIMEOUT'))
          }, 60_000)
          batchAcknowledgementsRef.current.set(requestId, {
            eventId,
            resolve: () => { cleanup(); resolve() },
          })
          controller.signal.addEventListener('abort', onAbort, { once: true })
          if (controller.signal.aborted) onAbort()
        })
        const sendBatchEvent = async (event) => {
          const eventId = ++nextEventId
          if (!sendBatchMessage(MESSAGE.BATCH_EXECUTION_EVENT, { eventId, event })) {
            throw new Error('BATCH_IFRAME_UNAVAILABLE')
          }
          await waitForAcknowledgement(eventId)
        }
        const flushSamples = async () => {
          if (!sampleBatch.length) return
          await sendBatchEvent({ kind: 'samples', samples: sampleBatch })
          sampleBatch = []
        }
        try {
          const response = await batchSimulation({
            body: message.body,
            batchOptions: message.batchOptions,
            runId: message.runId,
            signal: controller.signal,
          })
          if (!response?.ok) throw new Error('BATCH_SIMULATION_FAILED')
          const sequence = { nextSequence: 0 }
          await readNdjsonStream(response, async (event) => {
            if (controller.signal.aborted) return
            const normalized = normalizeSimulationStreamEvent(event, sequence)
            if (normalized.kind === 'samples') {
              for (const sample of normalized.samples) {
                lastSample = sample
                const filtered = { ...sample, outputs: selectSimulationOutputs(sample.outputs, selectedOutputs) }
                const candidate = [...sampleBatch, filtered]
                const encodedSize = new TextEncoder().encode(JSON.stringify({ kind: 'samples', samples: candidate })).length
                if (sampleBatch.length && (candidate.length > maxSamples || encodedSize > MAX_SAMPLE_BATCH_JSON_CHARS)) await flushSamples()
                const singleSampleSize = new TextEncoder().encode(JSON.stringify({ kind: 'samples', samples: [filtered] })).length
                if (singleSampleSize > MAX_SAMPLE_BATCH_JSON_CHARS) throw new Error('BATCH_SAMPLE_TOO_LARGE')
                sampleBatch.push(filtered)
                lastSampleTime = filtered.time
                lastDeliveredSampleKey = `${filtered.time}:${filtered.sequence ?? ''}`
                if (sampleBatch.length >= maxSamples) await flushSamples()
              }
            } else if (normalized.kind === 'completed') {
              if (lastSample && `${lastSample.time}:${lastSample.sequence ?? ''}` !== lastDeliveredSampleKey) {
                const filtered = { ...lastSample, outputs: selectSimulationOutputs(lastSample.outputs, selectedOutputs) }
                if (sampleBatch.length >= maxSamples) await flushSamples()
                sampleBatch.push(filtered)
                lastDeliveredSampleKey = `${filtered.time}:${filtered.sequence ?? ''}`
              }
              await flushSamples()
              const time = normalized.time ?? lastSampleTime
              if (!Number.isFinite(time)) throw new Error('BATCH_INVALID_COMPLETION')
              const checkpointTime = normalized.checkpointTime ?? normalized.time
              const checkpointOutputs = normalized.metadata?.checkpointOutputs
              await sendBatchEvent({
                kind: 'completed', time,
                ...(normalized.finishReason ? { finishReason: normalized.finishReason } : {}),
                ...(normalized.checkpoint ? { checkpoint: normalized.checkpoint } : {}),
                ...(normalized.checkpointTime === undefined ? {} : { checkpointTime: normalized.checkpointTime }),
                ...(normalized.checkpoint && Number.isFinite(checkpointTime) && checkpointOutputs
                  && typeof checkpointOutputs === 'object' && !Array.isArray(checkpointOutputs)
                  ? { checkpointSample: { time: checkpointTime, outputs: selectSimulationOutputs(checkpointOutputs, selectedOutputs) } }
                  : {}),
              })
            } else if (normalized.kind === 'error') {
              await sendBatchEvent({ kind: 'error', code: normalized.code, message: 'The simulation could not be completed.' })
              throw new Error('BATCH_SIMULATION_FAILED')
            }
          }, { signal: controller.signal })
          await flushSamples()
          if (!controller.signal.aborted) sendBatchMessage(MESSAGE.BATCH_EXECUTION_END)
        } catch {
          if (!controller.signal.aborted) sendBatchMessage(MESSAGE.BATCH_EXECUTION_END, { code: 'BATCH_SIMULATION_FAILED' })
        } finally {
          batchAcknowledgementsRef.current.get(requestId)?.resolve()
          if (batchRequestsRef.current.get(requestId) === controller) batchRequestsRef.current.delete(requestId)
          batchAcknowledgementsRef.current.delete(requestId)
        }
      }
    }

    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [clearHostReadyRetry, replyToConnectionRequest, scheduleHostReadyRetry, sendHostReady])

  const handleFrameLoad = useCallback(() => {
    documentGenerationRef.current += 1
    if (loadedDocumentRef.current) {
      grantRef.current?.abort()
      grantRef.current = null
      for (const controller of batchRequestsRef.current.values()) controller.abort()
      batchRequestsRef.current.clear()
      clearHostReadyRetry()
      hostReadyAttemptedRef.current = false
      stateRef.current = 'loading'
      setAppState('loading')
      setExecution({ state: 'idle' })
    }
    loadedDocumentRef.current = true
    setFrameLoaded(true)
    if (stateRef.current === 'loading' && !hostReadyAttemptedRef.current) {
      sendHostReady()
      scheduleHostReadyRetry()
    }
  }, [clearHostReadyRetry, scheduleHostReadyRetry, sendHostReady])

  const handleFrameError = useCallback(() => {
    grantRef.current?.abort()
    grantRef.current = null
    for (const controller of batchRequestsRef.current.values()) controller.abort()
    batchRequestsRef.current.clear()
    clearHostReadyRetry()
    stateRef.current = 'error'
    setAppState('error')
  }, [clearHostReadyRetry])

  return {
    iframeRef,
    appState,
    appFailureReason,
    frameLoaded,
    appCapabilities,
    execution,
    send,
    handleFrameLoad,
    handleFrameError,
  }
}
