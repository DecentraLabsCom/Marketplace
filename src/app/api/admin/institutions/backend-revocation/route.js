import { NextResponse } from 'next/server'
import { HttpError, requireAuth } from '@/utils/auth/guards'
import { requirePlatformAdminSession } from '@/utils/auth/platformAdmin'
import {
  denyInstitutionalBackend,
  restoreInstitutionalBackend,
} from '@/utils/onboarding/institutionalBackend'
import { publicErrorResponse } from '@/utils/security/publicError'

const MIN_DENYLIST_TTL_SECONDS = 60
const MAX_DENYLIST_TTL_SECONDS = 24 * 60 * 60

function getInstitutionId(body) {
  const institutionId = typeof body?.institutionId === 'string' ? body.institutionId.trim() : ''
  if (!institutionId || institutionId.length > 255) {
    throw new Error('A valid institutionId is required')
  }
  return institutionId
}

function getTtlSeconds(body) {
  const ttlSeconds = Number(body?.ttlSeconds)
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < MIN_DENYLIST_TTL_SECONDS || ttlSeconds > MAX_DENYLIST_TTL_SECONDS) {
    throw new Error(`ttlSeconds must be between ${MIN_DENYLIST_TTL_SECONDS} and ${MAX_DENYLIST_TTL_SECONDS}`)
  }
  return ttlSeconds
}

async function parseAndAuthorize(request) {
  const session = await requireAuth()
  requirePlatformAdminSession(session)
  return request.json().catch(() => ({}))
}

export async function POST(request) {
  try {
    const body = await parseAndAuthorize(request)
    const institutionId = getInstitutionId(body)
    const ttlSeconds = getTtlSeconds(body)
    await denyInstitutionalBackend(institutionId, { ttlSeconds })
    return NextResponse.json({ success: true, institutionId, ttlSeconds })
  } catch (error) {
    return publicErrorResponse({
      status: error instanceof HttpError ? error.status : 400,
      code: error instanceof HttpError ? error.code || 'FORBIDDEN' : 'INVALID_BACKEND_REVOCATION_REQUEST',
      message: error instanceof HttpError ? error.message : 'The backend revocation request is invalid.',
      error,
      context: 'admin-institutional-backend-revocation',
    })
  }
}

export async function DELETE(request) {
  try {
    const body = await parseAndAuthorize(request)
    const institutionId = getInstitutionId(body)
    await restoreInstitutionalBackend(institutionId)
    return NextResponse.json({ success: true, institutionId })
  } catch (error) {
    return publicErrorResponse({
      status: error instanceof HttpError ? error.status : 400,
      code: error instanceof HttpError ? error.code || 'FORBIDDEN' : 'INVALID_BACKEND_RESTORE_REQUEST',
      message: error instanceof HttpError ? error.message : 'The backend restore request is invalid.',
      error,
      context: 'admin-institutional-backend-restore',
    })
  }
}
