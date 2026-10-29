import { NextResponse } from 'next/server'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import { GatewayValidationError, buildGatewayTargetUrl, gatewayFetch, resolveLabAccessGateway } from '@/utils/api/gatewayProxy'
import { requireFmuResourceContext, resolveFmuGatewayHeaders } from '@/utils/auth/fmuGatewayContext'
import { publicErrorResponse } from '@/utils/security/publicError'

const checkRate = createRateLimiter({ operation: 'simulation-parameter-sets', windowMs: 60_000, maxRequests: 30 })

function isSafeParameterValue(value, depth = 0) {
  if (depth > 1) return false
  if (typeof value === 'boolean') return true
  if (typeof value === 'string') return value.length <= 65_536
  if (typeof value === 'number') {
    return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))
  }
  return Array.isArray(value)
    && value.length <= 4096
    && value.every((item) => !Array.isArray(item) && item !== null && isSafeParameterValue(item, depth + 1))
}

function validatePresets(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !Array.isArray(payload.presets) || payload.presets.length > 24) {
    throw new GatewayValidationError('The provider returned invalid simulation configurations.', 502)
  }

  const presets = []
  const seenIds = new Set()
  for (const preset of payload.presets) {
    if (!preset || typeof preset !== 'object' || Array.isArray(preset)
      || typeof preset.id !== 'string' || !/^preset-\d{1,4}$/.test(preset.id) || seenIds.has(preset.id)
      || typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 180
      || typeof preset.description !== 'string' || preset.description.length > 1024
      || !preset.parameters || typeof preset.parameters !== 'object' || Array.isArray(preset.parameters)) {
      throw new GatewayValidationError('The provider returned invalid simulation configurations.', 502)
    }
    const entries = Object.entries(preset.parameters)
    if (!entries.length || entries.length > 2048 || entries.some(([name, value]) => (
      !name || name.length > 512 || !isSafeParameterValue(value)
    ))) {
      throw new GatewayValidationError('The provider returned invalid simulation configuration values.', 502)
    }
    seenIds.add(preset.id)
    presets.push({
      id: preset.id,
      name: preset.name.trim(),
      description: preset.description,
      parameters: Object.fromEntries(entries),
    })
  }
  return presets
}

/** Return provider-authored FMU presets that are writable for this reservation. */
export async function POST(request) {
  try {
    const origin = request.headers.get('origin')
    const fetchSite = request.headers.get('sec-fetch-site')
    if ((fetchSite && fetchSite !== 'same-origin') || (origin && origin !== new URL(request.url).origin && fetchSite !== 'same-origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'A JSON request is required.' }, { status: 400 })
    }
    const { labId, reservationKey } = body
    if (!/^\d{1,78}$/.test(String(labId || '')) || typeof reservationKey !== 'string' || !reservationKey || reservationKey.length > 256) {
      return NextResponse.json({ error: 'labId and reservationKey are required.' }, { status: 400 })
    }

    const gatewayBaseUrl = await resolveLabAccessGateway({ labId })
    const context = await requireFmuResourceContext(request, { labId, reservationKey, gatewayOrigin: gatewayBaseUrl })
    const limited = createRateLimitResponse(await checkRate(request, { userId: context?.userBinding || context?.resourceSessionId }))
    if (limited) return limited

    const upstream = await gatewayFetch(buildGatewayTargetUrl(gatewayBaseUrl, '/fmu/api/v1/simulations/parameter-sets'), {
      headers: resolveFmuGatewayHeaders(request, { labId, reservationKey, gatewayOrigin: gatewayBaseUrl, context }),
      cache: 'no-store',
      signal: request.signal,
    })
    if (!upstream.ok) throw new GatewayValidationError('The provider could not load simulation configurations.', upstream.status)
    return NextResponse.json({ presets: validatePresets(await upstream.json()) }, {
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    })
  } catch (error) {
    return publicErrorResponse({
      status: error instanceof GatewayValidationError ? error.status : 500,
      code: 'SIMULATION_PARAMETER_SETS_FAILED',
      message: 'Provider simulation configurations could not be loaded.',
      error,
      context: 'simulation-parameter-sets',
    })
  }
}
