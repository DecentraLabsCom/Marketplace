import { NextResponse } from 'next/server'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import {
  buildGatewayTargetUrl,
  gatewayFetch,
  resolveLabAccessGateways,
} from '@/utils/api/gatewayProxy'

const checkRate = createRateLimiter({ operation: 'market-lab-status', windowMs: 60_000, maxRequests: 60 })
const MAX_LAB_IDS = 50
const STATUS_STATES = new Set(['ready', 'reachable', 'busy', 'not_ready', 'unknown'])
const STATUS_SEVERITIES = new Set(['positive', 'warning', 'critical', 'neutral'])
const STATUS_SOURCES = new Set(['lab_station_heartbeat', 'guacamole_tcp_probe', 'status_unavailable'])
const STATUS_REASONS = new Set([
  'station_ready',
  'local_session_active',
  'local_mode_enabled',
  'station_not_ready',
  'heartbeat_stale',
  'heartbeat_missing',
  'heartbeat_invalid',
  'target_reachable',
  'target_unreachable',
  'target_invalid',
  'target_probe_error',
  'lab_not_mapped',
  'gateway_unavailable',
  'status_unavailable',
])

const normalizeLabIds = (raw) => {
  const values = String(raw || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const result = []
  const seen = new Set()

  for (const value of values) {
    if (!/^\d{1,20}$/.test(value)) throw new Error('Invalid labIds')
    const numeric = Number(value)
    if (!Number.isSafeInteger(numeric)) throw new Error('Invalid labIds')
    const normalized = String(numeric)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  if (result.length === 0 || result.length > MAX_LAB_IDS) throw new Error('Invalid labIds')
  return result
}

const unknownStatus = (labId, reason = 'status_unavailable') => ({
  labId: String(labId),
  state: 'unknown',
  reason: STATUS_REASONS.has(reason) ? reason : 'status_unavailable',
  source: 'status_unavailable',
  observedAt: null,
  ageSeconds: null,
  severity: 'neutral',
  generatedAt: new Date().toISOString(),
})

const normalizeStatus = (labId, value) => {
  if (!value || typeof value !== 'object') return unknownStatus(labId)
  const ageSeconds = Number(value.ageSeconds)
  const observedAt = typeof value.observedAt === 'string' && value.observedAt.length <= 64
    ? value.observedAt
    : null
  return {
    labId: String(labId),
    state: STATUS_STATES.has(value.state) ? value.state : 'unknown',
    reason: STATUS_REASONS.has(value.reason) ? value.reason : 'status_unavailable',
    source: STATUS_SOURCES.has(value.source) ? value.source : 'status_unavailable',
    observedAt,
    ageSeconds: Number.isInteger(ageSeconds) && ageSeconds >= 0 && ageSeconds <= 31_536_000
      ? ageSeconds
      : null,
    severity: STATUS_SEVERITIES.has(value.severity) ? value.severity : 'neutral',
    generatedAt: typeof value.generatedAt === 'string' && value.generatedAt.length <= 64
      ? value.generatedAt
      : new Date().toISOString(),
  }
}

const readGatewayStatuses = async (gateway, labIds) => {
  const url = buildGatewayTargetUrl(gateway, '/public/labs/status', {
    labIds: labIds.join(','),
  })
  const response = await gatewayFetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return new Map(labIds.map((labId) => [labId, unknownStatus(labId, 'gateway_unavailable')]))

  const payload = await response.json()
  const statuses = Array.isArray(payload?.statuses) ? payload.statuses : []
  const byId = new Map(statuses.map((status) => [String(status?.labId), status]))
  return new Map(labIds.map((labId) => [labId, normalizeStatus(labId, byId.get(labId))]))
}

export async function GET(request) {
  const rateLimitResponse = createRateLimitResponse(await checkRate(request))
  if (rateLimitResponse) return rateLimitResponse

  let labIds
  try {
    const searchParams = request.nextUrl?.searchParams || new URL(request.url).searchParams
    labIds = normalizeLabIds(searchParams.get('labIds'))
  } catch {
    return NextResponse.json({ error: 'Invalid labIds' }, { status: 400 })
  }

  const statuses = new Map(labIds.map((labId) => [labId, unknownStatus(labId)]))
  try {
    const gateways = await resolveLabAccessGateways({ labIds })

    const grouped = new Map()
    gateways.forEach(([labId, gateway]) => {
      if (!gateway) {
        statuses.set(labId, unknownStatus(labId, 'gateway_unavailable'))
        return
      }
      if (!grouped.has(gateway)) grouped.set(gateway, [])
      grouped.get(gateway).push(labId)
    })

    await Promise.all([...grouped.entries()].map(async ([gateway, ids]) => {
      try {
        const gatewayStatuses = await readGatewayStatuses(gateway, ids)
        gatewayStatuses.forEach((status, labId) => statuses.set(labId, status))
      } catch {
        ids.forEach((labId) => statuses.set(labId, unknownStatus(labId, 'gateway_unavailable')))
      }
    }))
  } catch {
    // The UI deliberately renders amber/unknown when chain or gateway data is
    // unavailable; this endpoint remains useful even during partial outage.
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    statuses: labIds.map((labId) => statuses.get(labId) || unknownStatus(labId)),
  }, {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
