/** @jest-environment node */

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/utils/auth/sessionCookie', () => ({ clearSessionCookies: jest.fn() }))
jest.mock('@/utils/auth/fmuSessionStore', () => ({ clearFmuContextCookie: jest.fn() }))
jest.mock('@/utils/auth/revokeFmuContexts', () => ({ revokeFmuContexts: jest.fn() }))
jest.mock('@/utils/auth/samlLogoutReplayStore', () => ({
  consumeSamlLogoutRequestId: jest.fn(),
}))
jest.mock('@/utils/auth/sso', () => ({
  createIdentityProvider: jest.fn(),
  createServiceProvider: jest.fn(),
}))
jest.mock('@/utils/auth/samlLogoutSecurity', () => ({
  decodeSamlLogoutRequest: jest.fn(),
  extractSamlLogoutRequest: jest.fn(),
  verifySamlLogoutRequestSignature: jest.fn(),
}))

import { cookies } from 'next/headers'
import { clearSessionCookies } from '@/utils/auth/sessionCookie'
import { clearFmuContextCookie } from '@/utils/auth/fmuSessionStore'
import { revokeFmuContexts } from '@/utils/auth/revokeFmuContexts'
import { consumeSamlLogoutRequestId } from '@/utils/auth/samlLogoutReplayStore'
import { createIdentityProvider, createServiceProvider } from '@/utils/auth/sso'
import {
  decodeSamlLogoutRequest,
  extractSamlLogoutRequest,
  verifySamlLogoutRequestSignature,
} from '@/utils/auth/samlLogoutSecurity'
import { POST } from '../route'

const issuer = 'https://idp.example/entity'

function requestWithBody(body, contentType = 'application/x-www-form-urlencoded') {
  return {
    url: 'https://market.example/api/auth/sso/saml2/logout',
    headers: new Headers({ 'content-type': contentType }),
    text: async () => body,
  }
}

describe('POST /api/auth/sso/saml2/logout', () => {
  const cookieStore = { set: jest.fn() }
  const identityProvider = {
    entity_id: issuer,
    certificates: ['idp-signing-certificate'],
    sso_logout_url: 'https://idp.example/logout',
  }
  const serviceProvider = {
    create_logout_response_url: jest.fn((idp, options, callback) => {
      callback(null, `https://idp.example/logout?SAMLResponse=response&RelayState=${options.relay_state}`)
    }),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    cookies.mockResolvedValue(cookieStore)
    createIdentityProvider.mockResolvedValue(identityProvider)
    createServiceProvider.mockReturnValue(serviceProvider)
    decodeSamlLogoutRequest.mockReturnValue('<samlp:LogoutRequest />')
    extractSamlLogoutRequest.mockReturnValue({ requestId: '_logout-1', issuer })
    verifySamlLogoutRequestSignature.mockReturnValue(true)
    consumeSamlLogoutRequestId.mockResolvedValue(true)
  })

  test('verifies the issuer and signature before clearing sessions and returning a SAML response redirect', async () => {
    const body = new URLSearchParams({ SAMLRequest: 'encoded-request', RelayState: 'relay-1' }).toString()

    const response = await POST(requestWithBody(body))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      'https://idp.example/logout?SAMLResponse=response&RelayState=relay-1',
    )
    expect(verifySamlLogoutRequestSignature).toHaveBeenCalledWith(
      '<samlp:LogoutRequest />',
      'idp-signing-certificate',
      '_logout-1',
    )
    expect(consumeSamlLogoutRequestId).toHaveBeenCalledWith('_logout-1')
    expect(serviceProvider.create_logout_response_url).toHaveBeenCalledWith(
      identityProvider,
      { in_response_to: '_logout-1', relay_state: 'relay-1' },
      expect.any(Function),
    )
    expect(revokeFmuContexts).toHaveBeenCalledWith(cookieStore)
    expect(clearSessionCookies).toHaveBeenCalledWith(cookieStore)
    expect(clearFmuContextCookie).toHaveBeenCalledWith(cookieStore)
  })

  test('rejects an issuer that is not published by the configured IdP metadata', async () => {
    extractSamlLogoutRequest.mockReturnValue({ requestId: '_logout-1', issuer: 'https://untrusted.example/entity' })

    const response = await POST(requestWithBody('SAMLRequest=encoded-request'))

    expect(response.status).toBe(400)
    expect(verifySamlLogoutRequestSignature).not.toHaveBeenCalled()
    expect(consumeSamlLogoutRequestId).not.toHaveBeenCalled()
    expect(revokeFmuContexts).not.toHaveBeenCalled()
  })

  test('rejects an unsigned or invalidly signed request', async () => {
    verifySamlLogoutRequestSignature.mockReturnValue(false)

    const response = await POST(requestWithBody('SAMLRequest=encoded-request'))

    expect(response.status).toBe(400)
    expect(consumeSamlLogoutRequestId).not.toHaveBeenCalled()
    expect(revokeFmuContexts).not.toHaveBeenCalled()
  })

  test('rejects a LogoutRequest ID that has already been consumed', async () => {
    consumeSamlLogoutRequestId.mockResolvedValue(false)

    const response = await POST(requestWithBody('SAMLRequest=encoded-request'))

    expect(response.status).toBe(400)
    expect(revokeFmuContexts).not.toHaveBeenCalled()
    expect(clearSessionCookies).not.toHaveBeenCalled()
  })

  test('does not clear the local session if the SAML response cannot be generated', async () => {
    serviceProvider.create_logout_response_url.mockImplementation((idp, options, callback) => {
      callback(new Error('IdP logout endpoint unavailable'))
    })

    const response = await POST(requestWithBody('SAMLRequest=encoded-request'))

    expect(response.status).toBe(503)
    expect(revokeFmuContexts).not.toHaveBeenCalled()
    expect(clearSessionCookies).not.toHaveBeenCalled()
  })
})
