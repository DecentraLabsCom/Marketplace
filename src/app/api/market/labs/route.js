import { NextResponse } from 'next/server'
import {
  getMarketCatalogueSnapshot,
} from '@/server/market/getMarketCatalogueSnapshot'
import {
  MARKET_CATALOGUE_STATUS,
  toPublicMarketSnapshot,
} from '@/server/market/getMarketLabsSnapshot'
import { parseMarketPageParams } from '@/utils/market/marketPagination'
import { parseMarketCatalogueFilters } from '@/server/market/marketCatalogueFilters'

export async function GET(request) {
  const includeUnlisted = request.nextUrl.searchParams.get('includeUnlisted') === 'true'
  let page
  let filters

  try {
    page = parseMarketPageParams({
      cursor: request.nextUrl.searchParams.get('cursor'),
      limit: request.nextUrl.searchParams.get('limit'),
    })
    filters = parseMarketCatalogueFilters(request.nextUrl.searchParams)
  } catch {
    return NextResponse.json({ error: 'Invalid market catalogue parameters' }, { status: 400 })
  }

  const snapshot = await getMarketCatalogueSnapshot({
    includeUnlisted,
    ...page,
    filters,
  })
  const publicSnapshot = toPublicMarketSnapshot(snapshot)
  const isUnavailable = snapshot?.catalogueStatus === MARKET_CATALOGUE_STATUS.UNAVAILABLE
  const isStale = snapshot?.catalogueStatus === MARKET_CATALOGUE_STATUS.STALE
  const response = NextResponse.json(publicSnapshot, { status: isUnavailable ? 503 : 200 })

  response.headers.set('Cache-Control', isUnavailable
    ? 'no-store'
    : isStale
      ? 'private, no-store'
      : 'public, s-maxage=60, stale-while-revalidate=300')

  if (isUnavailable) {
    response.headers.set('Retry-After', '30')
  }

  if (!isStale && !isUnavailable && snapshot?.metrics) {
    const durationMs = Math.max(0, Number(snapshot.metrics.durationMs) || 0)
    const rpcCalls = Math.max(0, Number(snapshot.metrics.rpcCalls) || 0)
    const payloadBytes = new TextEncoder().encode(JSON.stringify(publicSnapshot)).byteLength
    response.headers.set('Server-Timing', `market;dur=${durationMs}`)
    response.headers.set('X-Market-RPC-Calls', String(rpcCalls))
    response.headers.set('X-Market-Payload-Bytes', String(payloadBytes))
  }

  return response
}
