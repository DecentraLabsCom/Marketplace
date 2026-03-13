import { renderHook } from '@testing-library/react'
import { useGetIsSSO } from '../useGetIsSSO'

// Mock the underlying hook implementation
jest.mock('@/utils/hooks/authMode', () => ({
  __esModule: true,
  useGetIsSSO: jest.fn((options = {}) => {
    if (options.isSSO !== undefined) return options.isSSO
    if (options.fallbackDuringInit !== undefined) return options.fallbackDuringInit
    return true // default mock context value
  })
}))

describe('useGetIsSSO (re-export)', () => {
  it('returns explicit isSSO override if provided', () => {
    const { result } = renderHook(() => useGetIsSSO({ isSSO: false }))
    expect(result.current).toBe(false)
    const { result: result2 } = renderHook(() => useGetIsSSO({ isSSO: true }))
    expect(result2.current).toBe(true)
  })

  it('returns fallbackDuringInit if provided and no isSSO', () => {
    const { result } = renderHook(() => useGetIsSSO({ fallbackDuringInit: false }))
    expect(result.current).toBe(false)
    const { result: result2 } = renderHook(() => useGetIsSSO({ fallbackDuringInit: true }))
    expect(result2.current).toBe(true)
  })

  it('returns default context value if no options', () => {
    const { result } = renderHook(() => useGetIsSSO())
    expect(result.current).toBe(true)
  })
})
