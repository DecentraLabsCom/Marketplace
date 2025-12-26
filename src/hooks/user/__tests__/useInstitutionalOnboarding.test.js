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
}

const wrapper = ({ children }) => children

describe('useInstitutionalOnboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseUser.mockReturnValue(mockUserContext)
    mockSessionStorage.getItem.mockReturnValue(null)
    mockSessionStorage.setItem.mockImplementation(() => {})
    mockSessionStorage.removeItem.mockImplementation(() => {})
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
      expect(result.current.hasGateway).toBe(true)
    })
  })

  describe('checkOnboardingStatus', () => {
    it('should return NOT_NEEDED for non-SSO users', async () => {
      // Mock non-SSO user
      mockUseUser.mockReturnValueOnce({ isSSO: false, user: null })

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
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          isOnboarded: false,
          gatewayUrl: 'https://gateway.example.com'
        })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let statusResult
      await act(async () => {
        statusResult = await result.current.checkOnboardingStatus()
      })

      expect(mockFetch).toHaveBeenCalledWith('/api/onboarding/init', {
        method: 'GET',
        credentials: 'include',
      })
      expect(result.current.state).toBe(OnboardingState.REQUIRED)
      expect(result.current.isOnboarded).toBe(false)
      expect(statusResult.needed).toBe(true)
      expect(statusResult.gatewayUrl).toBe('https://gateway.example.com')
    })

    it('should handle successful check - already onboarded', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ isOnboarded: true })
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

    it('should handle NO_GATEWAY error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          error: 'NO_GATEWAY_CONFIGURED'
        })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let statusResult
      await act(async () => {
        statusResult = await result.current.checkOnboardingStatus()
      })

      expect(result.current.state).toBe(OnboardingState.NO_GATEWAY)
      expect(result.current.isOnboarded).toBe(false)
      expect(statusResult.needed).toBe(false)
      expect(statusResult.noGateway).toBe(true)
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
      mockUseUser.mockReturnValueOnce({ isSSO: false, user: null })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let resultData
      await act(async () => {
        resultData = await result.current.initiateOnboarding()
      })

      expect(result.current.state).toBe(OnboardingState.FAILED)
      expect(result.current.error).toBe('SSO session required')
      expect(resultData).toBeNull()
    })

    it('should handle successful initiation', async () => {
      const mockResponse = {
        sessionId: 'session123',
        ceremonyUrl: 'https://ceremony.example.com',
        gatewayUrl: 'https://gateway.example.com',
        stableUserId: 'stable123',
        institutionId: 'inst123'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let resultData
      await act(async () => {
        resultData = await result.current.initiateOnboarding()
      })

      expect(mockFetch).toHaveBeenCalledWith('/api/onboarding/init', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      expect(result.current.state).toBe(OnboardingState.REDIRECTING)
      expect(result.current.sessionData).toEqual(mockResponse)
      expect(resultData).toEqual(mockResponse)
    })

    it('should handle already onboarded response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'already_onboarded' })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let resultData
      await act(async () => {
        resultData = await result.current.initiateOnboarding()
      })

      expect(result.current.state).toBe(OnboardingState.NOT_NEEDED)
      expect(result.current.isOnboarded).toBe(true)
      expect(resultData).toEqual({ alreadyOnboarded: true })
    })

    it('should handle initiation errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let resultData
      await act(async () => {
        resultData = await result.current.initiateOnboarding()
      })

      expect(result.current.state).toBe(OnboardingState.FAILED)
      expect(result.current.error).toBe('Server error')
      expect(resultData).toBeNull()
    })
  })

  describe('redirectToCeremony', () => {
    it('should store session data and redirect', async () => {
      const mockCeremonyUrl = 'https://ceremony.example.com'
      const mockSessionData = {
        sessionId: 'session123',
        ceremonyUrl: mockCeremonyUrl,
        gatewayUrl: 'https://gateway.example.com',
        stableUserId: 'stable123',
        institutionId: 'inst123'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSessionData)
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      await act(async () => {
        await result.current.initiateOnboarding()
      })

      act(() => {
        result.current.redirectToCeremony(mockCeremonyUrl)
      })

      const [key, value] = mockSessionStorage.setItem.mock.calls[0]
      expect(key).toBe('onboarding_session')
      expect(JSON.parse(value)).toEqual(expect.objectContaining({ sessionId: 'session123' }))
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
    it('should poll successfully for completion', async () => {
      const mockSession = {
        sessionId: 'session123',
        gatewayUrl: 'https://gateway.example.com'
      }

      // First call returns pending, second returns success
      mockFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ status: 'PENDING' })
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ status: 'SUCCESS', data: 'success data' })
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
      expect(pollResult).toEqual({ success: true, status: 'SUCCESS', data: 'success data' })
    })

    it('should handle polling failure', async () => {
      const mockSession = {
        sessionId: 'session123',
        gatewayUrl: 'https://gateway.example.com'
      }

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ status: 'FAILED', error: 'Ceremony failed' })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let pollResult
      await act(async () => {
        pollResult = await result.current.pollForCompletion(mockSession)
      })

      expect(result.current.state).toBe(OnboardingState.FAILED)
      expect(result.current.error).toBe('Ceremony failed')
      expect(pollResult).toEqual({ success: false, status: 'FAILED', error: 'Ceremony failed' })
    })

    it('should handle polling timeout', async () => {
      const mockSession = {
        sessionId: 'session123',
        gatewayUrl: 'https://gateway.example.com'
      }

      // Always return pending
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ status: 'PENDING' })
      })

      const { result } = renderHook(() =>
        useInstitutionalOnboarding({ pollTimeout: 0 }),
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
      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let pollResult
      await act(async () => {
        pollResult = await result.current.pollForCompletion(null)
      })

      expect(result.current.error).toBe('No session data for polling')
      expect(pollResult).toBeNull()
    })
  })

  describe('startOnboarding', () => {
    it('should complete full flow when onboarding not needed', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ isOnboarded: true })
      })

      const { result } = renderHook(() => useInstitutionalOnboarding(), { wrapper })

      let flowResult
      await act(async () => {
        flowResult = await result.current.startOnboarding()
      })

      expect(flowResult.completed).toBe(true)
      expect(flowResult.reason).toBeUndefined()
    })

    it('should complete full flow with redirect when onboarding needed', async () => {
      const mockInitResponse = {
        sessionId: 'session123',
        ceremonyUrl: 'https://ceremony.example.com',
        gatewayUrl: 'https://gateway.example.com'
      }

      mockFetch
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ isOnboarded: false, gatewayUrl: 'https://gateway.example.com' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockInitResponse)
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

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await act(async () => {
        await result.current.checkOnboardingStatus()
      })

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
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ isOnboarded: true })
      })

      renderHook(() => useInstitutionalOnboarding({ autoCheck: true }), { wrapper })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/onboarding/init', {
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
        gatewayUrl: 'https://gateway.example.com'
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
