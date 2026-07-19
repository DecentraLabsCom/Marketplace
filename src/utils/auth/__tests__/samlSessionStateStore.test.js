/** @jest-environment node */

import {
  clearSamlSessionBinding,
  clearSamlSessionStateForTests,
  getFmuCapabilitiesForSession,
  getSamlSessionIds,
  registerFmuCapabilityForSession,
  registerSamlSessionBinding,
} from '../samlSessionStateStore'

describe('samlSessionStateStore', () => {
  const sessionId = 'a'.repeat(43)
  const nameId = 'name-id-1'
  const sessionIndex = 'session-index-1'
  const context = {
    labId: '42',
    reservationKey: 'reservation-1',
    gatewayOrigin: 'https://lab.example',
    resourceSessionId: 'resource-session-1',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    userBinding: 'b'.repeat(43),
  }

  beforeEach(() => {
    clearSamlSessionStateForTests()
  })

  test('persists the SAML binding and encrypted capability snapshot across reads', async () => {
    await registerSamlSessionBinding({ sessionId, nameId, sessionIndex, ttlSeconds: 300 })
    await registerFmuCapabilityForSession({ sessionId, context, ttlSeconds: 300 })

    await expect(getSamlSessionIds(nameId, sessionIndex)).resolves.toEqual([sessionId])
    await expect(getFmuCapabilitiesForSession(sessionId)).resolves.toEqual([context])
  })

  test('clears the durable SAML binding', async () => {
    await registerSamlSessionBinding({ sessionId, nameId, sessionIndex, ttlSeconds: 300 })
    await clearSamlSessionBinding(nameId, sessionIndex)

    await expect(getSamlSessionIds(nameId, sessionIndex)).resolves.toEqual([])
  })
})
