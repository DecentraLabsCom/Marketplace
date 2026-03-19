/**
 * Tests for GET /api/contract/reservation/getReservation
 * Public GET, NextResponse. Requires reservationKey. Returns mapped reservation status.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'

jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })) }
}))
jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/dev/logger', () => {
  const m = { log: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { __esModule: true, default: m, devLog: m, log: m.log, warn: m.warn, error: m.error }
})
jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((err) => ({ status: 401, body: { error: err.message } })),
}))

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, body: data, json: async () => data } }
  }
}

function makeRequest(params = {}) {
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/reservation/getReservation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { requireAuth } = require('@/utils/auth/guards');
    requireAuth.mockResolvedValue({});
    getContractInstance.mockResolvedValue({
      getReservation: jest.fn().mockResolvedValue({
        labId: BigInt(1),
        renter: '0xUser',
        price: BigInt(100),
        labProvider: '0xProvider',
        start: BigInt(100),
        end: BigInt(200),
        status: BigInt(0) // Default status Pending
      }),
    })
  })

  afterEach(() => { 
    console.error.mockRestore() 
    console.warn.mockRestore()
    console.log.mockRestore()
  })

  it('returns 400 when reservationKey is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing reservationKey parameter/)
  })

  it('returns mapped reservation data on success', async () => {
    const validKey = '0x1234567890123456789012345678901234567890123456789012345678901234'
    const res = await GET(makeRequest({ reservationKey: validKey }))
    expect(res.status).toBe(200)
    expect(res.body.reservationKey).toBe(validKey)
    expect(res.body.reservation.reservationState).toBe('Pending')
    expect(res.body.reservation.renter).toBe('0xUser')
  })

  it('handles reservation not found error smoothly', async () => {
    getContractInstance.mockResolvedValue({
      getReservation: jest.fn().mockRejectedValue(new Error('execution reverted: ReservationNotFound')),
    })
    const validKey = '0x1234567890123456789012345678901234567890123456789012345678901234'
    const res = await GET(makeRequest({ reservationKey: validKey }))
    expect(res.status).toBe(200)
    expect(res.body.notFound).toBe(true)
  })

  it('returns 500 on generic contract error', async () => {
    getContractInstance.mockResolvedValue({
      getReservation: jest.fn().mockRejectedValue(new Error('RPC Error')),
    })
    const validKey = '0x1234567890123456789012345678901234567890123456789012345678901234'
    const res = await GET(makeRequest({ reservationKey: validKey }))
    expect(res.status).toBe(500)
  })
})
