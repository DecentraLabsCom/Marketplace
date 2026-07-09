/**
 * @jest-environment node
 */

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { requireAuth } from '@/utils/auth/guards'

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((error) => Response.json({ error: error.message }, { status: error.status || 401 })),
}))

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}))

const reservationKey = `0x${'a'.repeat(64)}`

const baseReservation = {
  labId: 7n,
  renter: '0x1111111111111111111111111111111111111111',
  price: 1000n,
  labProvider: '0x2222222222222222222222222222222222222222',
  start: 1710489600n,
  end: 1710496800n,
  puc: '0x1234',
  requestPeriodStart: 0n,
  requestPeriodDuration: 0n,
  payerInstitution: '0x3333333333333333333333333333333333333333',
  collectorInstitution: '0x4444444444444444444444444444444444444444',
  providerShare: 900n,
}

describe('/api/contract/reservation/getReservation route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ userid: 'user@example.edu' })
  })

  test('labels status 2 as access authorized', async () => {
    getContractInstance.mockResolvedValue({
      getReservation: jest.fn().mockResolvedValue({
        ...baseReservation,
        status: 2n,
      }),
    })

    const { GET } = await import('../api/contract/reservation/getReservation/route.js')
    const req = new Request(`http://localhost/api/contract/reservation/getReservation?reservationKey=${reservationKey}`)

    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.reservation).toMatchObject({
      status: 2,
      reservationState: 'Access Authorized',
      isAccessAuthorized: true,
      isActive: true,
      isConfirmed: true,
    })
  })
})
