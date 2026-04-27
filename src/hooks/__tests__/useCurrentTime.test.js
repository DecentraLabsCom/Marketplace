import { renderHook } from '@testing-library/react'
import useCurrentTime from '../useCurrentTime'

describe('useCurrentTime', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  test('schedules updates with the provided interval', () => {
    jest.useFakeTimers()
    const setIntervalSpy = jest.spyOn(global, 'setInterval')

    renderHook(() => useCurrentTime({ intervalMs: 30000 }))

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30000)
  })
})
