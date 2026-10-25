import { NextResponse } from 'next/server'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import { GatewayValidationError, buildGatewayTargetUrl, gatewayFetch, resolveLabAccessGateway } from '@/utils/api/gatewayProxy'
import { requireFmuResourceContext, resolveFmuGatewayHeaders } from '@/utils/auth/fmuGatewayContext'
import { publicErrorResponse } from '@/utils/security/publicError'

const checkRate = createRateLimiter({ operation: 'simulation-access', windowMs: 60_000, maxRequests: 30 })

/** Resolve the reservation's effective FMI variable capabilities from its Gateway. */
export async function POST(request) {
  try {
    const origin = request.headers.get('origin')
    const fetchSite = request.headers.get('sec-fetch-site')
    if ((fetchSite && fetchSite !== 'same-origin') || (origin && origin !== new URL(request.url).origin && fetchSite !== 'same-origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'A JSON access request is required.' }, { status: 400 })
    }
    const { labId, reservationKey } = body
    if (!/^\d{1,78}$/.test(String(labId || '')) || typeof reservationKey !== 'string' || !reservationKey || reservationKey.length > 256) {
      return NextResponse.json({ error: 'labId and reservationKey are required.' }, { status: 400 })
    }

    const gatewayBaseUrl = await resolveLabAccessGateway({ labId })
    const context = await requireFmuResourceContext(request, { labId, reservationKey, gatewayOrigin: gatewayBaseUrl })
    const limited = createRateLimitResponse(await checkRate(request, { userId: context?.userBinding || context?.resourceSessionId }))
    if (limited) return limited

    const upstream = await gatewayFetch(buildGatewayTargetUrl(gatewayBaseUrl, '/fmu/api/v1/simulations/access'), {
      headers: resolveFmuGatewayHeaders(request, { labId, reservationKey, gatewayOrigin: gatewayBaseUrl, context }),
      cache: 'no-store',
      signal: request.signal,
    })
    if (!upstream.ok) throw new GatewayValidationError('The provider could not resolve variable access for this reservation.', upstream.status)
    const access = await upstream.json()
    if (!access || typeof access !== 'object' || Array.isArray(access)
      || !access.variables || typeof access.variables !== 'object' || Array.isArray(access.variables)
      || !Array.isArray(access.modelVariables) || access.modelVariables.length > 100_000) {
      throw new GatewayValidationError('The provider returned an invalid variable access policy.', 502)
    }
    const variables = {}
    for (const [name, permission] of Object.entries(access.variables)) {
      if (!name || name.length > 512 || !permission || typeof permission !== 'object' || Array.isArray(permission)) {
        throw new GatewayValidationError('The provider returned an invalid variable access policy.', 502)
      }
      const writeAt = permission.writeAt ?? []
      if (typeof permission.read !== 'boolean' || !Array.isArray(writeAt)
        || writeAt.some((phase) => !['initialization', 'runtime'].includes(phase))
        || new Set(writeAt).size !== writeAt.length) {
        throw new GatewayValidationError('The provider returned an invalid variable access policy.', 502)
      }
      if (permission.read || writeAt.length) variables[name] = { read: permission.read, writeAt }
    }
    const variableFields = new Set([
      'name', 'causality', 'type', 'variability', 'valueReference', 'initial', 'start', 'min', 'max',
      'dimensions', 'description', 'displayName', 'displayUnit', 'enumItems', 'nominal', 'unit', 'quantity', 'declaredType',
    ])
    const seenNames = new Set()
    const modelVariables = []
    for (const variable of access.modelVariables) {
      if (!variable || typeof variable !== 'object' || Array.isArray(variable)
        || typeof variable.name !== 'string' || variable.name.length > 512 || seenNames.has(variable.name)) {
        throw new GatewayValidationError('The provider returned invalid FMU variable metadata.', 502)
      }
      seenNames.add(variable.name)
      if (!Object.hasOwn(variables, variable.name)) continue
      const safeVariable = Object.fromEntries(Object.entries(variable).filter(([key]) => variableFields.has(key)))
      if (variables[variable.name].read !== true) delete safeVariable.start
      modelVariables.push(safeVariable)
    }
    return NextResponse.json({
      policySource: typeof access.policySource === 'string' ? access.policySource : 'unavailable',
      policyVersion: typeof access.policyVersion === 'string' ? access.policyVersion : '',
      variables,
      modelVariables,
    }, { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } })
  } catch (error) {
    return publicErrorResponse({ status: error instanceof GatewayValidationError ? error.status : 500,
      code: 'SIMULATION_ACCESS_FAILED', message: 'Variable access could not be resolved for this reservation.', error, context: 'simulation-access' })
  }
}
