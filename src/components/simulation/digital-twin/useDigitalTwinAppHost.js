import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DIGITAL_TWIN_MESSAGE as MESSAGE,
  isValidAppMessage,
  isValidFmuStateCheckpointBundle,
  isValidHostMessage,
  makeProtocolMessage,
  isRecord,
} from './digitalTwinAppProtocol'

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
}) {
  const iframeRef = useRef(null)
  const callbacksRef = useRef({})
  const extensionsRef = useRef(hostExtensions)
  const capabilitiesRef = useRef([])
  const grantRef = useRef(null)
  const loadedDocumentRef = useRef(false)
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
      }
    }

    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [clearHostReadyRetry, replyToConnectionRequest, scheduleHostReadyRetry, sendHostReady])

  const handleFrameLoad = useCallback(() => {
    if (loadedDocumentRef.current) {
      grantRef.current?.abort()
      grantRef.current = null
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
