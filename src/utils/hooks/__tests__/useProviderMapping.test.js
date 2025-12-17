import { renderHook } from '@testing-library/react'
import { useProviderMapping } from '../useProviderMapping'

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

jest.mock('@/hooks/user/useUsers', () => ({
  __esModule: true,
  USER_QUERY_CONFIG: { retry: false },
  useGetLabProviders: jest.fn(() => ({
    data: {
      providers: [
        { account: '0xabc', name: 'UNED', email: 'a@uned.es', country: 'ES' },
        { account: '0xdef', name: 'UHU', email: 'b@uhu.es', country: 'ES' },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
  })),
}))

describe('useProviderMapping', () => {
  test('maps owner addresses to provider objects and names', () => {
    const { result } = renderHook(() => useProviderMapping())

    expect(result.current.providersCount).toBe(2)
    expect(result.current.getProviderName('0xAbC')).toBe('UNED')
    expect(result.current.getProviderName('0x123')).toBe('Unknown Provider')
    expect(result.current.mapOwnerToProvider('0xdef')?.email).toBe('b@uhu.es')
  })

  test('maps multiple owners and supports debug mapping', () => {
    const { result } = renderHook(() => useProviderMapping())

    const mapped = result.current.mapMultipleOwners(['0xabc', '0x000', null])
    expect(mapped['0xabc']?.name).toBe('UNED')
    expect(mapped['0x000']).toBeNull()

    expect(result.current.mapOwnerToProviderWithDebug('0xdef', { debug: true })?.name).toBe('UHU')
  })
})

