/** @jest-environment node */

import {
  clearSamlTransactionStoreForTests,
  consumeSamlAssertionId,
  consumeSamlLoginTransaction,
  createSamlLoginTransaction,
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

  test('accepts each assertion identifier only once', async () => {
    await expect(consumeSamlAssertionId('_assertion-1')).resolves.toBe(true)
    await expect(consumeSamlAssertionId('_assertion-1')).resolves.toBe(false)
  })
})
