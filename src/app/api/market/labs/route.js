import { NextResponse } from 'next/server'
import {
  getMarketLabsSnapshot,
  toPublicMarketSnapshot,
} from '@/server/market/getMarketLabsSnapshot'
import { parseMarketPageParams } from '@/utils/market/marketPagination'

export async function GET(request) {
  const includeUnlisted = request.nextUrl.searchParams.get('includeUnlisted') === 'true'
  let page

  try {
    page = parseMarketPageParams({
      cursor: request.nextUrl.searchParams.get('cursor'),
      limit: request.nextUrl.searchParams.get('limit'),
    })
  } catch {
    return NextResponse.json({ error: 'Invalid market pagination parameters' }, { status: 400 })
  }

  const snapshot = await getMarketLabsSnapshot({
    includeUnlisted,
    ...page,
  })
  const publicSnapshot = toPublicMarketSnapshot(snapshot)
  const response = NextResponse.json(publicSnapshot)

  response.headers.set(
    'Cache-Control',
    'public, s-maxage=60, stale-while-revalidate=300',
  )

  if (snapshot?.metrics) {
    const durationMs = Math.max(0, Number(snapshot.metrics.durationMs) || 0)
    const rpcCalls = Math.max(0, Number(snapshot.metrics.rpcCalls) || 0)
    const payloadBytes = new TextEncoder().encode(JSON.stringify(publicSnapshot)).byteLength
    response.headers.set('Server-Timing', `market;dur=${durationMs}`)
    response.headers.set('X-Market-RPC-Calls', String(rpcCalls))
    response.headers.set('X-Market-Payload-Bytes', String(payloadBytes))
  }

  return response
}
