import { deriveIntentNonce } from '../intentNonceStore'

describe('deriveIntentNonce', () => {
  test('derives stable unordered nonce from request id', () => {
    const requestId = `0x${'12'.repeat(32)}`

    const expected = BigInt(requestId) & ((1n << 63n) - 1n)
    expect(deriveIntentNonce(requestId)).toBe(expected)
    expect(deriveIntentNonce(requestId)).toBe(expected)
  })

  test('keeps concurrent request ids independent', () => {
    const first = deriveIntentNonce(`0x${'01'.repeat(32)}`)
    const second = deriveIntentNonce(`0x${'02'.repeat(32)}`)

    expect(first).not.toBe(second)
  })

  test.each(['', '0x1234', `0x${'00'.repeat(32)}`])('rejects invalid request id %p', (requestId) => {
    expect(() => deriveIntentNonce(requestId)).toThrow(/requestId/i)
  })
})
