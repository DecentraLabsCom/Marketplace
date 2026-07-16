/** @jest-environment node */

jest.mock('@/utils/auth/sso', () => ({
  createServiceProvider: jest.fn(),
  createIdentityProvider: jest.fn(),
  parseSAMLResponse: jest.fn(),
  createSession: jest.fn(),
}))

jest.mock('@/utils/auth/samlTransactionStore', () => ({
  createSamlLoginTransaction: jest.fn(),
  consumeSamlLoginTransaction: jest.fn(),
  consumeSamlAssertionId: jest.fn(),
}))

import { createIdentityProvider, createServiceProvider, createSession, parseSAMLResponse } from '@/utils/auth/sso'
import {
  consumeSamlAssertionId,
  consumeSamlLoginTransaction,
  createSamlLoginTransaction,
} from '@/utils/auth/samlTransactionStore'
import { POST } from '../callback/route'
import { GET } from '../login/route'

const encodeResponse = (xml) => Buffer.from(xml, 'utf8').toString('base64')

describe('SAML routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_BASE_URL = 'https://market.example'
  })

  test('stores an AuthnRequest and an unguessable RelayState before redirecting', async () => {
    const serviceProvider = {
      create_login_request_url: jest.fn((idp, options, callback) => {
        callback(null, 'https://idp.example/sso', '_request-1')
      }),
    }
    createServiceProvider.mockReturnValue(serviceProvider)
    createIdentityProvider.mockResolvedValue({})
    createSamlLoginTransaction.mockResolvedValue({})

    const response = await GET()

    expect(response.status).toBe(307)
    expect(createSamlLoginTransaction).toHaveBeenCalledWith({
      requestId: '_request-1',
      relayState: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    })
    expect(serviceProvider.create_login_request_url).toHaveBeenCalledWith(
      {},
      { relay_state: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) },
      expect.any(Function),
    )
  })

  test('requires a correlated AuthnRequest and records the assertion ID before creating a session', async () => {
    const samlResponse = encodeResponse(
      '<samlp:Response ID="_response-1" InResponseTo="_request-1"><saml:Assertion ID="_assertion-1" /></samlp:Response>',
    )
    consumeSamlLoginTransaction.mockResolvedValue({ requestId: '_request-1' })
    parseSAMLResponse.mockResolvedValue({ id: 'user-1', email: 'user@example.com' })
    consumeSamlAssertionId.mockResolvedValue(true)

    const response = await POST({
      headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded' }),
      nextUrl: new URL('https://market.example/api/auth/sso/saml2/callback'),
      text: async () => new URLSearchParams({ SAMLResponse: samlResponse, RelayState: 'relay-1' }).toString(),
    })

    expect(response.status).toBe(303)
    expect(consumeSamlLoginTransaction).toHaveBeenCalledWith({
      requestId: '_request-1',
      relayState: 'relay-1',
    })
    expect(consumeSamlAssertionId).toHaveBeenCalledWith('_assertion-1')
    expect(createSession).toHaveBeenCalledWith(response, { id: 'user-1', email: 'user@example.com' })
  })

  test('rejects a replayed or uncorrelated SAML response before parsing identity claims', async () => {
    const samlResponse = encodeResponse(
      '<samlp:Response ID="_response-1" InResponseTo="_request-1"><saml:Assertion ID="_assertion-1" /></samlp:Response>',
    )
    consumeSamlLoginTransaction.mockResolvedValue(null)

    const response = await POST({
      headers: new Headers(),
      nextUrl: new URL('https://market.example/api/auth/sso/saml2/callback'),
      text: async () => new URLSearchParams({ SAMLResponse: samlResponse, RelayState: 'replayed' }).toString(),
    })

    expect(response.status).toBe(400)
    expect(parseSAMLResponse).not.toHaveBeenCalled()
    expect(consumeSamlAssertionId).not.toHaveBeenCalled()
  })
})
