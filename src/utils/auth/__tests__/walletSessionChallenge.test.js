import {
  canIssueWalletSessionChallenge,
  isWalletSessionSignatureRequired,
  issueWalletSessionChallenge,
  verifyWalletSessionChallenge,
} from '@/utils/auth/walletSessionChallenge'

const TEST_WALLET = '0x1111111111111111111111111111111111111111'
const TEST_ORIGIN = 'https://marketplace.example'

describe('walletSessionChallenge', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.WALLET_SESSION_CHALLENGE_SECRET
    delete process.env.SESSION_SECRET
    delete process.env.WALLET_SESSION_REQUIRE_SIGNATURE
    delete process.env.WALLET_SESSION_CHALLENGE_TTL_SECONDS
  })

  afterAll(() => {
    process.env = originalEnv
  })

  test('issues and verifies challenge with SESSION_SECRET fallback', () => {
    process.env.SESSION_SECRET = 'a'.repeat(64)

    const issued = issueWalletSessionChallenge({
      walletAddress: TEST_WALLET,
      origin: TEST_ORIGIN,
      ttlSeconds: 120,
    })

    expect(typeof issued.challenge).toBe('string')
    expect(issued.ttlSeconds).toBe(120)

    const verified = verifyWalletSessionChallenge(issued.challenge, {
      walletAddress: TEST_WALLET,
      origin: TEST_ORIGIN,
    })

    expect(verified.ok).toBe(true)
    expect(verified.payload.wallet).toBe(TEST_WALLET.toLowerCase())
  })

  test('rejects wallet mismatch', () => {
    process.env.SESSION_SECRET = 'b'.repeat(64)
    const issued = issueWalletSessionChallenge({ walletAddress: TEST_WALLET })

    const verified = verifyWalletSessionChallenge(issued.challenge, {
      walletAddress: '0x2222222222222222222222222222222222222222',
    })

    expect(verified.ok).toBe(false)
    expect(verified.code).toBe('WALLET_MISMATCH')
  })

  test('reports unavailable challenges when no secret is configured', () => {
    expect(canIssueWalletSessionChallenge()).toBe(false)
    const verified = verifyWalletSessionChallenge('token')
    expect(verified.ok).toBe(false)
    expect(verified.code).toBe('CHALLENGE_UNAVAILABLE')
  })

  test('reads strict mode from env', () => {
    expect(isWalletSessionSignatureRequired()).toBe(false)
    process.env.WALLET_SESSION_REQUIRE_SIGNATURE = 'true'
    expect(isWalletSessionSignatureRequired()).toBe(true)
  })
})
