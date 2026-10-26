import { act, renderHook } from '@testing-library/react'
import useSimulationGatewaySession from '../useSimulationGatewaySession'
import { authenticateLabAccessSSO } from '@/utils/auth/labAuth'
import { establishFmuGatewaySession } from '@/utils/auth/fmuAccess'
import { useGetIsSSO } from '@/utils/hooks/authMode'

jest.mock('@/utils/auth/labAuth', () => ({ authenticateLabAccessSSO: jest.fn() }))
jest.mock('@/utils/auth/fmuAccess', () => ({ establishFmuGatewaySession: jest.fn() }))
jest.mock('@/utils/hooks/authMode', () => ({ useGetIsSSO: jest.fn() }))

describe('useSimulationGatewaySession', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    useGetIsSSO.mockReturnValue(true)
    global.fetch = jest.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  test('reuses the gateway session and renews it once after an unauthorized response', async () => {
    const success = { status: 200, ok: true }
    global.fetch.mockResolvedValueOnce({ status: 401 }).mockResolvedValueOnce(success)
    authenticateLabAccessSSO.mockResolvedValue({
      accessCode: 'one-use-code',
      labURL: 'https://gateway.example/lab',
      resourceType: 'fmu',
      reservationKey: 'reservation-1',
    })
    establishFmuGatewaySession.mockResolvedValue('https://gateway.example')
    const init = { method: 'GET' }
    const { result } = renderHook(() => useSimulationGatewaySession({
      lab: { id: 42, accessURI: 'https://gateway.example/guacamole' },
      reservationKey: 'reservation-1',
    }))

    let response
    await act(async () => { response = await result.current.fetchGateway('/api/fmu/status', init) })

    expect(response).toBe(success)
    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/fmu/status', init)
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/fmu/status', init)
    expect(authenticateLabAccessSSO).toHaveBeenCalledWith({ labId: '42', reservationKey: 'reservation-1' })
    expect(establishFmuGatewaySession).toHaveBeenCalledWith({
      accessCode: 'one-use-code',
      labId: '42',
      reservationKey: 'reservation-1',
    })
    expect(result.current.gatewaySessionOrigin).toBe('https://gateway.example')
  })

  test('does not establish a session for an SSO response bound to another reservation', async () => {
    global.fetch.mockResolvedValueOnce({ status: 401 })
    authenticateLabAccessSSO.mockResolvedValue({
      accessCode: 'one-use-code',
      labURL: 'https://gateway.example/lab',
      resourceType: 'fmu',
      reservationKey: 'reservation-2',
    })
    const { result } = renderHook(() => useSimulationGatewaySession({
      lab: { id: '42', accessURI: 'https://gateway.example/' },
      reservationKey: 'reservation-1',
    }))

    await expect(act(async () => result.current.fetchGateway('/api/fmu/status'))).rejects.toThrow(
      'Gateway returned a different FMU reservation context',
    )
    expect(establishFmuGatewaySession).not.toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
