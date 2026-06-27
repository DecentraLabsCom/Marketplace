/**
 * @jest-environment node
 */

const mockRequireAuth = jest.fn()
const mockRequireLabOwner = jest.fn()
const mockHandleGuardError = jest.fn((error) =>
  Response.json({ error: error.message, code: error.code }, { status: error.status })
)
const mockGetContractInstance = jest.fn()

class HttpError extends Error {
  constructor(message, status = 500, code = 'HTTP_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

class ForbiddenError extends HttpError {
  constructor(message, code = 'FORBIDDEN') {
    super(message, 403, code)
  }
}

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, options = {}) => Response.json(body, options)),
  },
}))

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: (...args) => mockRequireAuth(...args),
  requireProviderRole: jest.fn(), // no-op: tests focus on ownership, not provider role
  requireLabOwner: (...args) => mockRequireLabOwner(...args),
  handleGuardError: (...args) => mockHandleGuardError(...args),
  HttpError,
  BadRequestError: class BadRequestError extends HttpError {
    constructor(message) {
      super(message, 400, 'BAD_REQUEST')
    }
  },
}))

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: (...args) => mockGetContractInstance(...args),
}))

describe('/api/provider/saveLabData route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockRequireLabOwner.mockResolvedValue(undefined)
    mockGetContractInstance.mockResolvedValue({
      tokenURI: jest.fn().mockResolvedValue('Lab-provider-8.json'),
    })
  })

  test('returns 403 creator mismatch when requireLabOwner blocks SSO user', async () => {
    mockRequireLabOwner.mockRejectedValueOnce(
      new ForbiddenError('No eres el creador de este laboratorio', 'LAB_CREATOR_MISMATCH')
    )

    const { POST } = await import('../api/provider/saveLabData/route.js')

    const req = new Request('http://localhost/api/provider/saveLabData', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labData: {
          id: 7,
          uri: 'Lab-provider-7.json',
        },
      }),
    })

    const res = await POST(req)

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      error: 'No eres el creador de este laboratorio',
      code: 'LAB_CREATOR_MISMATCH',
    })
    expect(mockHandleGuardError).toHaveBeenCalled()
  })

  test('writes ERC-721 attribute metadata for calendar-period pricing', async () => {
    const { promises: fs } = await import('fs')
    const path = await import('path')
    const uri = 'Lab-provider-8.json'

    await fs.rm(path.join(process.cwd(), 'data', uri), { force: true }).catch(() => {})

    const { POST } = await import('../api/provider/saveLabData/route.js')

    const req = new Request('http://localhost/api/provider/saveLabData', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labData: {
          id: 8,
          uri,
          name: 'Long booking lab',
          description: 'A lab with weekly booking periods',
          images: ['https://example.edu/lab.png', 'https://example.edu/side.png'],
          category: ['1.3'],
          keywords: ['remote', 'weekly'],
          price: '100',
          priceUnit: 'week',
          allowedDurationRange: { unit: 'week', min: 1, max: 2 },
          opens: 1749945600,
          closes: 1767139200,
          availableDays: ['MONDAY'],
          availableHours: { start: '09:00', end: '17:00' },
          timezone: 'Europe/Madrid',
        },
      }),
    })

    const res = await POST(req)
    const body = await res.json()

    await fs.rm(path.join(process.cwd(), 'data', uri), { force: true }).catch(() => {})

    expect(res.status).toBe(200)
    expect(body.metadata).toEqual(expect.objectContaining({
      name: 'Long booking lab',
      description: 'A lab with weekly booking periods',
      image: 'https://example.edu/lab.png',
    }))
    expect(body.metadata).not.toHaveProperty('category')
    expect(body.metadata).not.toHaveProperty('keywords')
    expect(body.metadata).not.toHaveProperty('pricing')
    expect(body.metadata).not.toHaveProperty('bookingMode')

    const attributes = Object.fromEntries(
      body.metadata.attributes.map((attr) => [attr.trait_type, attr.value])
    )
    expect(attributes.category).toBeUndefined()
    expect(attributes.classification).toEqual([
      {
        scheme: 'OECD-FORD',
        schemeVersion: 'Frascati Manual 2015',
        code: '1.3',
        label: 'Physical sciences',
      },
    ])
    expect(attributes.pricing).toEqual(expect.objectContaining({
      displayAmount: '100',
      displayUnit: 'week',
      billingMode: 'linear-duration',
    }))
    expect(attributes.bookingMode).toBe('calendar-period')
    expect(attributes.allowedDurationRange).toEqual({ unit: 'week', min: 1, max: 2 })
    expect(attributes.allowedDurations).toEqual([
      { unit: 'week', value: 1 },
      { unit: 'week', value: 2 },
    ])
    expect(attributes.periodRules).toEqual(expect.objectContaining({
      startGranularity: 'day',
      allowCustomDateRange: true,
      minDurationDays: 7,
      maxDurationDays: 14,
    }))
  })
})
