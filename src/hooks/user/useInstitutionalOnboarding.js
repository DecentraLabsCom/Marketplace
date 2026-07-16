/**
 * React hook for institutional onboarding flow
 * 
 * Manages the WebAuthn credential registration process with the 
 * Institutional Backend (IB) for SSO users.
 * 
 * @module hooks/useInstitutionalOnboarding
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useUser } from '@/context/UserContext'
import devLog from '@/utils/dev/logger'
import {
  hasBrowserCredentialMarkerVerified,
  markBrowserCredentialVerified,
} from '@/utils/onboarding/browserCredentialMarker'
import { emitPopupBlockedEvent, createPopupBlockedError } from '@/utils/browser/popupBlockerGuidance'

/**
 * Onboarding flow states
 * @readonly
 * @enum {string}
 */
export const OnboardingState = {
  IDLE: 'idle',
  CHECKING: 'checking',
  NOT_NEEDED: 'not_needed',
  REQUIRED: 'required',
  INITIATING: 'initiating',
  REDIRECTING: 'redirecting',
  AWAITING_COMPLETION: 'awaiting_completion',
  POLLING: 'polling',
  COMPLETED: 'completed',
  FAILED: 'failed',
  NO_BACKEND: 'no_backend',
}

const isSessionWarmupError = (status, message) => {
  const normalized = String(message || '').toLowerCase()
  if (status !== 401 && status !== 403) return false
  return (
    normalized.includes('sso session required') ||
    normalized.includes('institutional onboarding')
  )
}

const ONBOARDING_POPUP_MESSAGE_TYPE = 'institutional-onboarding'

const resolvePopupCeremonyUrl = (ceremonyUrl) => {
  if (typeof window === 'undefined') return ceremonyUrl
  try {
    const normalized = new URL(ceremonyUrl, window.location.origin)
    if (!normalized.searchParams.has('parentOrigin')) {
      normalized.searchParams.set('parentOrigin', window.location.origin)
    }
    return normalized.toString()
  } catch {
    return ceremonyUrl
  }
}

const ONBOARDING_POPUP_FEATURES = 'width=580,height=720'

/**
 * Hook for managing institutional onboarding
 * 
 * @param {Object} options - Hook options
 * @param {boolean} [options.autoCheck=false] - Auto-check status on mount
 * @param {boolean} [options.autoPoll=true] - Auto-poll for completion after redirect
 * @param {number} [options.pollInterval=2000] - Polling interval in ms
 * @param {number} [options.pollTimeout=120000] - Max polling time in ms
 * @returns {Object} Onboarding state and controls
 */
export function useInstitutionalOnboarding({
  autoCheck = false,
  autoPoll = true,
  pollInterval = 2000,
  pollTimeout = 120000,
} = {}) {
  const { isSSO, user, institutionBackendUrl, institutionDomain } = useUser()
  
  const [state, setState] = useState(OnboardingState.IDLE)
  const [error, setError] = useState(null)
  const [sessionData, setSessionData] = useState(null)
  const [isOnboarded, setIsOnboarded] = useState(null) // null = unknown
  // keyStatus reflects IB + local-browser presence for passkeys
  // { hasCredential: boolean, hasPlatformCredential: boolean|null }
  const [keyStatus, setKeyStatus] = useState(null)
  
  const pollControllerRef = useRef(null)
  const pollStartTimeRef = useRef(null)
  const eventSourceRef = useRef(null)
  const awaitCompletionRef = useRef(null)
  const sessionDataRef = useRef(null)

  const markBrowserCredentialSeen = useCallback((session = null) => {
    const markerPayload = {
      stableUserId:
        session?.stableUserId ||
        user?.schacPersonalUniqueCode ||
        user?.personalUniqueCode ||
        user?.personal_unique_code ||
        null,
      institutionId: session?.institutionId || institutionDomain || null,
    }
    if (!markerPayload.stableUserId) return
    markBrowserCredentialVerified(markerPayload)
  }, [user, institutionDomain])

  /**
   * Check if user needs onboarding.
   * Uses browser-direct call to IB to bypass firewall restrictions.
   */
  const checkOnboardingStatus = useCallback(async () => {
    if (!isSSO || !user) {
      setState(OnboardingState.NOT_NEEDED)
      return { needed: false, reason: 'Not SSO user' }
    }

    // Check if we have the backend URL from smart contract resolution
    if (!institutionBackendUrl) {
      setState(OnboardingState.NO_BACKEND)
      setIsOnboarded(false)
      return { needed: false, reason: 'No backend configured', noBackend: true }
    }

    setState(OnboardingState.CHECKING)
    setError(null)

    try {
      const statusResponse = await fetch('/api/onboarding/webauthn/key-status', {
        method: 'GET',
        credentials: 'include',
      })

      if (!statusResponse.ok && statusResponse.status !== 404) {
        const err = await statusResponse.json().catch(() => ({}))
        const message = err.error || `Status fetch failed: ${statusResponse.status}`

        // Right after SSO callback, cookie/session propagation can be briefly delayed.
        // Keep onboarding in REQUIRED mode instead of failing the whole modal.
        if (isSessionWarmupError(statusResponse.status, message)) {
          devLog.warn('[useInstitutionalOnboarding] Session still warming up, keeping onboarding required')
          setState(OnboardingState.REQUIRED)
          setIsOnboarded(false)
          setError(null)
          return {
            needed: true,
            backendUrl: institutionBackendUrl,
            reason: 'Session still initializing',
            transient: true,
          }
        }

        throw new Error(message)
      }

      const statusData = await statusResponse.json()
      const stableUserId = statusData.stableUserId
      const markerPayload = {
        stableUserId,
        institutionId: statusData.institutionId || institutionDomain || null,
      }

      if (!stableUserId) {
        throw new Error('Cannot determine stable user ID')
      }

      // If endpoint doesn't exist or returns 404, assume not onboarded yet
      if (statusResponse.status === 404) {
        setState(OnboardingState.REQUIRED)
        setIsOnboarded(false)
        return { needed: true, backendUrl: institutionBackendUrl }
      }

      if (!statusResponse.ok) {
        // Non-404 error - treat as needing onboarding (can't confirm status)
        devLog.warn('[useInstitutionalOnboarding] Status check failed:', statusResponse.status)
        setState(OnboardingState.REQUIRED)
        setIsOnboarded(false)
        return { needed: true, backendUrl: institutionBackendUrl }
      }

      // Build initial keyStatus from IB response
      const resolvedKeyStatus = {
        hasCredential: Boolean(statusData.hasCredential),
        // IB may optionally report platform credential presence
        hasPlatformCredential: typeof statusData.hasPlatformCredential === 'boolean' ? statusData.hasPlatformCredential : null,
      }

      // If IB reports the user has a credential, rely on browser marker
      // to decide whether this browser has already acknowledged/used it.
      if (statusData.hasCredential) {
        const hasMarker = hasBrowserCredentialMarkerVerified(markerPayload)
        const shouldShowAdvisory = !hasMarker

        // New browser for this user/institution: force advisory until acknowledged here.
        if (shouldShowAdvisory) {
          resolvedKeyStatus.hasPlatformCredential = false
          setKeyStatus(resolvedKeyStatus)
          setState(OnboardingState.NOT_NEEDED)
          setIsOnboarded(true)
          return { needed: false, isOnboarded: true }
        }

        resolvedKeyStatus.hasPlatformCredential = true
        setKeyStatus(resolvedKeyStatus)
        markBrowserCredentialSeen(markerPayload)
        setState(OnboardingState.NOT_NEEDED)
        setIsOnboarded(true)
        return { needed: false, isOnboarded: true }
      }

      setKeyStatus(resolvedKeyStatus)
      setState(OnboardingState.REQUIRED)
      setIsOnboarded(false)
      return { needed: true, backendUrl: institutionBackendUrl }

    } catch (err) {
      devLog.error('[useInstitutionalOnboarding] Check failed:', err)
      setError(err.message)
      setState(OnboardingState.FAILED)
      return { needed: false, error: err.message }
    }
  }, [isSSO, user, institutionBackendUrl, institutionDomain, markBrowserCredentialSeen])

  /**
   * Start onboarding through the same-origin Marketplace proxy. Only the
   * WebAuthn ceremony itself is opened at the institutional origin.
   * Returns the ceremony URL for redirect.
   */
  const initiateOnboarding = useCallback(async () => {
    if (!isSSO || !user) {
      setError('SSO session required')
      setState(OnboardingState.FAILED)
      return null
    }

    // Check if we have the backend URL from smart contract resolution
    if (!institutionBackendUrl) {
      setError('Institution backend URL not available')
      setState(OnboardingState.NO_BACKEND)
      return null
    }

    setState(OnboardingState.INITIATING)
    setError(null)

    try {
      const ibResponse = await fetch('/api/onboarding/webauthn/options', {
        method: 'POST',
        credentials: 'include',
      })

      if (!ibResponse.ok) {
        const sessionError = await ibResponse.json().catch(() => ({}))
        const message = sessionError.error || `Onboarding preparation failed: ${ibResponse.status}`

        if (isSessionWarmupError(ibResponse.status, message)) {
          devLog.warn('[useInstitutionalOnboarding] Session still warming up during initiate')
          setState(OnboardingState.REQUIRED)
          setError(null)
          return null
        }

        throw new Error(message)
      }

      const ibData = await ibResponse.json()

      if (!ibData.sessionId) {
        throw new Error('Missing sessionId in IB response')
      }

      const ceremonyUrl = ibData.ceremonyUrl
      if (!ceremonyUrl) throw new Error('Missing ceremony URL')

      const resultData = {
        status: 'initiated',
        sessionId: ibData.sessionId,
        ceremonyUrl,
        backendUrl: institutionBackendUrl,
        stableUserId: ibData.stableUserId,
        institutionId: ibData.institutionId,
        expiresAt: ibData.expiresAt || null,
      }

      setSessionData({
        sessionId: resultData.sessionId,
        ceremonyUrl: resultData.ceremonyUrl,
        backendUrl: resultData.backendUrl,
        stableUserId: resultData.stableUserId,
        institutionId: resultData.institutionId,
      })

      setState(OnboardingState.REDIRECTING)
      devLog.log('[useInstitutionalOnboarding] IB session created:', ibData.sessionId)
      return resultData

    } catch (err) {
      devLog.error('[useInstitutionalOnboarding] Initiate failed:', err)
      setError(err.message)
      setState(OnboardingState.FAILED)
      return null
    }
  }, [isSSO, user, institutionBackendUrl])

  /**
   * Redirect to the IB ceremony page
   */
  const redirectToCeremony = useCallback((ceremonyUrl, popup = null, sessionOverride = null) => {
    if (!ceremonyUrl) {
      setError('No ceremony URL available')
      setState(OnboardingState.FAILED)
      return { opened: false, error: new Error('No ceremony URL available') }
    }
    const popupCeremonyUrl = resolvePopupCeremonyUrl(ceremonyUrl)

    const sessionForTracking = sessionOverride || sessionData || null

    // Store session data for when we return
    if (sessionForTracking) {
      try {
        sessionStorage.setItem('onboarding_session', JSON.stringify(sessionForTracking))
      } catch {
        // Ignore storage errors
      }
    }

    let onboardingPopup = popup && !popup.closed ? popup : null

    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      try {
        const popupWindow = window.open(
          popupCeremonyUrl,
          'institutional-onboarding',
          ONBOARDING_POPUP_FEATURES
        )
        if (popupWindow) {
          onboardingPopup = popupWindow
          onboardingPopup.focus?.()
        }
      } catch {
        // ignore and handle below
      }
    }

    if (!onboardingPopup) {
      emitPopupBlockedEvent({
        authorizationUrl: popupCeremonyUrl,
        source: 'onboarding-webauthn',
      })
      const popupError = createPopupBlockedError('Onboarding window was blocked')
      setError(popupError.message)
      setState(OnboardingState.FAILED)
      return { opened: false, blocked: true, error: popupError }
    }

    if (autoPoll && sessionForTracking) {
      setState(OnboardingState.AWAITING_COMPLETION)
      awaitCompletionRef.current?.(sessionForTracking)
    }

    return { opened: true, popup: onboardingPopup }
  }, [sessionData, autoPoll])

  /**
   * Poll for onboarding completion
   * Uses browser-direct calls to IB to bypass firewall restrictions
   */
  const pollForCompletion = useCallback(async (session = sessionData) => {
    if (!session?.sessionId || !session?.backendUrl) {
      setError('No session data for polling')
      return null
    }

    setState(OnboardingState.POLLING)
    pollStartTimeRef.current = Date.now()
    pollControllerRef.current = new AbortController()

    const poll = async () => {
      while (Date.now() - pollStartTimeRef.current < pollTimeout) {
        if (pollControllerRef.current?.signal.aborted) {
          return null
        }

        try {
          // First check local callback cache (this is fast and doesn't hit IB)
          const localUrl = new URL(`/api/onboarding/status/${session.sessionId}`, window.location.origin)
          localUrl.searchParams.set('checkLocal', 'true')

          const localResponse = await fetch(localUrl.toString(), { credentials: 'include' })
          const localData = await localResponse.json()

          // If we got a definitive result from callback cache, use it
          if (localData.source === 'callback') {
            if (localData.status === 'SUCCESS' || localData.status === 'COMPLETED') {
              markBrowserCredentialSeen(session)
              setState(OnboardingState.COMPLETED)
              setIsOnboarded(true)
              setSessionData(null)
              sessionStorage.removeItem('onboarding_session')
              return { success: true, ...localData }
            }

            if (localData.status === 'FAILED' || localData.status === 'EXPIRED') {
              setState(OnboardingState.FAILED)
              setError(localData.error || 'Onboarding failed')
              return { success: false, ...localData }
            }
          }

          // The same route checks the local callback cache and securely relays
          // pending status to the authenticated institutional backend.
          const ibResponse = await fetch(localUrl.toString(), {
            credentials: 'include',
            signal: pollControllerRef.current?.signal,
          })

          if (ibResponse.ok) {
            const ibData = await ibResponse.json()

            if (ibData.status === 'SUCCESS' || ibData.status === 'COMPLETED') {
              markBrowserCredentialSeen(session)
              setState(OnboardingState.COMPLETED)
              setIsOnboarded(true)
              setSessionData(null)
              sessionStorage.removeItem('onboarding_session')
              return { success: true, ...ibData }
            }

            if (ibData.status === 'FAILED' || ibData.status === 'EXPIRED') {
              setState(OnboardingState.FAILED)
              setError(ibData.error || 'Onboarding failed')
              return { success: false, ...ibData }
            }
          }

          // Still pending, wait and retry
          await new Promise(resolve => setTimeout(resolve, pollInterval))

        } catch (err) {
          if (err.name === 'AbortError') {
            return null
          }
          devLog.warn('[useInstitutionalOnboarding] Poll error:', err)
          await new Promise(resolve => setTimeout(resolve, pollInterval))
        }
      }

      // Timeout
      setState(OnboardingState.FAILED)
      setError('Onboarding timeout - please try again')
      return { success: false, error: 'timeout' }
    }

    return poll()
  }, [pollInterval, pollTimeout, markBrowserCredentialSeen]) // Removed sessionData since it's passed as parameter

  /**
   * Cancel ongoing polling
   */
  const cancelPolling = useCallback(() => {
    if (pollControllerRef.current) {
      pollControllerRef.current.abort()
      pollControllerRef.current = null
    }

    if (eventSourceRef.current) {
      try {
        eventSourceRef.current.close()
      } catch {
        // ignore
      }
      eventSourceRef.current = null
    }
  }, [])

  const listenForCompletionViaSSE = useCallback(async (session) => {
    if (!session?.sessionId) return null
    if (typeof window === 'undefined') return null
    if (typeof EventSource === 'undefined') return null

    return new Promise((resolve, reject) => {
      try {
        const url = new URL('/api/onboarding/events', window.location.origin)
        url.searchParams.set('sessionId', session.sessionId)
        if (session.stableUserId) url.searchParams.set('stableUserId', session.stableUserId)
        if (session.institutionId) url.searchParams.set('institutionId', session.institutionId)

        const es = new EventSource(url.toString())
        eventSourceRef.current = es

        const timeoutHandle = setTimeout(() => {
          try {
            es.close()
          } catch {
            // ignore
          }
          eventSourceRef.current = null
          resolve(null)
        }, pollTimeout)

        const cleanup = () => {
          clearTimeout(timeoutHandle)
        }

        es.addEventListener('onboarding', (evt) => {
          try {
            const data = JSON.parse(evt.data || '{}')
            const status = data?.status

            if (status === 'SUCCESS' || status === 'COMPLETED') {
              cleanup()
              try {
                es.close()
              } catch {
                // ignore
              }
              eventSourceRef.current = null
              resolve({ success: true, ...data })
              return
            }

            if (status === 'FAILED' || status === 'EXPIRED') {
              cleanup()
              try {
                es.close()
              } catch {
                // ignore
              }
              eventSourceRef.current = null
              resolve({ success: false, ...data })
              return
            }
          } catch (err) {
            devLog.warn('[useInstitutionalOnboarding] SSE parse error:', err)
          }
        })

        es.onerror = (err) => {
          cleanup()
          try {
            es.close()
          } catch {
            // ignore
          }
          eventSourceRef.current = null
          reject(err)
        }
      } catch (err) {
        reject(err)
      }
    })
  }, [pollTimeout])

  const awaitCompletion = useCallback(async (session = sessionData) => {
    if (!session?.sessionId || !session?.backendUrl) {
      setError('No session data for polling')
      return null
    }

    setState(OnboardingState.POLLING)

    try {
      const sseResult = await listenForCompletionViaSSE(session)
      if (sseResult) {
        if (sseResult.success) {
          markBrowserCredentialSeen(session)
          setState(OnboardingState.COMPLETED)
          setIsOnboarded(true)
          setSessionData(null)
          sessionStorage.removeItem('onboarding_session')
        } else {
          setState(OnboardingState.FAILED)
          setError(sseResult.error || 'Onboarding failed')
        }
        return sseResult
      }
    } catch (err) {
      devLog.warn('[useInstitutionalOnboarding] SSE unavailable, falling back to polling:', err)
    }

    return pollForCompletion(session)
  }, [listenForCompletionViaSSE, pollForCompletion, markBrowserCredentialSeen]) // Removed sessionData to prevent infinite loop

  awaitCompletionRef.current = awaitCompletion

  useEffect(() => {
    sessionDataRef.current = sessionData
  }, [sessionData])

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    cancelPolling()
    setState(OnboardingState.IDLE)
    setError(null)
    setSessionData(null)
    sessionStorage.removeItem('onboarding_session')
  }, [cancelPolling])

  /**
   * Full onboarding flow: check -> initiate -> redirect
   */
  const startOnboarding = useCallback(async () => {
    const status = await checkOnboardingStatus()
    
    if (!status.needed) {
      return { completed: status.isOnboarded, reason: status.reason }
    }

    const initResult = await initiateOnboarding()
    
    if (!initResult) {
      return { completed: false, error: error }
    }

    if (initResult.alreadyOnboarded) {
      return { completed: true }
    }

    // Redirect to ceremony
    const popupResult = redirectToCeremony(initResult.ceremonyUrl, null, {
      sessionId: initResult.sessionId,
      ceremonyUrl: initResult.ceremonyUrl,
      backendUrl: initResult.backendUrl,
      stableUserId: initResult.stableUserId,
      institutionId: initResult.institutionId,
    })

    if (!popupResult?.opened) {
      return {
        completed: false,
        blocked: Boolean(popupResult?.blocked),
        error: popupResult?.error?.message || 'Unable to open onboarding window',
      }
    }

    return { redirecting: true, ceremonyUrl: initResult.ceremonyUrl }
  }, [checkOnboardingStatus, initiateOnboarding, redirectToCeremony, error])

  // Check for returning from ceremony on mount
  useEffect(() => {
    const storedSession = sessionStorage.getItem('onboarding_session')
    
    if (storedSession && autoPoll) {
      try {
        const session = JSON.parse(storedSession)
        setSessionData(session)
        setState(OnboardingState.AWAITING_COMPLETION)
        
        // Prefer SSE for real-time updates; fallback to polling
        awaitCompletion(session)
      } catch {
        sessionStorage.removeItem('onboarding_session')
      }
    }
  }, [autoPoll]) // Removed awaitCompletion from dependencies to prevent infinite loop

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let expectedOrigin = null
    if (institutionBackendUrl) {
      try {
        expectedOrigin = new URL(institutionBackendUrl).origin
      } catch {
        expectedOrigin = null
      }
    }

    const handlePopupMessage = (event) => {
      if (expectedOrigin && event.origin !== expectedOrigin) return

      const payload = event?.data
      if (!payload || payload.type !== ONBOARDING_POPUP_MESSAGE_TYPE) return

      const activeSession = sessionDataRef.current
      if (
        payload.sessionId &&
        activeSession?.sessionId &&
        payload.sessionId !== activeSession.sessionId
      ) {
        return
      }

      const status = String(payload.status || '').toUpperCase()
      if (status === 'SUCCESS' || status === 'COMPLETED') {
        if (activeSession) {
          markBrowserCredentialSeen(activeSession)
        }
        cancelPolling()
        setState(OnboardingState.COMPLETED)
        setError(null)
        setIsOnboarded(true)
        setSessionData(null)
        sessionStorage.removeItem('onboarding_session')
        return
      }

      if (status === 'FAILED' || status === 'EXPIRED' || status === 'CANCELLED') {
        cancelPolling()
        setState(OnboardingState.FAILED)
        setError(payload.error || 'Onboarding failed')
      }
    }

    window.addEventListener('message', handlePopupMessage)
    return () => {
      window.removeEventListener('message', handlePopupMessage)
    }
  }, [cancelPolling, institutionBackendUrl, markBrowserCredentialSeen])

  // Auto-check on mount if enabled
  useEffect(() => {
    if (autoCheck && isSSO && user && state === OnboardingState.IDLE) {
      checkOnboardingStatus()
    }
  }, [autoCheck, isSSO, user, state, checkOnboardingStatus])

  // Recover from early NO_BACKEND when institutionBackendUrl resolves later.
  useEffect(() => {
    if (autoCheck && state === OnboardingState.NO_BACKEND && institutionBackendUrl) {
      setState(OnboardingState.IDLE)
      setError(null)
    }
  }, [autoCheck, state, institutionBackendUrl])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelPolling()
    }
  }, [cancelPolling])

  return {
    // State
    state,
    error,
    isOnboarded,
    sessionData,
    institutionBackendUrl,
    institutionDomain,
    keyStatus,
    
    // Computed
    isLoading: [
      OnboardingState.CHECKING,
      OnboardingState.INITIATING,
      OnboardingState.POLLING,
    ].includes(state),
    needsOnboarding: state === OnboardingState.REQUIRED,
    isCompleted: state === OnboardingState.COMPLETED || isOnboarded === true,
    hasBackend: state !== OnboardingState.NO_BACKEND && !!institutionBackendUrl,
    
    // Actions
    checkOnboardingStatus,
    initiateOnboarding,
    redirectToCeremony,
    pollForCompletion,
    startOnboarding,
    cancelPolling,
    reset,
  }
}

export default useInstitutionalOnboarding
