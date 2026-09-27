import { NextResponse } from 'next/server'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import {
  buildGatewayTargetUrl,
  gatewayFetch,
  resolveLabAccessGateways,
} from '@/utils/api/gatewayProxy'

const checkRate = createRateLimiter({ operation: 'market-lab-status', windowMs: 60_000, maxRequests: 60 })
const MAX_LAB_IDS = 50
const STATUS_CAPABILITIES = ['physicalLab', 'fmu']
const STATUS_STATES = new Set(['ready', 'reachable', 'busy', 'not_ready', 'unknown'])
const ACCESS_STATES = new Set(['ready', 'busy', 'inaccessible', 'unknown'])
const WAKE_STATES = new Set(['verified', 'configured', 'failed', 'unknown'])
const AVAILABILITY_STATES = new Set(['now', 'on_demand', 'recoverable', 'unavailable', 'unknown'])
const EXECUTOR_STATES = new Set(['ready', 'not_ready', 'unknown'])
const CAPACITY_STATES = new Set(['available', 'busy', 'unknown'])
const STATUS_SEVERITIES = new Set(['positive', 'warning', 'critical', 'neutral'])
const STATUS_SOURCES = new Set([
  'lab_station_heartbeat',
  'guacamole_tcp_probe',
  'fmu_runner_health',
  'reservation_wake_operation',
  'host_configuration',
  'status_unavailable',
])
const STATUS_REASONS = new Set([
  'station_ready',
  'fmu_ready',
  'fmu_capacity_exhausted',
  'fmu_not_ready',
  'fmu_runner_unavailable',
  'local_session_active',
  'lab_user_session_active',
  'remote_session_active',
  'session_status_unavailable',
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

const accessFromState = (state) => {
  if (state === 'ready' || state === 'reachable') return 'ready'
  if (state === 'busy') return 'busy'
  if (state === 'not_ready') return 'inaccessible'
  return 'unknown'
}

const availabilityFromState = (state, wakeState) => {
  if (state === 'ready' || state === 'reachable') return 'now'
  if (state === 'busy') return 'unavailable'
  if (wakeState === 'verified') return 'on_demand'
  if (wakeState === 'configured') return 'recoverable'
  if (wakeState === 'failed' || state === 'not_ready') return 'unavailable'
  return 'unknown'
}

const normalizeWake = (value) => {
  const raw = typeof value === 'string' ? { state: value } : value
  if (!raw || typeof raw !== 'object') {
    return { state: 'unknown', source: 'status_unavailable', observedAt: null, ageSeconds: null }
  }
  const ageSeconds = Number(raw.ageSeconds)
  return {
    state: WAKE_STATES.has(raw.state) ? raw.state : 'unknown',
    source: STATUS_SOURCES.has(raw.source) ? raw.source : 'status_unavailable',
    observedAt: typeof raw.observedAt === 'string' && raw.observedAt.length <= 64
      ? raw.observedAt
      : null,
    ageSeconds: Number.isInteger(ageSeconds) && ageSeconds >= 0 && ageSeconds <= 31_536_000
      ? ageSeconds
      : null,
  }
}

const normalizeExecutor = (value) => {
  const raw = value && typeof value === 'object' ? value : {}
  const ageSeconds = Number(raw.ageSeconds)
  return {
    state: EXECUTOR_STATES.has(raw.state) ? raw.state : 'unknown',
    source: STATUS_SOURCES.has(raw.source) ? raw.source : 'status_unavailable',
    observedAt: typeof raw.observedAt === 'string' && raw.observedAt.length <= 64
      ? raw.observedAt
      : null,
    ageSeconds: Number.isInteger(ageSeconds) && ageSeconds >= 0 && ageSeconds <= 31_536_000
      ? ageSeconds
      : null,
  }
}

const normalizeCapacity = (value) => {
  const raw = value && typeof value === 'object' ? value : {}
  const normalizeCount = (count) => {
    const parsed = Number(count)
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000_000 ? parsed : null
  }
  const ageSeconds = Number(raw.ageSeconds)
  return {
    state: CAPACITY_STATES.has(raw.state) ? raw.state : 'unknown',
    active: normalizeCount(raw.active),
    maximum: normalizeCount(raw.maximum),
    available: normalizeCount(raw.available),
    source: STATUS_SOURCES.has(raw.source) ? raw.source : 'status_unavailable',
    observedAt: typeof raw.observedAt === 'string' && raw.observedAt.length <= 64
      ? raw.observedAt
      : null,
    ageSeconds: Number.isInteger(ageSeconds) && ageSeconds >= 0 && ageSeconds <= 31_536_000
      ? ageSeconds
      : null,
  }
}

const unknownStatus = (labId, reason = 'status_unavailable', resourceType = null) => {
  const base = {
    labId: String(labId),
    state: 'unknown',
    reason: STATUS_REASONS.has(reason) ? reason : 'status_unavailable',
    source: 'status_unavailable',
    observedAt: null,
    ageSeconds: null,
    severity: 'neutral',
    access: 'unknown',
    availability: 'unknown',
    generatedAt: new Date().toISOString(),
  }
  if (resourceType === 'fmu') {
    base.resourceType = 'fmu'
    base.executor = normalizeExecutor(null)
    base.capacity = normalizeCapacity(null)
  } else {
    base.wake = {
      state: 'unknown',
      source: 'status_unavailable',
      observedAt: null,
      ageSeconds: null,
    }
  }
  return base
}

const isFmuProjection = (value, capability = null) => (
  capability === 'fmu'
  || value?.resourceType === 'fmu'
  || value?.source === 'fmu_runner_health'
  || String(value?.reason || '').startsWith('fmu_')
)

const normalizeStatusProjection = (labId, value, capability = null) => {
  if (!value || typeof value !== 'object') {
    return unknownStatus(labId, 'status_unavailable', capability === 'fmu' ? 'fmu' : null)
  }
  const isFmu = isFmuProjection(value, capability)
  const ageSeconds = Number(value.ageSeconds)
  const observedAt = typeof value.observedAt === 'string' && value.observedAt.length <= 64
    ? value.observedAt
    : null
  const state = STATUS_STATES.has(value.state) ? value.state : 'unknown'
  const wake = isFmu ? null : normalizeWake(value.wake)
  const access = ACCESS_STATES.has(value.access)
    ? value.access
    : accessFromState(state)
  const normalized = {
    labId: String(labId),
    state,
    reason: STATUS_REASONS.has(value.reason) ? value.reason : 'status_unavailable',
    source: STATUS_SOURCES.has(value.source) ? value.source : 'status_unavailable',
    observedAt,
    ageSeconds: Number.isInteger(ageSeconds) && ageSeconds >= 0 && ageSeconds <= 31_536_000
      ? ageSeconds
      : null,
    severity: STATUS_SEVERITIES.has(value.severity) ? value.severity : 'neutral',
    access,
    availability: AVAILABILITY_STATES.has(value.availability)
      ? value.availability
      : availabilityFromState(state, wake?.state || 'unknown'),
    generatedAt: typeof value.generatedAt === 'string' && value.generatedAt.length <= 64
      ? value.generatedAt
      : new Date().toISOString(),
  }
  if (isFmu) {
    normalized.resourceType = 'fmu'
    normalized.executor = normalizeExecutor(value.executor)
    normalized.capacity = normalizeCapacity(value.capacity)
  } else {
    normalized.wake = normalizeWake(value.wake)
  }
  return normalized
}

const normalizeStatus = (labId, value) => {
  const normalized = normalizeStatusProjection(labId, value)
  if (!value || typeof value !== 'object' || !value.capabilities || typeof value.capabilities !== 'object') {
    return normalized
  }

  const capabilities = Object.fromEntries(STATUS_CAPABILITIES
    .filter((capability) => Object.prototype.hasOwnProperty.call(value.capabilities, capability))
    .map((capability) => [
      capability,
      normalizeStatusProjection(labId, value.capabilities[capability], capability),
    ]))
  return Object.keys(capabilities).length > 0
    ? { ...normalized, capabilities }
    : normalized
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
