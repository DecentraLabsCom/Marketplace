import { GET, POST } from '../route'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockCookieStore = {
  set: jest.fn(),
  get: jest.fn(),
}

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({
      status: init?.status ?? 200,
      body: data,
      headers: {
        set: jest.fn(),
        get: jest.fn(),
      },
      json: async () => data,
    })),
  },
}))
jest.mock('ethers', () => ({
  verifyMessage: jest.fn(),
}))
jest.mock('@/utils/auth/sessionCookie', () => ({
  createSessionCookie: jest.fn(),
  getSessionFromCookies: jest.fn(),
}))
jest.mock('@/utils/auth/guards', () => ({
  isValidAddress: jest.fn(),
}))
jest.mock('@/utils/auth/walletSessionChallenge', () => ({
  canIssueWalletSessionChallenge: jest.fn(),
  isWalletSessionSignatureRequired: jest.fn(),
  issueWalletSessionChallenge: jest.fn(),
  verifyWalletSessionChallenge: jest.fn(),
}))
jest.mock('@/utils/dev/logger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}))

import { cookies } from 'next/headers'
import { verifyMessage } from 'ethers'
import {
  createSessionCookie,
  getSessionFromCookies,
} from '@/utils/auth/sessionCookie'
import { isValidAddress } from '@/utils/auth/guards'
import {
  canIssueWalletSessionChallenge,
  isWalletSessionSignatureRequired,
  issueWalletSessionChallenge,
  verifyWalletSessionChallenge,
} from '@/utils/auth/walletSessionChallenge'
import { NextResponse } from 'next/server'

const VALID_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'

function makeRequest(url, body = null, method = 'GET') {
  return {
    url: `http://localhost${url}`,
    method,
    headers: {
      get: (key) => (key === 'origin' ? 'http://localhost' : null),
    },
    json: async () => body,
  }
}

// ── GET tests ─────────────────────────────────────────────────────────────

describe('GET /api/auth/wallet-session', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    cookies.mockResolvedValue(mockCookieStore)
    isValidAddress.mockReturnValue(true)
    canIssueWalletSessionChallenge.mockReturnValue(true)
  })

  it('returns 400 for missing wallet address', async () => {
    isValidAddress.mockReturnValue(false)
    const req = makeRequest('/api/auth/wallet-session')
    const res = await GET(req)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid wallet address/i)
  })

  it('returns 400 for invalid wallet address', async () => {
    isValidAddress.mockReturnValue(false)
    const req = makeRequest(`/api/auth/wallet-session?walletAddress=bad`)
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 503 when challenge issuance is unavailable', async () => {
    canIssueWalletSessionChallenge.mockReturnValue(false)
    const req = makeRequest(`/api/auth/wallet-session?walletAddress=${VALID_ADDRESS}`)
    const res = await GET(req)
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/unavailable/i)
  })

  it('issues a challenge for a valid wallet', async () => {
    issueWalletSessionChallenge.mockReturnValue({
      challenge: 'sign-this-message',
      expiresAt: 9999999999,
      ttlSeconds: 300,
    })
    const req = makeRequest(`/api/auth/wallet-session?walletAddress=${VALID_ADDRESS}`)
    const res = await GET(req)
    expect(issueWalletSessionChallenge).toHaveBeenCalledWith({
      walletAddress: VALID_ADDRESS,
      origin: 'http://localhost',
    })
    expect(res.body.success).toBe(true)
    expect(res.body.challenge).toBe('sign-this-message')
  })
})

// ── POST tests ────────────────────────────────────────────────────────────

describe('POST /api/auth/wallet-session', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    cookies.mockResolvedValue(mockCookieStore)
    isValidAddress.mockReturnValue(true)
    getSessionFromCookies.mockReturnValue(null)
    isWalletSessionSignatureRequired.mockReturnValue(false)
    createSessionCookie.mockReturnValue([
      { name: 'session', value: 'token', httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 3600 },
    ])
  })

  it('returns 400 for invalid wallet address', async () => {
    isValidAddress.mockReturnValue(false)
    const req = makeRequest('/api/auth/wallet-session', { walletAddress: 'bad' }, 'POST')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns success immediately when valid wallet session already exists', async () => {
    getSessionFromCookies.mockReturnValue({
      authType: 'wallet',
      wallet: VALID_ADDRESS,
    })
    const req = makeRequest('/api/auth/wallet-session', { walletAddress: VALID_ADDRESS }, 'POST')
    const res = await POST(req)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toMatch(/already active/i)
  })

  it('creates session in legacy mode (no signature required, none provided)', async () => {
    isWalletSessionSignatureRequired.mockReturnValue(false)
    const req = makeRequest('/api/auth/wallet-session', { walletAddress: VALID_ADDRESS }, 'POST')
    const res = await POST(req)
    expect(createSessionCookie).toHaveBeenCalled()
    expect(res.body.success).toBe(true)
    expect(res.body.signatureVerified).toBe(false)
  })

  it('returns 401 when signature required but none provided', async () => {
    isWalletSessionSignatureRequired.mockReturnValue(true)
    const req = makeRequest('/api/auth/wallet-session', { walletAddress: VALID_ADDRESS }, 'POST')
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MISSING_SIGNATURE')
  })

  it('returns 400 for partial signature payload (challenge without signature)', async () => {
    const req = makeRequest(
      '/api/auth/wallet-session',
      { walletAddress: VALID_ADDRESS, challenge: 'sign-me' },
      'POST',
    )
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_SIGNATURE_PAYLOAD')
  })

  it('returns 401 when signature verification fails', async () => {
    verifyWalletSessionChallenge.mockReturnValue({ ok: true, payload: {} })
    verifyMessage.mockReturnValue('0xDIFFERENT')
    const req = makeRequest(
      '/api/auth/wallet-session',
      { walletAddress: VALID_ADDRESS, challenge: 'sign-me', signature: '0xsig' },
      'POST',
    )
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('creates session with signatureVerified=true on valid signature', async () => {
    verifyWalletSessionChallenge.mockReturnValue({ ok: true, payload: {} })
    verifyMessage.mockReturnValue(VALID_ADDRESS)
    const req = makeRequest(
      '/api/auth/wallet-session',
      { walletAddress: VALID_ADDRESS, challenge: 'sign-me', signature: '0xsig' },
      'POST',
    )
    const res = await POST(req)
    expect(createSessionCookie).toHaveBeenCalled()
    expect(res.body.success).toBe(true)
    expect(res.body.signatureVerified).toBe(true)
  })
})
