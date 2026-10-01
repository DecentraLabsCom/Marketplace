import { NextResponse } from 'next/server'
import { getMarketplaceJwks } from '@/utils/auth/marketplaceJwks'
import devLog from '@/utils/dev/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const jwks = await getMarketplaceJwks()
    return NextResponse.json(jwks, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    devLog.error('[JWKS] Failed to serve Marketplace verification keys', error)
    return NextResponse.json(
      { error: 'Unable to serve Marketplace JWKS' },
      { status: 500 },
    )
  }
}
