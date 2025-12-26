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
  NO_GATEWAY: 'no_gateway',
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
  const { isSSO, user } = useUser()
  
  const [state, setState] = useState(OnboardingState.IDLE)
  const [error, setError] = useState(null)
  const [sessionData, setSessionData] = useState(null)
  const [isOnboarded, setIsOnboarded] = useState(null) // null = unknown
  
  const pollControllerRef = useRef(null)
  const pollStartTimeRef = useRef(null)
  const eventSourceRef = useRef(null)

  /**
   * Check if user needs onboarding
   */
  const checkOnboardingStatus = useCallback(async () => {
    if (!isSSO || !user) {
      setState(OnboardingState.NOT_NEEDED)
      return { needed: false, reason: 'Not SSO user' }
    }

    setState(OnboardingState.CHECKING)
    setError(null)

    try {
      const response = await fetch('/api/onboarding/init', {
        method: 'GET',
        credentials: 'include',
      })

      const data = await response.json()

      if (data.error?.includes('NO_GATEWAY')) {
        setState(OnboardingState.NO_GATEWAY)
        setIsOnboarded(false)
        return { needed: false, reason: 'No gateway configured', noGateway: true }
      }

      if (data.isOnboarded) {
        setState(OnboardingState.NOT_NEEDED)
        setIsOnboarded(true)
        return { needed: false, isOnboarded: true }
      }

      setState(OnboardingState.REQUIRED)
      setIsOnboarded(false)
      return { needed: true, gatewayUrl: data.gatewayUrl }

    } catch (err) {
      devLog.error('[useInstitutionalOnboarding] Check failed:', err)
      setError(err.message)
      setState(OnboardingState.FAILED)
      return { needed: false, error: err.message }
    }
  }, [isSSO, user])

  /**
   * Start the onboarding process
   * Returns the ceremony URL for redirect
   */
  const initiateOnboarding = useCallback(async () => {
    if (!isSSO || !user) {
      setError('SSO session required')
      setState(OnboardingState.FAILED)
      return null
    }

    setState(OnboardingState.INITIATING)
    setError(null)

    try {
      const response = await fetch('/api/onboarding/init', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Request failed: ${response.status}`)
      }

      if (data.status === 'already_onboarded') {
        setState(OnboardingState.NOT_NEEDED)
        setIsOnboarded(true)
        return { alreadyOnboarded: true }
      }

      setSessionData({
        sessionId: data.sessionId,
        ceremonyUrl: data.ceremonyUrl,
        gatewayUrl: data.gatewayUrl,
        stableUserId: data.stableUserId,
        institutionId: data.institutionId,
      })

      setState(OnboardingState.REDIRECTING)
      return data

    } catch (err) {
      devLog.error('[useInstitutionalOnboarding] Initiate failed:', err)
      setError(err.message)
      setState(OnboardingState.FAILED)
      return null
    }
  }, [isSSO, user])

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
   */
  const pollForCompletion = useCallback(async (session = sessionData) => {
    if (!session?.sessionId || !session?.gatewayUrl) {
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
          const url = new URL(`/api/onboarding/status/${session.sessionId}`, window.location.origin)
          url.searchParams.set('gatewayUrl', session.gatewayUrl)
          url.searchParams.set('checkLocal', 'true')

          const response = await fetch(url.toString(), { credentials: 'include' })
          const data = await response.json()

          if (data.status === 'SUCCESS' || data.status === 'COMPLETED') {
            setState(OnboardingState.COMPLETED)
            setIsOnboarded(true)
            setSessionData(null)
            sessionStorage.removeItem('onboarding_session')
            return { success: true, ...data }
          }

          if (data.status === 'FAILED' || data.status === 'EXPIRED') {
            setState(OnboardingState.FAILED)
            setError(data.error || 'Onboarding failed')
            return { success: false, ...data }
          }

          // Still pending, wait and retry
          await new Promise(resolve => setTimeout(resolve, pollInterval))

        } catch (err) {
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
    if (!session?.sessionId || !session?.gatewayUrl) {
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
    
    // Computed
    isLoading: [
      OnboardingState.CHECKING,
      OnboardingState.INITIATING,
      OnboardingState.POLLING,
    ].includes(state),
    needsOnboarding: state === OnboardingState.REQUIRED,
    isCompleted: state === OnboardingState.COMPLETED || isOnboarded === true,
    hasGateway: state !== OnboardingState.NO_GATEWAY,
    
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
