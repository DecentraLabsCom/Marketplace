import {
  storeOnboardingResult,
  getOnboardingResult,
  findResultByUser,
  clearOnboardingResult,
  clearUserResults,
  getStoreStats,
} from '../onboardingResultStore'

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    moduleLoaded: jest.fn(),
  },
}))

describe('onboardingResultStore', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-01-01T00:00:00Z'))

    // Clear any leftovers from other tests (module-level in-memory store)
    const keys = getStoreStats().keys
    keys.forEach((key) => clearOnboardingResult(key))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('stores and retrieves results by key', () => {
    storeOnboardingResult('user-1', { status: 'completed', stableUserId: 'user-1', institutionId: 'uned.es' })
    const result = getOnboardingResult('user-1')
    expect(result.status).toBe('completed')
    expect(result.stableUserId).toBe('user-1')
    expect(typeof result.receivedAt).toBe('string')
    expect(typeof result.expiresAt).toBe('number')
  })

  test('finds result by user and institution (direct or composite)', () => {
    storeOnboardingResult('user-2', { status: 'pending', stableUserId: 'user-2', institutionId: 'uned.es' })
    storeOnboardingResult('user-3:uhu.es', { status: 'completed', stableUserId: 'user-3', institutionId: 'uhu.es' })

    expect(findResultByUser('user-2', 'uned.es')?.status).toBe('pending')
    expect(findResultByUser('user-3', 'uhu.es')?.status).toBe('completed')
    expect(findResultByUser('user-3', 'uned.es')).toBeNull()
  })

  test('clears results by key and by user', () => {
    storeOnboardingResult('user-4', { status: 'completed', stableUserId: 'user-4', institutionId: 'uned.es' })
    storeOnboardingResult('user-4:uned.es', { status: 'completed', stableUserId: 'user-4', institutionId: 'uned.es' })

    expect(getStoreStats().count).toBe(2)
    expect(clearOnboardingResult('user-4')).toBe(true)
    clearUserResults('user-4')
    expect(getStoreStats().count).toBe(0)
  })

  test('expires old results after TTL', () => {
    storeOnboardingResult('user-5', { status: 'completed', stableUserId: 'user-5', institutionId: 'uned.es' })
    expect(getOnboardingResult('user-5')).not.toBeNull()

    jest.advanceTimersByTime(10 * 60 * 1000 + 1)
    expect(getOnboardingResult('user-5')).toBeNull()
    expect(getStoreStats().count).toBe(0)
  })
})
