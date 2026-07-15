import { NextResponse } from 'next/server'
import {
  institutionalBackendFetch,
} from '@/utils/api/gatewayProxy'
import { resolveProviderMetadataOrigins } from '@/utils/metadata/providerMetadataOrigins'
import { publicErrorResponse } from '@/utils/security/publicError'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const checkRate = createRateLimiter({ operation: 'metadata-document', windowMs: 60_000, maxRequests: 30 })

const configuredMetadataOrigins = () => String(process.env.ALLOWED_METADATA_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const normalizeLabId = (value) => {
  try {
    const normalized = BigInt(value)
    if (normalized < 0n) return null
    return normalized.toString()
  } catch {
    return null
  }
}

const safeFilename = (uri) => {
  try {
    const pathname = new URL(uri).pathname
    const candidate = decodeURIComponent(pathname.split('/').pop() || 'document')
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .slice(0, 120)
    return candidate || 'document'
  } catch {
    return 'document'
  }
}

const responseHeaders = (contentType, disposition) => ({
  'Content-Type': contentType,
  'Content-Disposition': disposition,
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; sandbox",
})

/**
 * Proxy lab documents through the Marketplace so the browser never embeds an
 * arbitrary provider origin. Only exact HTTPS origins trusted on-chain (or
 * explicitly configured) are eligible.
 */
export async function GET(request) {
  const rateLimitResponse = createRateLimitResponse(await checkRate(request))
  if (rateLimitResponse) return rateLimitResponse

  const { searchParams } = new URL(request.url)
  const uri = searchParams.get('uri')
  const labId = normalizeLabId(searchParams.get('labId'))

  if (!uri || !labId) {
    return publicErrorResponse({
      status: 400,
      code: 'INVALID_DOCUMENT_REQUEST',
      message: 'A valid document and laboratory are required.',
    })
  }

  let parsedUri
  try {
    parsedUri = new URL(uri)
  } catch {
    return publicErrorResponse({
      status: 400,
      code: 'INVALID_DOCUMENT_URI',
      message: 'The document URL is invalid.',
    })
  }

  if (parsedUri.protocol !== 'https:' || parsedUri.username || parsedUri.password || parsedUri.hash) {
    return publicErrorResponse({
      status: 400,
      code: 'UNSAFE_DOCUMENT_URI',
      message: 'Documents must use a credential-free HTTPS URL.',
    })
  }

  try {
    const trustedOrigins = new Set([
      ...configuredMetadataOrigins(),
      ...(await resolveProviderMetadataOrigins({ labId })),
    ])

    if (!trustedOrigins.has(parsedUri.origin)) {
      return publicErrorResponse({
        status: 403,
        code: 'DOCUMENT_ORIGIN_NOT_ALLOWED',
        message: 'This document origin is not trusted for the laboratory.',
      })
    }

    const upstreamResponse = await institutionalBackendFetch(parsedUri.toString(), {
      cache: 'no-store',
    })

    if (!upstreamResponse.ok) {
      return publicErrorResponse({
        status: upstreamResponse.status === 404 ? 404 : 502,
        code: upstreamResponse.status === 404 ? 'DOCUMENT_NOT_FOUND' : 'DOCUMENT_UNAVAILABLE',
        message: upstreamResponse.status === 404
          ? 'The document was not found.'
          : 'The document is temporarily unavailable.',
        error: new Error(`Document upstream returned ${upstreamResponse.status}`),
        context: 'metadata-document-upstream',
      })
    }

    const contentLength = Number(upstreamResponse.headers.get('content-length') || 0)
    if (contentLength > MAX_DOCUMENT_BYTES) {
      return publicErrorResponse({
        status: 413,
        code: 'DOCUMENT_TOO_LARGE',
        message: 'The document is too large to display.',
      })
    }

    const body = await upstreamResponse.arrayBuffer()
    if (body.byteLength > MAX_DOCUMENT_BYTES) {
      return publicErrorResponse({
        status: 413,
        code: 'DOCUMENT_TOO_LARGE',
        message: 'The document is too large to display.',
      })
    }

    const upstreamContentType = upstreamResponse.headers.get('content-type') || 'application/octet-stream'
    const contentType = upstreamContentType.split(';')[0].trim().toLowerCase() || 'application/octet-stream'
    const isPdf = contentType === 'application/pdf'
    const filename = safeFilename(parsedUri.toString())
    const disposition = `${isPdf ? 'inline' : 'attachment'}; filename="${filename}"`

    return new Response(body, {
      status: 200,
      headers: responseHeaders(contentType, disposition),
    })
  } catch (error) {
    return publicErrorResponse({
      status: 502,
      code: 'DOCUMENT_FETCH_FAILED',
      message: 'The document could not be retrieved.',
      error,
      context: 'metadata-document',
    })
  }
}
