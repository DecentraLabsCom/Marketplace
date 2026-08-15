/** @jest-environment node */

import {
  clearSamlTransactionStoreForTests,
  consumeSamlAssertionId,
  consumeSamlLoginTransaction,
  consumeSamlResponseId,
  createSamlLoginTransaction,
  normalizeSamlReturnTo,
} from '../samlTransactionStore'

describe('SAML transaction and replay store', () => {
  beforeEach(() => {
    clearSamlTransactionStoreForTests()
  })

  test('consumes an AuthnRequest only once when its RelayState matches', async () => {
    await createSamlLoginTransaction({ requestId: '_request-1', relayState: 'relay-state-1' })

    await expect(consumeSamlLoginTransaction({ requestId: '_request-1', relayState: 'relay-state-1' }))
      .resolves.toEqual(expect.objectContaining({ requestId: '_request-1' }))
    await expect(consumeSamlLoginTransaction({ requestId: '_request-1', relayState: 'relay-state-1' }))
      .resolves.toBeNull()
  })

  test('rejects an altered RelayState without consuming the legitimate transaction', async () => {
    await createSamlLoginTransaction({ requestId: '_request-2', relayState: 'relay-state-2' })

    await expect(consumeSamlLoginTransaction({ requestId: '_request-2', relayState: 'altered' }))
      .resolves.toBeNull()
    await expect(consumeSamlLoginTransaction({ requestId: '_request-2', relayState: 'relay-state-2' }))
      .resolves.toEqual(expect.objectContaining({ requestId: '_request-2' }))
  })

  test('persists a same-origin return path for SSO refresh', async () => {
    await createSamlLoginTransaction({
      requestId: '_request-return',
      relayState: 'relay-return',
      returnTo: '/reservation/123?step=confirm#summary',
    })

    await expect(consumeSamlLoginTransaction({
      requestId: '_request-return',
      relayState: 'relay-return',
    })).resolves.toEqual(expect.objectContaining({
      returnTo: '/reservation/123?step=confirm#summary',
    }))
  })

  test('rejects external return URLs', () => {
    expect(normalizeSamlReturnTo('https://evil.example')).toBeNull()
    expect(normalizeSamlReturnTo('//evil.example')).toBeNull()
    expect(normalizeSamlReturnTo('/safe/path')).toBe('/safe/path')
  })

  test('accepts each assertion identifier only once', async () => {
    await expect(consumeSamlAssertionId('_assertion-1')).resolves.toBe(true)
    await expect(consumeSamlAssertionId('_assertion-1')).resolves.toBe(false)
  })

  test('accepts each response identifier only once', async () => {
    await expect(consumeSamlResponseId('_response-1')).resolves.toBe(true)
    await expect(consumeSamlResponseId('_response-1')).resolves.toBe(false)
  })
})
