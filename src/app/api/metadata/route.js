/**
 * Metadata API endpoint for local, Vercel Blob and explicitly allowlisted
 * external metadata documents.
 */
import getIsVercel from '@/utils/isVercel'
import { NextResponse } from 'next/server'
import {
  isLocalMetadataUri,
  loadMetadataDocument,
  MetadataFetchError,
} from '@/utils/metadata/metadataPolicy'
import { resolveProviderMetadataOrigins } from '@/utils/metadata/providerMetadataOrigins'
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
  const metadataUri = searchParams.get('uri')
  const labId = searchParams.get('labId')

  if (!metadataUri || !metadataUri.trim()) {
    return publicErrorResponse({
      status: 400,
      code: 'MISSING_PARAMETER',
      message: 'The metadata URI is required.',
      context: 'metadata-missing-uri',
    })
  }

  const localMetadata = isLocalMetadataUri(metadataUri)
  if (!localMetadata && (!labId || !labId.trim())) {
    return publicErrorResponse({
      status: 400,
      code: 'MISSING_PARAMETER',
      message: 'The lab identifier is required for external metadata.',
      context: 'metadata-missing-lab-id',
    })
  }

  if (!localMetadata) {
    try {
      if (BigInt(labId) < 0n) throw new Error('Invalid labId')
    } catch {
      return publicErrorResponse({
        status: 400,
        code: 'INVALID_PARAMETER',
        message: 'The lab identifier is invalid.',
        context: 'metadata-invalid-lab-id',
      })
    }
  }

  try {
    const cacheBuster = searchParams.get('t')
    const additionalAllowedOrigins = localMetadata
      ? []
      : await resolveProviderMetadataOrigins({ labId })
    const metadata = await loadMetadataDocument(metadataUri, {
      cacheBuster,
      additionalAllowedOrigins,
    })
    const isVercel = getIsVercel()
    const timestamp = new Date().toISOString()
    const source = localMetadata
      ? (isVercel ? 'blob' : 'local')
      : 'external'

    const successResponse = NextResponse.json({
      ...metadata,
      _meta: {
        uri: metadataUri,
        timestamp,
        source,
        version: metadata?._meta?.version || 1,
        cacheBreaker: metadata?._meta?.cacheBreaker || Date.now(),
      },
    }, { status: 200 })

    if (cacheBuster || isVercel) {
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
