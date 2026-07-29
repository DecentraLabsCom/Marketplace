import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { drainFmuRevocationOutbox } from '@/utils/auth/revokeFmuContexts'

export const runtime = 'nodejs'

function hasValidWorkerToken(request) {
  const configured = String(process.env.FMU_REVOCATION_RECONCILIATION_TOKEN || '')
  const provided = String(request.headers.get('authorization') || '')
    .replace(/^Bearer\s+/i, '')
  if (!configured || !provided) return false
  const configuredBytes = Buffer.from(configured, 'utf8')
  const providedBytes = Buffer.from(provided, 'utf8')
  return configuredBytes.length === providedBytes.length
    && timingSafeEqual(configuredBytes, providedBytes)
}

export async function POST(request) {
  if (!hasValidWorkerToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await drainFmuRevocationOutbox()
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('FMU revocation reconciliation failed:', error)
    return NextResponse.json(
      { error: 'FMU revocation reconciliation is temporarily unavailable' },
      { status: 503 },
    )
  }
}
