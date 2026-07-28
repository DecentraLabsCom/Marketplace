import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  BadRequestError,
  ForbiddenError,
  handleGuardError,
} from '@/utils/auth/guards'
import {
  GatewayValidationError,
  resolveLabAccessGateway,
} from '@/utils/api/gatewayProxy'
import {
  createRateLimiter,
  createRateLimitResponse,
} from '@/utils/api/rateLimit'

const checkRate = createRateLimiter({
  operation: 'auth-lab-access-handoff',
  windowMs: 60_000,
  maxRequests: 20,
})

const LAB_ID_PATTERN = /^(?:0|[1-9]\d{0,19})$/
const ACCESS_CODE_PATTERN = /^[A-Za-z0-9_-]{1,256}$/

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

function firstHeaderValue(request, name) {
  return request.headers.get(name)?.split(',')[0]?.trim() || null
}

function originFromHost(protocol, host) {
  if (!host || !['http:', 'https:'].includes(protocol)) return null
  try {
    return new URL(`${protocol}//${host}`).origin
  } catch {
    return null
  }
}

function requestOriginCandidates(request) {
  const requestUrl = new URL(request.url)
  const origins = new Set([requestUrl.origin])
  const forwardedProtocol = firstHeaderValue(request, 'x-forwarded-proto')
  const protocols = [
    forwardedProtocol ? `${forwardedProtocol}:` : null,
    requestUrl.protocol,
  ].filter(Boolean)
  const hosts = [
    firstHeaderValue(request, 'x-forwarded-host'),
    request.headers.get('host')?.trim() || null,
  ].filter(Boolean)

  for (const protocol of protocols) {
    for (const host of hosts) {
      const origin = originFromHost(protocol, host)
      if (origin) origins.add(origin)
    }
  }

  return origins
}

function assertSameOrigin(request) {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase() || null
  if (fetchSite && fetchSite !== 'same-origin') {
    throw new ForbiddenError('Cross-origin lab handoff is not allowed')
  }
  if (origin && !requestOriginCandidates(request).has(origin) && fetchSite !== 'same-origin') {
    throw new ForbiddenError('Cross-origin lab handoff is not allowed')
  }
}

function buildHandoffDocument({ gatewayOrigin, accessCode, nonce }) {
  const action = `${gatewayOrigin}/auth/access`
  const escapedAction = escapeHtml(action)
  const escapedCode = escapeHtml(accessCode)
  const escapedNonce = escapeHtml(nonce)
  const policy = [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    `script-src 'nonce-${escapedNonce}'`,
    `form-action 'self' ${gatewayOrigin}`,
    "frame-ancestors 'none'",
    "style-src 'none'",
    "img-src 'none'",
    "font-src 'none'",
    "connect-src 'none'",
  ].join('; ')
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Connecting to laboratory</title>
  </head>
  <body>
    <form id="lab-access-handoff" method="post" action="${escapedAction}">
      <input type="hidden" name="access_code" value="${escapedCode}">
    </form>
    <noscript>JavaScript is required to connect to the laboratory.</noscript>
    <script nonce="${escapedNonce}">document.getElementById('lab-access-handoff').submit()</script>
  </body>
</html>`

  return { html, policy }
}

export async function POST(request) {
  try {
    assertSameOrigin(request)

    const contentType = request.headers.get('content-type') || ''
    if (!contentType.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
      throw new BadRequestError('Invalid lab handoff content type')
    }

    const rateLimitResponse = createRateLimitResponse(await checkRate(request))
    if (rateLimitResponse) return rateLimitResponse

    const formData = await request.formData().catch(() => null)
    const labId = String(formData?.get('lab_id') || '')
    const accessCode = String(formData?.get('access_code') || '')
    if (!LAB_ID_PATTERN.test(labId)) {
      throw new BadRequestError('Invalid lab ID')
    }
    if (!ACCESS_CODE_PATTERN.test(accessCode)) {
      throw new BadRequestError('Invalid access code')
    }

    let gatewayOrigin
    try {
      gatewayOrigin = await resolveLabAccessGateway({ labId })
    } catch (error) {
      if (error instanceof GatewayValidationError) {
        throw new BadRequestError('The provider access endpoint is invalid.')
      }
      throw error
    }

    const gatewayUrl = new URL(gatewayOrigin)
    if (process.env.NODE_ENV === 'production' && gatewayUrl.protocol !== 'https:') {
      throw new BadRequestError('The provider access endpoint is invalid.')
    }

    const nonce = randomBytes(16).toString('base64')
    const { html, policy } = buildHandoffDocument({
      gatewayOrigin: gatewayUrl.origin,
      accessCode,
      nonce,
    })
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': policy,
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
    })
  } catch (error) {
    return handleGuardError(error, request)
  }
}
