/**
 * Metadata API endpoint bound to the laboratory's exact on-chain tokenURI.
 */
import { NextResponse } from 'next/server'
import {
  loadOnChainLabMetadata,
  MetadataFetchError,
} from '@/utils/metadata/metadataPolicy'
import { GatewayValidationError } from '@/utils/api/gatewayProxy'
import { publicErrorResponse } from '@/utils/security/publicError'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'

const checkRate = createRateLimiter({ operation: 'metadata', windowMs: 60_000, maxRequests: 60 })

const PUBLIC_METADATA_MESSAGES = {
  INVALID_URI: 'The metadata reference is invalid.',
  INVALID_SCHEMA: 'The metadata document is invalid.',
  INVALID_JSON: 'The metadata document is invalid.',
  FILE_NOT_FOUND: 'The metadata document was not found.',
  BLOB_NOT_FOUND: 'The metadata document was not found.',
  EXTERNAL_NOT_FOUND: 'The metadata document was not found.',
  TOO_LARGE: 'The metadata document is too large.',
}

function metadataErrorMessage(error) {
  return PUBLIC_METADATA_MESSAGES[error?.code] || 'The metadata document could not be loaded.'
}

export async function GET(request) {
  const rateLimitResponse = createRateLimitResponse(await checkRate(request))
  if (rateLimitResponse) return rateLimitResponse

  const { searchParams } = new URL(request.url)
  const requestedUri = searchParams.get('uri')
  const labId = searchParams.get('labId')

  if (!labId || !labId.trim()) {
    return publicErrorResponse({
      status: 400,
      code: 'MISSING_PARAMETER',
      message: 'The lab identifier is required.',
      context: 'metadata-missing-lab-id',
    })
  }

  try {
    const cacheBuster = searchParams.get('t')
    const { metadataUri, metadata } = await loadOnChainLabMetadata(labId, { cacheBuster })
    if (requestedUri && requestedUri.trim() !== metadataUri) {
      return publicErrorResponse({
        status: 403,
        code: 'METADATA_URI_MISMATCH',
        message: 'The metadata URI does not match the on-chain laboratory reference.',
        context: 'metadata-uri-mismatch',
      })
    }
    const timestamp = new Date().toISOString()
    const source = metadataUri.startsWith('Lab-') ? 'managed' : 'on-chain'

    const successResponse = NextResponse.json({
      ...metadata,
      _meta: {
        uri: metadataUri,
        timestamp,
        source,
        version: 1,
        cacheBreaker: Date.now(),
      },
    }, { status: 200 })

    if (cacheBuster) {
      successResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
      successResponse.headers.set('Pragma', 'no-cache')
      successResponse.headers.set('Expires', '0')
    }

    return successResponse
  } catch (error) {
    if (error instanceof MetadataFetchError || error instanceof GatewayValidationError) {
      return publicErrorResponse({
        status: error.status || 502,
        code: error.code || 'METADATA_FETCH_ERROR',
        message: error instanceof GatewayValidationError
          ? 'The metadata reference is not allowed.'
          : metadataErrorMessage(error),
        error,
        context: 'metadata-policy',
      })
    }

    return publicErrorResponse({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'The metadata request could not be completed.',
      error,
      context: 'metadata',
    })
  }
}
