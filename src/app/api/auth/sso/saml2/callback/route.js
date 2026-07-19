/**
 * API endpoint for handling SAML2 SSO callback from identity provider
 * Processes SAML response and creates user session
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { parseSAMLResponse, createSession } from '@/utils/auth/sso'
import { reconcileFmuContextsForSession } from '@/utils/auth/reconcileFmuContexts'
import { MAX_SAML_FORM_BYTES, extractSamlResponseIdentifiers } from '@/utils/auth/samlResponseSecurity'
import { consumeSamlAssertionId, consumeSamlLoginTransaction } from '@/utils/auth/samlTransactionStore'

const invalidSamlResponse = () => NextResponse.json({ error: 'Invalid SAML response' }, { status: 400 })
const unavailable = () => NextResponse.json({ error: 'SSO is temporarily unavailable' }, { status: 503 })

/**
 * Processes SAML2 callback response and creates user session
 * @param {Request} request - HTTP POST request with SAML response
 * @param {string} request.body.SAMLResponse - Base64 encoded SAML response
 * @returns {Response} JSON response with session result or error
 */
export async function POST(request) {
  try {
    const contentLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_SAML_FORM_BYTES) {
      return NextResponse.json({ error: 'SAML response is too large' }, { status: 413 })
    }
    const text = await request.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_SAML_FORM_BYTES) {
      return NextResponse.json({ error: 'SAML response is too large' }, { status: 413 })
    }
    const params = new URLSearchParams(text)
    const samlResponse = params.get('SAMLResponse')
    const relayState = params.get('RelayState')
    let identifiers
    try {
      identifiers = extractSamlResponseIdentifiers(samlResponse)
    } catch {
      return invalidSamlResponse()
    }

    try {
      const transaction = await consumeSamlLoginTransaction({
        requestId: identifiers.inResponseTo,
        relayState,
      })
      if (!transaction) return invalidSamlResponse()
    } catch {
      return unavailable()
    }

    let userData
    try {
      userData = await parseSAMLResponse(samlResponse)
    } catch {
      return invalidSamlResponse()
    }

    if (!userData) {
      return invalidSamlResponse()
    }

    try {
      const isFirstUse = await consumeSamlAssertionId(identifiers.assertionId)
      if (!isFirstUse) return invalidSamlResponse()
    } catch {
      return unavailable()
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin
      const response = NextResponse.redirect(`${baseUrl}/api/auth/sso/saml2/complete`, 303)
      const cookieStore = await cookies()
      await reconcileFmuContextsForSession(response, cookieStore, userData)
      await createSession(response, userData)
      return response
    } catch {
      return unavailable()
    }
  } catch {
    return invalidSamlResponse()
  }
}
