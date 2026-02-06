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
  
  const pollControllerRef = useRef(null)
  const pollStartTimeRef = useRef(null)
  const eventSourceRef = useRef(null)

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
      // Get session data to extract stableUserId
      const sessionResponse = await fetch('/api/onboarding/session', {
        method: 'GET',
        credentials: 'include',
      })

      if (!sessionResponse.ok) {
        const err = await sessionResponse.json().catch(() => ({}))
        throw new Error(err.error || `Session fetch failed: ${sessionResponse.status}`)
      }

      const sessionData = await sessionResponse.json()
      const stableUserId = sessionData.meta?.stableUserId

      if (!stableUserId) {
        throw new Error('Cannot determine stable user ID')
      }

      // Check if user has credentials directly with IB
      const statusUrl = `${institutionBackendUrl}/onboarding/webauthn/key-status/${encodeURIComponent(stableUserId)}`
      
      const statusResponse = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

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

      const statusData = await statusResponse.json()

      // key-status endpoint returns { hasCredential: boolean }
      if (statusData.hasCredential) {
        setState(OnboardingState.NOT_NEEDED)
        setIsOnboarded(true)
        return { needed: false, isOnboarded: true }
      }

      setState(OnboardingState.REQUIRED)
      setIsOnboarded(false)
      return { needed: true, backendUrl: institutionBackendUrl }

    } catch (err) {
      devLog.error('[useInstitutionalOnboarding] Check failed:', err)
      setError(err.message)
      setState(OnboardingState.FAILED)
      return { needed: false, error: err.message }
    }
  }, [isSSO, user, institutionBackendUrl])

  /**
   * Start the onboarding process using browser-direct IB calls.
   * This bypasses server-side calls that may be blocked by firewalls.
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
      // Step 1: Get session data from our API (no external calls)
      const sessionResponse = await fetch('/api/onboarding/session', {
        method: 'GET',
        credentials: 'include',
      })

      if (!sessionResponse.ok) {
        const sessionError = await sessionResponse.json().catch(() => ({}))
        throw new Error(sessionError.error || `Session fetch failed: ${sessionResponse.status}`)
      }

      const sessionData = await sessionResponse.json()
      
      if (!sessionData.payload) {
        throw new Error('Invalid session data response')
      }

      devLog.log('[useInstitutionalOnboarding] Got session data, calling IB directly:', institutionBackendUrl)

      // Step 2: Call the IB directly from the browser
      const ibResponse = await fetch(`${institutionBackendUrl}/onboarding/webauthn/options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData.payload),
      })

      if (!ibResponse.ok) {
        const ibError = await ibResponse.text().catch(() => 'Unknown error')
        throw new Error(`IB request failed: ${ibResponse.status} - ${ibError}`)
      }

      const ibData = await ibResponse.json()

      if (!ibData.sessionId) {
        throw new Error('Missing sessionId in IB response')
      }

      // Build ceremony URL if not provided
      const ceremonyUrl = ibData.ceremonyUrl || `${institutionBackendUrl}/onboarding/webauthn/ceremony/${ibData.sessionId}`

      const resultData = {
        status: 'initiated',
        sessionId: ibData.sessionId,
        ceremonyUrl,
        backendUrl: institutionBackendUrl,
        stableUserId: sessionData.meta.stableUserId,
        institutionId: sessionData.meta.institutionId,
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
  const redirectToCeremony = useCallback((ceremonyUrl) => {
    if (!ceremonyUrl) {
      setError('No ceremony URL available')
      setState(OnboardingState.FAILED)
      return
    }

    // Store session data for when we return
    if (sessionData) {
      try {
        sessionStorage.setItem('onboarding_session', JSON.stringify(sessionData))
      } catch {
        // Ignore storage errors
      }
    }

    // Redirect to IB
    if (typeof window !== 'undefined' && typeof window.location?.assign === 'function') {
      window.location.assign(ceremonyUrl)
    } else {
      window.location.href = ceremonyUrl
    }
  }, [sessionData])

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

          // No callback received yet - check IB directly from browser (bypasses firewall)
          devLog.debug('[useInstitutionalOnboarding] No callback yet, checking IB directly')
          const ibResponse = await fetch(
            `${session.backendUrl}/onboarding/webauthn/status/${session.sessionId}`,
            {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              signal: pollControllerRef.current?.signal
            }
          )

          if (ibResponse.ok) {
            const ibData = await ibResponse.json()

            if (ibData.status === 'SUCCESS' || ibData.status === 'COMPLETED') {
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
  }, [pollInterval, pollTimeout]) // Removed sessionData since it's passed as parameter

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
  }, [listenForCompletionViaSSE, pollForCompletion]) // Removed sessionData to prevent infinite loop

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
    redirectToCeremony(initResult.ceremonyUrl)
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
