/**
 * API endpoint for handling IdP-initiated SAML2 Single Logout requests.
 * Verifies the request against the configured IdP metadata, clears local
 * sessions, then redirects to the IdP with a correlated LogoutResponse.
 */
import { NextResponse } from 'next/server'
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

const MAX_SAML_FORM_BYTES = 256 * 1024

function invalidRequest() {
  return NextResponse.json({ error: 'Invalid logout request' }, { status: 400 })
}
function unavailable() {
  return NextResponse.json({ error: 'SAML logout is temporarily unavailable' }, { status: 503 })
}

function parseRequestBody(body) {
  if (body.trimStart().startsWith('<')) {
    return { xml: decodeSamlLogoutRequest(body), relayState: undefined }
  }

  const params = new URLSearchParams(body)
  const encodedRequest = params.get('SAMLRequest')
  if (encodedRequest) {
    return {
      xml: decodeSamlLogoutRequest(encodedRequest),
      relayState: params.get('RelayState') || undefined,
    }
  }

  return { xml: decodeSamlLogoutRequest(body), relayState: undefined }
}

function createLogoutResponseUrl(serviceProvider, identityProvider, options) {
  return new Promise((resolve, reject) => {
    serviceProvider.create_logout_response_url(identityProvider, options, (error, responseUrl) => {
      if (error || !responseUrl) {
        reject(error || new Error('Missing SAML logout response URL'))
        return
      }
      resolve(responseUrl)
    })
  })
}

/**
 * Handles SAML2 logout requests from the identity provider.
 * @param {Request} request - HTTP POST request with a SAMLRequest form field or raw XML
 * @returns {Response} SAML LogoutResponse redirect or error response
 */
export async function POST(request) {
  try {
    const body = await request.text()
    if (Buffer.byteLength(body, 'utf8') > MAX_SAML_FORM_BYTES) {
      return NextResponse.json({ error: 'SAML logout request is too large' }, { status: 413 })
    }

    const { xml, relayState } = parseRequestBody(body)
    const { requestId, issuer } = extractSamlLogoutRequest(xml)
    const identityProvider = await createIdentityProvider()
    if (!identityProvider?.entity_id || identityProvider.entity_id !== issuer) {
      return invalidRequest()
    }

    const signingCertificates = identityProvider.signing_certificates || identityProvider.certificates
    const certificates = Array.isArray(signingCertificates) ? signingCertificates : [signingCertificates]
    const isValidSignature = certificates.some((certificate) => (
      verifySamlLogoutRequestSignature(xml, certificate, requestId)
    ))
    if (!isValidSignature) return invalidRequest()

    const serviceProvider = createServiceProvider()
    if (typeof serviceProvider?.create_logout_response_url !== 'function') {
      return unavailable()
    }

    const responseOptions = { in_response_to: requestId }
    if (relayState) responseOptions.relay_state = relayState
    const responseUrl = await createLogoutResponseUrl(
      serviceProvider,
      identityProvider,
      responseOptions,
    )
    if (!await consumeSamlLogoutRequestId(requestId)) return invalidRequest()

    const cookieStore = await cookies()
    await revokeFmuContexts(cookieStore)
    await clearSessionCookies(cookieStore)
    clearFmuContextCookie(cookieStore)

    // The IdP advertises HTTP-Redirect for the response binding. 303 converts
    // the incoming POST into the required browser GET to the IdP endpoint.
    return NextResponse.redirect(responseUrl, 303)
  } catch (error) {
    if (
      error?.message?.startsWith('Malformed') ||
      error?.message?.startsWith('Missing') ||
      error?.message?.startsWith('Invalid') ||
      error?.message?.startsWith('Empty') ||
      error?.message?.includes('outside the accepted time window')
    ) {
      return invalidRequest()
    }
    console.error('Error while processing SAML logout:', error)
    return unavailable()
  }
}
