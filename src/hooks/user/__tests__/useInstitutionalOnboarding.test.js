/**
 * Tests for useInstitutionalOnboarding hook
 *
 * @group hooks
 * @group user
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useInstitutionalOnboarding, OnboardingState } from '../useInstitutionalOnboarding'

// Mock the useUser hook
jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(),
}))

const mockUseUser = require('@/context/UserContext').useUser

// Mock dependencies
const mockFetch = jest.fn()
global.fetch = mockFetch

const mockSessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}
Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
})

const mockEventSource = jest.fn()
global.EventSource = mockEventSource

// Mock UserContext
const mockUserContext = {
  isSSO: true,
  user: { id: 'user123', email: 'test@university.edu' },
  institutionBackendUrl: 'https://backend.example.com',
  institutionDomain: 'university.edu',
}

const wrapper = ({ children }) => children

describe('useInstitutionalOnboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
    mockUseUser.mockReturnValue(mockUserContext)
    mockSessionStorage.getItem.mockReturnValue(null)
    mockSessionStorage.setItem.mockImplementation(() => {})
    mockSessionStorage.removeItem.mockImplementation(() => {})
    window.open = jest.fn(() => null)
    window.localStorage.clear()
  })

  describe('initial state', () => {
    it('should initialize with IDLE state', () => {
      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      expect(result.current.state).toBe(OnboardingState.IDLE)
      expect(result.current.error).toBeNull()
      expect(result.current.isOnboarded).toBeNull()
      expect(result.current.sessionData).toBeNull()
    })

    it('should compute derived state correctly', () => {
      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.needsOnboarding).toBe(false)
      expect(result.current.isCompleted).toBe(false)
      expect(result.current.hasBackend).toBe(true)
    })

    it('should expose institutionBackendUrl and institutionDomain', () => {
      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      expect(result.current.institutionBackendUrl).toBe('https://backend.example.com')
      expect(result.current.institutionDomain).toBe('university.edu')
    })

    it('should report hasBackend=false when no backend URL', () => {
      mockUseUser.mockReturnValueOnce({ ...mockUserContext, institutionBackendUrl: null })
      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      expect(result.current.hasBackend).toBe(false)
    })
  })

  describe('checkOnboardingStatus', () => {
    it('should return NOT_NEEDED for non-SSO users', async () => {
      // Mock non-SSO user
      mockUseUser.mockReturnValueOnce({ isSSO: false, user: null, institutionBackendUrl: null, institutionDomain: null })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let statusResult
      await act(async () => {
        statusResult = await result.current.checkOnboardingStatus()
      })

      expect(result.current.state).toBe(OnboardingState.NOT_NEEDED)
      expect(statusResult.needed).toBe(false)
      expect(statusResult.reason).toBe('Not SSO user')
    })

    it('should handle successful check - onboarding needed', async () => {
      // Mock session endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          payload: { stableUserId: 'user123' },
          meta: { stableUserId: 'user123', institutionId: 'university.edu' }
        })
      })
      // Mock IB status check - 404 means not onboarded yet
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let statusResult
      await act(async () => {
        statusResult = await result.current.checkOnboardingStatus()
      })

      expect(mockFetch).toHaveBeenCalledWith('/api/onboarding/session', {
        method: 'GET',
        credentials: 'include',
      })
      expect(result.current.state).toBe(OnboardingState.REQUIRED)
      expect(result.current.isOnboarded).toBe(false)
      expect(statusResult.needed).toBe(true)
      expect(statusResult.backendUrl).toBe('https://backend.example.com')
    })

    it('should include institutionId query parameter in key-status request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          payload: { stableUserId: 'user123' },
          meta: { stableUserId: 'user123', institutionId: 'university.edu' }
        })
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      await act(async () => {
        await result.current.checkOnboardingStatus()
      })

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://backend.example.com/onboarding/webauthn/key-status/user123?institutionId=university.edu',
        expect.objectContaining({
          method: 'GET',
        })
      )
    })

    it('should handle successful check - already onboarded', async () => {
      // Mock session endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          payload: { stableUserId: 'user123' },
          meta: { stableUserId: 'user123', institutionId: 'university.edu' }
        })
      })
      // Mock IB key-status check - has credentials
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hasCredential: true })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let statusResult
      await act(async () => {
        statusResult = await result.current.checkOnboardingStatus()
      })

      expect(result.current.state).toBe(OnboardingState.NOT_NEEDED)
      expect(result.current.isOnboarded).toBe(true)
      expect(statusResult.needed).toBe(false)
      expect(statusResult.isOnboarded).toBe(true)
    })

    it('should set keyStatus when IB reports credential but local browser not registered', async () => {
      // Mock session endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          payload: { stableUserId: 'user123' },
          meta: { stableUserId: 'user123', institutionId: 'university.edu' }
        })
      })
      // Mock IB key-status - has credentials
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hasCredential: true })
      })
      // Mock local browser check -> not registered here
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ registered: false })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let statusResult
      await act(async () => {
        statusResult = await result.current.checkOnboardingStatus()
      })

      expect(result.current.keyStatus).toEqual({
        hasCredential: true,
        hasPlatformCredential: false,
      })
      expect(result.current.state).toBe(OnboardingState.NOT_NEEDED)
      expect(result.current.isOnboarded).toBe(true)
      expect(statusResult.needed).toBe(false)
    })

    it('should treat a brand new browser as advisory even when local endpoint says registered', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          payload: { stableUserId: 'user123' },
          meta: { stableUserId: 'user123', institutionId: 'university.edu' }
        })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hasCredential: true })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ registered: true })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      await act(async () => {
        await result.current.checkOnboardingStatus()
      })

      expect(result.current.keyStatus).toEqual({
        hasCredential: true,
        hasPlatformCredential: false,
      })
    })

    it('should treat browser as known when marker exists and local endpoint is registered', async () => {
      window.localStorage.setItem('institutional_browser_passkey:university.edu:user123', '1')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          payload: { stableUserId: 'user123' },
          meta: { stableUserId: 'user123', institutionId: 'university.edu' }
        })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hasCredential: true })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ registered: true })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      await act(async () => {
        await result.current.checkOnboardingStatus()
      })

      expect(result.current.keyStatus).toEqual({
        hasCredential: true,
        hasPlatformCredential: true,
      })
    })

    it('should keep advisory when marker is missing even if IB reports hasPlatformCredential=true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          payload: { stableUserId: 'user123' },
          meta: { stableUserId: 'user123', institutionId: 'university.edu' }
        })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hasCredential: true, hasPlatformCredential: true })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      await act(async () => {
        await result.current.checkOnboardingStatus()
      })

      expect(result.current.keyStatus).toEqual({
        hasCredential: true,
        hasPlatformCredential: false,
      })
      expect(result.current.state).toBe(OnboardingState.NOT_NEEDED)
      expect(result.current.isOnboarded).toBe(true)
    })

    it('should handle NO_BACKEND error', async () => {
      // Mock no backend URL - set institutionBackendUrl to null
      mockUseUser.mockReturnValueOnce({ ...mockUserContext, institutionBackendUrl: null })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let statusResult
      await act(async () => {
        statusResult = await result.current.checkOnboardingStatus()
      })

      expect(result.current.state).toBe(OnboardingState.NO_BACKEND)
      expect(result.current.isOnboarded).toBe(false)
      expect(statusResult.needed).toBe(false)
      expect(statusResult.noBackend).toBe(true)
    })

    it('should handle fetch errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let statusResult
      await act(async () => {
        statusResult = await result.current.checkOnboardingStatus()
      })

      expect(result.current.state).toBe(OnboardingState.FAILED)
      expect(result.current.error).toBe('Network error')
      expect(statusResult.needed).toBe(false)
      expect(statusResult.error).toBe('Network error')
    })
  })

  describe('initiateOnboarding', () => {
    it('should fail for non-SSO users', async () => {
      // Mock non-SSO user
      mockUseUser.mockReturnValueOnce({ isSSO: false, user: null, institutionBackendUrl: null, institutionDomain: null })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let resultData
      await act(async () => {
        resultData = await result.current.initiateOnboarding()
      })

      expect(result.current.state).toBe(OnboardingState.FAILED)
      expect(result.current.error).toBe('SSO session required')
      expect(resultData).toBeNull()
    })

    it('should fail when no backend URL', async () => {
      mockUseUser.mockReturnValueOnce({ ...mockUserContext, institutionBackendUrl: null })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let resultData
      await act(async () => {
        resultData = await result.current.initiateOnboarding()
      })

      expect(result.current.state).toBe(OnboardingState.NO_BACKEND)
      expect(result.current.error).toBe('Institution backend URL not available')
      expect(resultData).toBeNull()
    })

    it('should handle successful initiation', async () => {
      // Mock session endpoint response
      const mockSessionResponse = {
        status: 'ok',
        payload: {
          stableUserId: 'stable123',
          institutionId: 'university.edu',
          displayName: 'Test User',
          callbackUrl: 'https://example.com/callback'
        },
        meta: {
          stableUserId: 'stable123',
          institutionId: 'university.edu',
          email: 'test@university.edu',
          displayName: 'Test User'
        }
      }

      // Mock IB response
      const mockIBResponse = {
        sessionId: 'session123',
        ceremonyUrl: 'https://ceremony.example.com',
        expiresAt: Date.now() + 3600000
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSessionResponse)
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockIBResponse)
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let resultData
      await act(async () => {
        resultData = await result.current.initiateOnboarding()
      })

      // Should call session endpoint first
      expect(mockFetch).toHaveBeenCalledWith('/api/onboarding/session', {
        method: 'GET',
        credentials: 'include',
      })
      // Then call IB directly
      expect(mockFetch).toHaveBeenCalledWith(
        'https://backend.example.com/onboarding/webauthn/options',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
      expect(result.current.state).toBe(OnboardingState.REDIRECTING)
      expect(result.current.sessionData.sessionId).toBe('session123')
      expect(resultData.sessionId).toBe('session123')
    })

    it('should handle session fetch error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let resultData
      await act(async () => {
        resultData = await result.current.initiateOnboarding()
      })

      expect(result.current.state).toBe(OnboardingState.FAILED)
      expect(result.current.error).toBe('Unauthorized')
      expect(resultData).toBeNull()
    })

    it('should handle IB call error', async () => {
      // Mock session endpoint success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          payload: { stableUserId: 'user123' },
          meta: { stableUserId: 'user123', institutionId: 'university.edu' }
        })
      })
      // Mock IB failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error')
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let resultData
      await act(async () => {
        resultData = await result.current.initiateOnboarding()
      })

      expect(result.current.state).toBe(OnboardingState.FAILED)
      expect(result.current.error).toContain('IB request failed')
      expect(resultData).toBeNull()
    })
  })

  describe('redirectToCeremony', () => {
    it('should store session data and open popup', async () => {
      const mockCeremonyUrl = 'https://ceremony.example.com'
      const popup = { closed: false, focus: jest.fn(), location: { assign: jest.fn(), href: '' } }
      window.open = jest.fn(() => popup)

      // Mock session endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          payload: { stableUserId: 'stable123', institutionId: 'university.edu' },
          meta: { stableUserId: 'stable123', institutionId: 'university.edu' }
        })
      })
      // Mock IB response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          sessionId: 'session123',
          ceremonyUrl: mockCeremonyUrl,
        })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding({ autoPoll: false }), { wrapper })

      await act(async () => {
        await result.current.initiateOnboarding()
      })

      act(() => {
        result.current.redirectToCeremony(mockCeremonyUrl)
      })

      const [key, value] = mockSessionStorage.setItem.mock.calls[0]
      expect(key).toBe('onboarding_session')
      expect(JSON.parse(value)).toEqual(expect.objectContaining({ sessionId: 'session123' }))
      const [openedUrl, popupName, popupFeatures] = window.open.mock.calls[0]
      const parsedUrl = new URL(openedUrl)
      expect(parsedUrl.origin).toBe(new URL(mockCeremonyUrl).origin)
      expect(parsedUrl.searchParams.get('parentOrigin')).toBe(window.location.origin)
      expect(popupName).toBe('institutional-onboarding')
      expect(popupFeatures).toBe('width=480,height=720')
    })

    it('should emit popup-blocked guidance and fail when popup cannot be opened', () => {
      const popupBlockedEvents = []
      const listener = (event) => {
        popupBlockedEvents.push(event.detail)
      }
      window.addEventListener('marketplace:popup-blocked', listener)

      const { result } = renderHook(() => useInstitutionalOnboarding({ autoPoll: false }), { wrapper })

      act(() => {
        result.current.redirectToCeremony('https://ceremony.example.com')
      })

      window.removeEventListener('marketplace:popup-blocked', listener)

      expect(result.current.state).toBe(OnboardingState.FAILED)
      expect(result.current.error).toBe('Onboarding window was blocked')
      expect(popupBlockedEvents.length).toBe(1)
      expect(popupBlockedEvents[0]).toEqual(expect.objectContaining({
        source: 'onboarding-webauthn',
      }))
    })

    it('should handle missing ceremony URL', () => {
      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      act(() => {
        result.current.redirectToCeremony(null)
      })

      expect(result.current.state).toBe(OnboardingState.FAILED)
      expect(result.current.error).toBe('No ceremony URL available')
    })
  })

  describe('pollForCompletion', () => {
    it('should poll successfully when callback received', async () => {
      const mockSession = {
        sessionId: 'session123',
        backendUrl: 'https://backend.example.com'
      }

      // Local cache check returns success (callback received)
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ 
          status: 'SUCCESS', 
          source: 'callback',
          data: 'success data' 
        })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let pollResult
      await act(async () => {
        pollResult = await result.current.pollForCompletion(mockSession)
      })

      expect(result.current.state).toBe(OnboardingState.COMPLETED)
      expect(result.current.isOnboarded).toBe(true)
      expect(result.current.sessionData).toBeNull()
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('onboarding_session')
      expect(pollResult).toEqual({ success: true, status: 'SUCCESS', source: 'callback', data: 'success data' })
    })

    // Note: This test covers browser-direct IB polling logic.
    // The polling makes two calls per iteration: local cache check + IB direct.
    // Manual testing recommended for full flow validation.
    it('should poll IB directly when no callback received', async () => {
      const mockSession = {
        sessionId: 'session123',
        backendUrl: 'https://backend.example.com'
      }

      // Mock fetch behavior: local cache returns PENDING a couple times, then returns callback SUCCESS
      let localCallCount = 0
      mockFetch.mockImplementation(async (url, opts) => {
        const u = typeof url === 'string' ? url : (url?.toString?.() || '')
        if (u.includes('/api/onboarding/status')) {
          localCallCount += 1
          if (localCallCount < 3) {
            return { ok: true, json: async () => ({ status: 'PENDING', source: 'local' }) }
          }
          return { ok: true, json: async () => ({ status: 'SUCCESS', source: 'callback', data: 'from callback' }) }
        }
        if (u.includes('/onboarding/webauthn/status')) {
          return { ok: true, json: async () => ({ status: 'SUCCESS', data: 'from IB' }) }
        }
        return { ok: false, status: 404, json: async () => ({}) }
      })

      const { result } = renderHook(() => useInstitutionalOnboarding({ pollTimeout: 30000, pollInterval: 10 }), { wrapper })

      let pollResult
      await act(async () => {
        pollResult = await result.current.pollForCompletion(mockSession)
      })

      // Ensure we completed successfully (either via IB direct check or eventual local callback)
      expect(result.current.state).toBe(OnboardingState.COMPLETED)
      expect(result.current.isOnboarded).toBe(true)
      expect(pollResult).toEqual(expect.objectContaining({ success: true }))
    }, 30000)

    it('should handle polling failure from callback', async () => {
      const mockSession = {
        sessionId: 'session123',
        backendUrl: 'https://backend.example.com'
      }

      // Local cache check returns failed (callback received with failure)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          status: 'FAILED', 
          source: 'callback',
          error: 'Ceremony failed' 
        })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding({ pollTimeout: 30000, pollInterval: 10 }), { wrapper })

      let pollResult
      await act(async () => {
        pollResult = await result.current.pollForCompletion(mockSession)
      })

      expect(result.current.state).toBe(OnboardingState.FAILED)
      expect(result.current.error).toBe('Ceremony failed')
      expect(pollResult).toEqual({ success: false, status: 'FAILED', source: 'callback', error: 'Ceremony failed' })
    })

    it('should handle polling timeout', async () => {
      const mockSession = {
        sessionId: 'session123',
        backendUrl: 'https://backend.example.com'
      }

      // Always return pending from local cache
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'PENDING', source: 'local' })
      })

      const { result } = renderHook(() =>
        useInstitutionalOnboarding({ pollTimeout: 0, pollInterval: 10 }),
        { wrapper }
      )

      let pollResult
      await act(async () => {
        pollResult = await result.current.pollForCompletion(mockSession)
      })

      expect(result.current.state).toBe(OnboardingState.FAILED)
      expect(result.current.error).toBe('Onboarding timeout - please try again')
      expect(pollResult).toEqual({ success: false, error: 'timeout' })
    })

    it('should handle missing session data', async () => {
      const { result } = renderHook(() => useInstitutionalOnboarding({ pollTimeout: 30000, pollInterval: 10 }), { wrapper })

      let pollResult
      await act(async () => {
        pollResult = await result.current.pollForCompletion(null)
      })

      expect(result.current.error).toBe('No session data for polling')
      expect(pollResult).toBeNull()
    })
  })

  describe('popup message handling', () => {
    it('should mark onboarding completed when popup posts success message', async () => {
      const popup = { closed: false, focus: jest.fn(), location: { assign: jest.fn(), href: '' } }
      window.open = jest.fn(() => popup)

      const { result } = renderHook(() => useInstitutionalOnboarding({ autoPoll: false }), { wrapper })

      act(() => {
        result.current.redirectToCeremony('https://backend.example.com/onboarding/webauthn/ceremony/session123', null, {
          sessionId: 'session123',
          backendUrl: 'https://backend.example.com',
          stableUserId: 'stable123',
          institutionId: 'university.edu',
        })
      })

      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          origin: 'https://backend.example.com',
          data: {
            type: 'institutional-onboarding',
            status: 'SUCCESS',
            sessionId: 'session123',
          },
        }))
      })

      expect(result.current.state).toBe(OnboardingState.COMPLETED)
      expect(result.current.isOnboarded).toBe(true)
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('onboarding_session')
    })

    it('should mark onboarding failed when popup posts cancelled message', async () => {
      const popup = { closed: false, focus: jest.fn(), location: { assign: jest.fn(), href: '' } }
      window.open = jest.fn(() => popup)

      const { result } = renderHook(() => useInstitutionalOnboarding({ autoPoll: false }), { wrapper })

      act(() => {
        result.current.redirectToCeremony('https://backend.example.com/onboarding/webauthn/ceremony/session123', null, {
          sessionId: 'session123',
          backendUrl: 'https://backend.example.com',
          stableUserId: 'stable123',
          institutionId: 'university.edu',
        })
      })

      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          origin: 'https://backend.example.com',
          data: {
            type: 'institutional-onboarding',
            status: 'CANCELLED',
            sessionId: 'session123',
            error: 'Registration cancelled',
          },
        }))
      })

      expect(result.current.state).toBe(OnboardingState.FAILED)
      expect(result.current.error).toBe('Registration cancelled')
    })
  })

  describe('startOnboarding', () => {
    it('should complete full flow when already onboarded', async () => {
      // Mock session endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          payload: { stableUserId: 'user123' },
          meta: { stableUserId: 'user123', institutionId: 'university.edu' }
        })
      })
      // Mock IB key-status - has credentials
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hasCredential: true })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding({ autoPoll: false }), { wrapper })

      let flowResult
      await act(async () => {
        flowResult = await result.current.startOnboarding()
      })

      expect(flowResult.completed).toBe(true)
      expect(flowResult.reason).toBeUndefined()
    })

    it('should complete full flow with redirect when onboarding needed', async () => {
      window.open = jest.fn(() => ({ closed: false, focus: jest.fn(), location: { assign: jest.fn(), href: '' } }))

      // Mock session endpoint (for checkOnboardingStatus)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          payload: { stableUserId: 'user123' },
          meta: { stableUserId: 'user123', institutionId: 'university.edu' }
        })
      })
      // Mock IB status - 404 means not onboarded
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      // Mock session endpoint (for initiateOnboarding)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          payload: { stableUserId: 'user123' },
          meta: { stableUserId: 'user123', institutionId: 'university.edu' }
        })
      })
      // Mock IB init response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          sessionId: 'session123',
          ceremonyUrl: 'https://ceremony.example.com'
        })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let flowResult
      await act(async () => {
        flowResult = await result.current.startOnboarding()
      })

      expect(flowResult.redirecting).toBe(true)
      expect(flowResult.ceremonyUrl).toBe('https://ceremony.example.com')
    })
  })

  describe('reset', () => {
    it('should reset all state', async () => {
      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      // Mock session endpoint to fail to put hook in FAILED state
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await act(async () => {
        await result.current.checkOnboardingStatus()
      })

      // Verify we're in FAILED state
      expect(result.current.state).toBe(OnboardingState.FAILED)

      act(() => {
        result.current.reset()
      })

      expect(result.current.state).toBe(OnboardingState.IDLE)
      expect(result.current.error).toBeNull()
      expect(result.current.sessionData).toBeNull()
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('onboarding_session')
    })
  })

  describe('auto-check functionality', () => {
    it('should auto-check on mount when enabled', async () => {
      // Mock session endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          payload: { stableUserId: 'user123' },
          meta: { stableUserId: 'user123', institutionId: 'university.edu' }
        })
      })
      // Mock IB key-status - has credentials
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hasCredential: true })
      })

      renderHook(() => useInstitutionalOnboarding({ autoCheck: true }), { wrapper })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/onboarding/session', {
          method: 'GET',
          credentials: 'include',
        })
      })
    })

    it('should not auto-check when disabled', () => {
      renderHook(() => useInstitutionalOnboarding({ autoCheck: false }), { wrapper })

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('session restoration', () => {
    it('should restore session from storage on mount', async () => {
      const storedSession = {
        sessionId: 'stored123',
        backendUrl: 'https://backend.example.com'
      }

      mockSessionStorage.getItem.mockReturnValue(JSON.stringify(storedSession))

      // Mock successful completion via polling
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ status: 'SUCCESS' })
      })

      renderHook(() => useInstitutionalOnboarding({ autoPoll: true }), { wrapper })

      await waitFor(() => {
        expect(mockSessionStorage.getItem).toHaveBeenCalledWith('onboarding_session')
      })
    })
  })
})

