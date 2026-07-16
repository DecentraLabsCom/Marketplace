import { NextResponse } from 'next/server'
import { HttpError, requireAuth } from '@/utils/auth/guards'
import { requirePlatformAdminSession } from '@/utils/auth/platformAdmin'
import {
  MetadataOriginExceptionError,
  listMetadataOriginExceptions,
  removeMetadataOriginException,
  setMetadataOriginException,
} from '@/utils/metadata/metadataOriginExceptions'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import { publicErrorResponse } from '@/utils/security/publicError'

export const runtime = 'nodejs'

const checkRate = createRateLimiter({
  operation: 'admin-metadata-origin-exceptions',
  windowMs: 60_000,
  maxRequests: 20,
})

async function authorize(request) {
  const session = await requireAuth()
  const adminEmail = requirePlatformAdminSession(session)
  const rate = await checkRate(request, { email: adminEmail, institutionId: 'platform-admin' })
  const rateResponse = createRateLimitResponse(rate)
  if (rateResponse) return { rateResponse }
  return { adminEmail }
}

function errorResponse(error) {
  const status = error instanceof HttpError
    ? error.status
    : error instanceof MetadataOriginExceptionError
      ? 400
      : 503
  return publicErrorResponse({
    status,
    code: error instanceof HttpError
      ? error.code || 'FORBIDDEN'
      : error instanceof MetadataOriginExceptionError
        ? error.code
        : 'METADATA_ORIGIN_EXCEPTIONS_UNAVAILABLE',
    message: error instanceof HttpError || error instanceof MetadataOriginExceptionError
      ? error.message
      : 'Metadata-origin exceptions are temporarily unavailable.',
    error,
    context: 'admin-metadata-origin-exceptions',
  })
}

export async function GET(request) {
  try {
    const { rateResponse } = await authorize(request)
    if (rateResponse) return rateResponse
    return NextResponse.json({ exceptions: await listMetadataOriginExceptions() })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request) {
  try {
    const { adminEmail, rateResponse } = await authorize(request)
    if (rateResponse) return rateResponse
    const body = await request.json().catch(() => ({}))
    const exception = await setMetadataOriginException({
      origin: body?.origin,
      owner: body?.owner,
      reason: body?.reason,
      expiresAt: body?.expiresAt,
      updatedBy: adminEmail,
    })
    return NextResponse.json({ exception }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request) {
  try {
    const { rateResponse } = await authorize(request)
    if (rateResponse) return rateResponse
    const body = await request.json().catch(() => ({}))
    await removeMetadataOriginException(body?.origin)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return errorResponse(error)
  }
}
