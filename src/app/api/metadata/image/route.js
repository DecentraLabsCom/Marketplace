import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import { assertDeclaredLabResource, MetadataFetchError } from '@/utils/metadata/metadataPolicy'
import { publicErrorResponse } from '@/utils/security/publicError'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const checkRate = createRateLimiter({ operation: 'metadata-image', windowMs: 60_000, maxRequests: 120 })

const normalizeLabId = (value) => {
  try {
    const normalized = BigInt(value)
    return normalized >= 0n ? normalized.toString() : null
  } catch {
    return null
  }
}

const responseHeaders = (contentType) => ({
  'Content-Type': contentType,
  'Content-Disposition': 'inline',
  'Cache-Control': 'public, max-age=300, s-maxage=300',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'",
})

/**
 * Proxy trusted lab images through the Marketplace origin. The browser only
 * sees a same-origin URL, while the server verifies that the exact resource
 * is declared in the laboratory's exact on-chain metadata document.
 */
export async function GET(request) {
  const rateLimitResponse = createRateLimitResponse(await checkRate(request))
  if (rateLimitResponse) return rateLimitResponse

  const { searchParams } = new URL(request.url)
  const labId = normalizeLabId(searchParams.get('labId'))
  const uri = searchParams.get('uri')

  if (!labId || !uri) {
    return publicErrorResponse({
      status: 400,
      code: 'INVALID_IMAGE_REQUEST',
      message: 'A valid image and laboratory are required.',
    })
  }

  let parsedUri
  try {
    parsedUri = new URL(uri)
  } catch {
    return publicErrorResponse({
      status: 400,
      code: 'INVALID_IMAGE_URI',
      message: 'The image URL is invalid.',
    })
  }

  if (parsedUri.protocol !== 'https:' || parsedUri.username || parsedUri.password || parsedUri.hash) {
    return publicErrorResponse({
      status: 400,
      code: 'UNSAFE_IMAGE_URI',
      message: 'Images must use a credential-free HTTPS URL.',
    })
  }

  try {
    const declaredUri = await assertDeclaredLabResource(labId, parsedUri.toString(), 'image')

    const upstreamResponse = await institutionalBackendFetch(declaredUri, {
      cache: 'no-store',
    })

    if (!upstreamResponse.ok) {
      return publicErrorResponse({
        status: upstreamResponse.status === 404 ? 404 : 502,
        code: upstreamResponse.status === 404 ? 'IMAGE_NOT_FOUND' : 'IMAGE_UNAVAILABLE',
        message: upstreamResponse.status === 404
          ? 'The image was not found.'
          : 'The image is temporarily unavailable.',
        error: new Error(`Image upstream returned ${upstreamResponse.status}`),
        context: 'metadata-image-upstream',
      })
    }

    const contentLength = Number(upstreamResponse.headers.get('content-length') || 0)
    if (contentLength > MAX_IMAGE_BYTES) {
      return publicErrorResponse({
        status: 413,
        code: 'IMAGE_TOO_LARGE',
        message: 'The image is too large to display.',
      })
    }

    const contentType = (upstreamResponse.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return publicErrorResponse({
        status: 415,
        code: 'UNSUPPORTED_IMAGE_TYPE',
        message: 'The remote resource is not a supported image.',
      })
    }

    const body = await upstreamResponse.arrayBuffer()
    if (body.byteLength > MAX_IMAGE_BYTES) {
      return publicErrorResponse({
        status: 413,
        code: 'IMAGE_TOO_LARGE',
        message: 'The image is too large to display.',
      })
    }

    return new Response(body, {
      status: 200,
      headers: responseHeaders(contentType),
    })
  } catch (error) {
    if (error instanceof MetadataFetchError) {
      return publicErrorResponse({
        status: error.status,
        code: error.code,
        message: 'This image is not declared for the laboratory.',
        error,
        context: 'metadata-image-declaration',
      })
    }
    return publicErrorResponse({
      status: 502,
      code: 'IMAGE_FETCH_FAILED',
      message: 'The image could not be retrieved.',
      error,
      context: 'metadata-image',
    })
  }
}
