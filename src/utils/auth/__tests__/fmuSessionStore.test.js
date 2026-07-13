/**
 * @jest-environment node
 */

import {
  FMU_CONTEXT_COOKIE,
  encodeFmuContexts,
  findFmuContext,
  readFmuContexts,
} from '../fmuSessionStore'
import { resolveFmuGatewayHeaders } from '../fmuGatewayContext'

describe('FMU Marketplace session contexts', () => {
  const originalSecret = process.env.SESSION_SECRET

  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters'
  })

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = originalSecret
  })

  function context(reservationKey, jti) {
    return {
      labId: '42',
      reservationKey,
      gatewayOrigin: 'https://gateway.example.com',
      jti,
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    }
  }

  function requestWith(encoded) {
    return new Request('https://marketplace.example.com/api/simulations/history', {
      headers: { Cookie: `${FMU_CONTEXT_COOKIE}=${encoded}` },
    })
  }

  test('keeps multiple reservations and selects exactly one gateway credential', () => {
    const first = encodeFmuContexts([], context('0xaaa', 'session_identifier_aaaaaaaa'))
    const second = encodeFmuContexts(first.contexts, context('0xbbb', 'session_identifier_bbbbbbbb'))
    const request = requestWith(second.encoded)

    expect(readFmuContexts(request)).toHaveLength(2)
    expect(findFmuContext(request, {
      labId: '42',
      reservationKey: '0xaaa',
      gatewayOrigin: 'https://gateway.example.com',
    })).toMatchObject({ jti: 'session_identifier_aaaaaaaa' })
    expect(resolveFmuGatewayHeaders(request, {
      labId: '42',
      reservationKey: '0xbbb',
      gatewayOrigin: 'https://gateway.example.com',
    })).toEqual({ Cookie: 'FMU_SESSION=session_identifier_bbbbbbbb' })
  })

  test('fails closed for tampering or an ambiguous lab-only lookup', () => {
    const first = encodeFmuContexts([], context('0xaaa', 'session_identifier_aaaaaaaa'))
    const second = encodeFmuContexts(first.contexts, context('0xbbb', 'session_identifier_bbbbbbbb'))
    const request = requestWith(second.encoded)

    expect(findFmuContext(request, {
      labId: '42',
      gatewayOrigin: 'https://gateway.example.com',
    })).toBeNull()

    const tampered = `${second.encoded[0] === 'A' ? 'B' : 'A'}${second.encoded.slice(1)}`
    expect(readFmuContexts(requestWith(tampered))).toEqual([])
  })

  test('bounds the number of contexts stored in the single cookie', () => {
    let contexts = []
    let encoded
    for (let index = 0; index < 10; index += 1) {
      const result = encodeFmuContexts(
        contexts,
        context(`0x${index}`, `session_identifier_${String(index).padStart(16, '0')}`),
      )
      contexts = result.contexts
      encoded = result.encoded
    }

    expect(contexts).toHaveLength(6)
    expect(encoded.length).toBeLessThanOrEqual(3800)
  })
})
