import {
  institutionalBackendFetch,
} from '@/utils/api/gatewayProxy'
import { assertDeclaredLabResource, MetadataFetchError } from '@/utils/metadata/metadataPolicy'
import { publicErrorResponse } from '@/utils/security/publicError'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import { DocumentScanError, scanDocumentBuffer } from '@/utils/storage/documentMalwareScan'

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const SUPPORTED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const checkRate = createRateLimiter({ operation: 'metadata-document', windowMs: 60_000, maxRequests: 30 })

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
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'",
})

const hasPdfSignature = (body) => Buffer.from(body).subarray(0, 5).toString('ascii') === '%PDF-'

/**
 * Proxy lab documents through the Marketplace so the browser never embeds an
 * arbitrary provider origin. Only exact URLs declared in the laboratory's
 * exact on-chain metadata are eligible.
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
    const declaredUri = await assertDeclaredLabResource(labId, parsedUri.toString(), 'document')

    const upstreamResponse = await institutionalBackendFetch(declaredUri, {
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
    if (!SUPPORTED_DOCUMENT_TYPES.has(contentType)) {
      return publicErrorResponse({
        status: 415,
        code: 'UNSUPPORTED_DOCUMENT_TYPE',
        message: 'The remote resource is not a supported document.',
      })
    }
    const isPdf = contentType === 'application/pdf'
    if (isPdf && !hasPdfSignature(body)) {
      return publicErrorResponse({
        status: 415,
        code: 'INVALID_DOCUMENT_CONTENT',
        message: 'The remote resource is not a valid PDF document.',
      })
    }
    const filename = safeFilename(parsedUri.toString())
    await scanDocumentBuffer({
      buffer: Buffer.from(body),
      contentType,
      filename,
    })
    const disposition = `${isPdf ? 'inline' : 'attachment'}; filename="${filename}"`

    return new Response(body, {
      status: 200,
      headers: responseHeaders(contentType, disposition),
    })
  } catch (error) {
    if (error instanceof DocumentScanError) {
      return publicErrorResponse({
        status: error.status,
        code: error.code,
        message: error.code === 'DOCUMENT_MALWARE_DETECTED'
          ? 'The document did not pass the security scan.'
          : 'Document scanning is temporarily unavailable.',
        error,
        context: 'metadata-document-scan',
      })
    }
    if (error instanceof MetadataFetchError) {
      return publicErrorResponse({
        status: error.status,
        code: error.code,
        message: 'This document is not declared for the laboratory.',
        error,
        context: 'metadata-document-declaration',
      })
    }
    return publicErrorResponse({
      status: 502,
      code: 'DOCUMENT_FETCH_FAILED',
      message: 'The document could not be retrieved.',
      error,
      context: 'metadata-document',
    })
  }
}
