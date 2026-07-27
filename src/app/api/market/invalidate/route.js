import { NextResponse } from 'next/server'
import {
  requireAuth,
  requireLabOwner,
  requireProviderRole,
  handleGuardError,
  HttpError,
  BadRequestError,
} from '@/utils/auth/guards'
import { publicErrorResponse } from '@/utils/security/publicError'
import { invalidateMarketSnapshots } from '@/server/market/marketSnapshotStore'

/**
 * Invalidates the public market read model after a confirmed provider lab
 * mutation. The request is scoped to a lab owner so it cannot be used as an
 * unauthenticated global cache-flush primitive.
 */
export async function POST(request) {
  try {
    const session = await requireAuth()
    requireProviderRole(session)

    let body
    try {
      body = await request.json()
    } catch {
      throw new BadRequestError('The market invalidation request body is invalid.')
    }

    const labId = body?.labId
    if (labId === undefined || labId === null || labId === '') {
      throw new BadRequestError('Lab ID is required.')
    }

    const numericLabId = Number(labId)
    if (!Number.isSafeInteger(numericLabId) || numericLabId < 0) {
      throw new BadRequestError('Invalid lab ID format.')
    }

    await requireLabOwner(session, labId)
    await invalidateMarketSnapshots()

    return NextResponse.json({ invalidated: true })
  } catch (error) {
    if (error instanceof HttpError) return handleGuardError(error, request)
    return publicErrorResponse({
      status: 500,
      code: 'MARKET_CACHE_INVALIDATION_FAILED',
      message: 'The public market cache could not be invalidated.',
      error,
      context: 'market-cache-invalidation',
    })
  }
}
