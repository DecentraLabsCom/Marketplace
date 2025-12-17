import { renderHook } from '@testing-library/react'
import { getIsSSOFromOptions, useGetIsSSO } from '../getIsSSO'

jest.mock('@/context/UserContext', () => ({
  __esModule: true,
  useOptionalUser: jest.fn(() => ({ isSSO: true })),
}))

describe('getIsSSO helpers', () => {
  test('getIsSSOFromOptions returns explicit isSSO override', () => {
    expect(getIsSSOFromOptions({ isSSO: false })).toBe(false)
    expect(getIsSSOFromOptions({ isSSO: true })).toBe(true)
  })

  test('useGetIsSSO uses context when no override provided', () => {
    const { result } = renderHook(() => useGetIsSSO())
    expect(result.current).toBe(true)
  })

  test('getIsSSOFromOptions uses fallbackDuringInit when provided', () => {
    expect(getIsSSOFromOptions({ fallbackDuringInit: false })).toBe(false)
    expect(getIsSSOFromOptions({ fallbackDuringInit: true })).toBe(true)
  })

  test('getIsSSOFromOptions throws when no isSSO source available', () => {
    expect(() => getIsSSOFromOptions({})).toThrow(/isSSO not available/i)
  })
})

