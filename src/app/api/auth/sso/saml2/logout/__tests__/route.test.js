/** @jest-environment node */

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/utils/auth/sessionCookie', () => ({
  clearSessionCookies: jest.fn(),
  getSessionFromCookies: jest.fn(),
}))
jest.mock('@/utils/auth/fmuSessionStore', () => ({ clearFmuContextCookie: jest.fn() }))
jest.mock('@/utils/auth/samlLogoutOutbox', () => ({
  acceptSamlLogoutRequest: jest.fn(),
}))
jest.mock('@/utils/auth/processSamlLogout', () => ({
  processSamlLogoutRequest: jest.fn(),
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
import { clearSessionCookies, getSessionFromCookies } from '@/utils/auth/sessionCookie'
import { clearFmuContextCookie } from '@/utils/auth/fmuSessionStore'
import { acceptSamlLogoutRequest } from '@/utils/auth/samlLogoutOutbox'
import { processSamlLogoutRequest } from '@/utils/auth/processSamlLogout'
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
    extractSamlLogoutRequest.mockReturnValue({
      requestId: '_logout-1',
      issuer,
      nameId: 'name-id-1',
      sessionIndex: 'session-index-1',
    })
    getSessionFromCookies.mockResolvedValue({
      samlNameId: 'name-id-1',
      samlSessionIndex: 'session-index-1',
    })
    verifySamlLogoutRequestSignature.mockReturnValue(true)
    acceptSamlLogoutRequest.mockResolvedValue({
      status: 'pending',
      record: {
        requestId: '_logout-1',
        nameId: 'name-id-1',
        sessionIndex: 'session-index-1',
        attempts: 0,
      },
    })
    processSamlLogoutRequest.mockResolvedValue(undefined)
  })

  test('accepts the request before processing and returns a SAML response redirect', async () => {
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
    expect(acceptSamlLogoutRequest).toHaveBeenCalledWith({
      requestId: '_logout-1',
      nameId: 'name-id-1',
      sessionIndex: 'session-index-1',
    })
    expect(processSamlLogoutRequest).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: '_logout-1' }),
      cookieStore,
    )
    expect(createServiceProvider).toHaveBeenCalled()
    expect(clearSessionCookies).toHaveBeenCalledWith(cookieStore)
    expect(clearFmuContextCookie).toHaveBeenCalledWith(cookieStore)
  })

  test('does not clear a browser session for a different SAML identity', async () => {
    getSessionFromCookies.mockResolvedValue({
      samlNameId: 'different-name-id',
      samlSessionIndex: 'session-index-1',
    })

    const response = await POST(requestWithBody('SAMLRequest=encoded-request'))

    expect(response.status).toBe(400)
    expect(acceptSamlLogoutRequest).not.toHaveBeenCalled()
    expect(clearSessionCookies).not.toHaveBeenCalled()
  })

  test('processes IdP-initiated logout when the browser does not send the Lax session cookie', async () => {
    getSessionFromCookies.mockResolvedValue(null)
    const response = await POST(requestWithBody('SAMLRequest=encoded-request'))

    expect(response.status).toBe(303)
    expect(processSamlLogoutRequest).toHaveBeenCalledWith(
      expect.objectContaining({ nameId: 'name-id-1', sessionIndex: 'session-index-1' }),
      cookieStore,
    )
    expect(clearSessionCookies).toHaveBeenCalledWith(cookieStore)
  })

  test('rejects an issuer that is not published by the configured IdP metadata', async () => {
    extractSamlLogoutRequest.mockReturnValue({ requestId: '_logout-1', issuer: 'https://untrusted.example/entity' })

    const response = await POST(requestWithBody('SAMLRequest=encoded-request'))

    expect(response.status).toBe(400)
    expect(verifySamlLogoutRequestSignature).not.toHaveBeenCalled()
    expect(acceptSamlLogoutRequest).not.toHaveBeenCalled()
  })

  test('rejects an unsigned or invalidly signed request', async () => {
    verifySamlLogoutRequestSignature.mockReturnValue(false)

    const response = await POST(requestWithBody('SAMLRequest=encoded-request'))

    expect(response.status).toBe(400)
    expect(acceptSamlLogoutRequest).not.toHaveBeenCalled()
  })

  test('rejects a LogoutRequest that has already completed', async () => {
    acceptSamlLogoutRequest.mockResolvedValue({ status: 'completed' })

    const response = await POST(requestWithBody('SAMLRequest=encoded-request'))

    expect(response.status).toBe(400)
    expect(processSamlLogoutRequest).not.toHaveBeenCalled()
    expect(clearSessionCookies).not.toHaveBeenCalled()
  })

  test('returns 503 while leaving an accepted pending request retryable', async () => {
    processSamlLogoutRequest.mockRejectedValue(new Error('session store unavailable'))

    const response = await POST(requestWithBody('SAMLRequest=encoded-request'))

    expect(response.status).toBe(503)
    expect(acceptSamlLogoutRequest).toHaveBeenCalledTimes(1)
    expect(processSamlLogoutRequest).toHaveBeenCalledTimes(1)
    expect(clearSessionCookies).not.toHaveBeenCalled()
  })

  test('does not clear the local session if the SAML response cannot be generated', async () => {
    serviceProvider.create_logout_response_url.mockImplementation((idp, options, callback) => {
      callback(new Error('IdP logout endpoint unavailable'))
    })

    const response = await POST(requestWithBody('SAMLRequest=encoded-request'))

    expect(response.status).toBe(503)
    expect(acceptSamlLogoutRequest).not.toHaveBeenCalled()
    expect(clearSessionCookies).not.toHaveBeenCalled()
  })
})
