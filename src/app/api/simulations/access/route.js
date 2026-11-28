import { NextResponse } from 'next/server'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import { GatewayValidationError, buildGatewayTargetUrl, gatewayFetch, resolveLabAccessGateway } from '@/utils/api/gatewayProxy'
import { requireFmuResourceContext, resolveFmuGatewayHeaders } from '@/utils/auth/fmuGatewayContext'
import { publicErrorResponse } from '@/utils/security/publicError'
import { normalizeFmiLsStruct } from '@/utils/fmiLsStruct'
import { normalizeFmiLsExperiments } from '@/utils/fmiLsExperiments'

const checkRate = createRateLimiter({ operation: 'simulation-access', windowMs: 60_000, maxRequests: 30 })

const MODEL_STRUCTURE_SECTIONS = ['outputs', 'derivatives', 'clockedStates', 'initialUnknowns', 'eventIndicators']
const FMI_ACCESS_CAPABILITIES = new Set([
  'needsExecutionTool', 'canBeInstantiatedOnlyOncePerProcess', 'canNotUseMemoryManagementFunctions',
  'canGetAndSetFMUstate', 'canSerializeFMUstate', 'canHandleVariableCommunicationStepSize',
  'canInterpolateInputs', 'canRunAsynchronuously', 'hasEventMode', 'providesIntermediateUpdate',
  'canReturnEarlyAfterIntermediateUpdate', 'providesEvaluateDiscreteStates',
  'providesDirectionalDerivative', 'providesAdjointDerivatives', 'providesPerElementDependencies',
  'needsCompletedIntegratorStep',
])
const FMI_MODEL_EXCHANGE_CAPABILITIES = new Set([
  'needsExecutionTool', 'canBeInstantiatedOnlyOncePerProcess', 'canNotUseMemoryManagementFunctions',
  'canGetAndSetFMUstate', 'canSerializeFMUstate', 'providesDirectionalDerivative',
  'providesAdjointDerivatives', 'completedIntegratorStepNotNeeded', 'needsCompletedIntegratorStep',
])

function normalizeModelDescription(value, accessibleNames) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const normalized = {}
  for (const field of ['supportsCoSimulation', 'supportsModelExchange']) {
    if (typeof value[field] === 'boolean') normalized[field] = value[field]
  }
  for (const field of ['defaultStartTime', 'defaultStopTime', 'defaultStepSize', 'defaultTolerance']) {
    const number = Number(value[field])
    if (value[field] != null && Number.isFinite(number)) normalized[field] = number
  }
  if (typeof value.timeUnit === 'string' && value.timeUnit.trim()) {
    normalized.timeUnit = value.timeUnit.trim().slice(0, 128)
  }
  for (const field of ['numberOfContinuousStates', 'numberOfEventIndicators']) {
    if (Number.isInteger(value[field]) && value[field] >= 0 && value[field] <= 10_000_000) {
      normalized[field] = value[field]
    }
  }
  if (value.capabilities && typeof value.capabilities === 'object' && !Array.isArray(value.capabilities)) {
    const capabilities = {}
    for (const [field, candidate] of Object.entries(value.capabilities)) {
      if (FMI_ACCESS_CAPABILITIES.has(field) && typeof candidate === 'boolean') capabilities[field] = candidate
    }
    for (const field of ['maxOutputDerivativeOrder', 'recommendedIntermediateInputSmoothness']) {
      if (Number.isInteger(value.capabilities[field]) && value.capabilities[field] >= 0 && value.capabilities[field] <= 64) {
        capabilities[field] = value.capabilities[field]
      }
    }
    const fixedStep = Number(value.capabilities.fixedInternalStepSize)
    if (value.capabilities.fixedInternalStepSize != null && Number.isFinite(fixedStep) && fixedStep > 0) {
      capabilities.fixedInternalStepSize = fixedStep
    }
    if (Object.keys(capabilities).length) normalized.capabilities = capabilities
  }
  if (value.modelExchangeCapabilities && typeof value.modelExchangeCapabilities === 'object'
    && !Array.isArray(value.modelExchangeCapabilities)) {
    const capabilities = {}
    for (const [field, candidate] of Object.entries(value.modelExchangeCapabilities)) {
      if (FMI_MODEL_EXCHANGE_CAPABILITIES.has(field) && typeof candidate === 'boolean') capabilities[field] = candidate
    }
    if (Object.keys(capabilities).length) normalized.modelExchangeCapabilities = capabilities
  }
  if (value.modelStructure && typeof value.modelStructure === 'object' && !Array.isArray(value.modelStructure)) {
    const modelStructure = {}
    for (const section of MODEL_STRUCTURE_SECTIONS) {
      const entries = Array.isArray(value.modelStructure[section]) ? value.modelStructure[section] : []
      const safeEntries = entries.slice(0, 100_000).flatMap((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
        const name = typeof entry.name === 'string' && accessibleNames.has(entry.name) ? entry.name.slice(0, 512) : ''
        const stateName = typeof entry.stateName === 'string' && accessibleNames.has(entry.stateName)
          ? entry.stateName.slice(0, 512)
          : ''
        if (!name && !stateName) return []
        const result = { ...(name ? { name } : {}), ...(stateName ? { stateName } : {}) }
        if (Array.isArray(entry.dependencyNames)) {
          const hasAlignedKinds = Array.isArray(entry.dependenciesKind)
            && entry.dependenciesKind.length === entry.dependencyNames.length
          const dependencies = entry.dependencyNames.flatMap((dependency, index) => (
            typeof dependency === 'string' && accessibleNames.has(dependency)
              ? [{ name: dependency.slice(0, 512), kind: hasAlignedKinds ? entry.dependenciesKind[index] : undefined }]
              : []
          )).slice(0, 4096)
          if (dependencies.length) result.dependencyNames = dependencies.map((dependency) => dependency.name)
          if (dependencies.length && hasAlignedKinds && dependencies.every((dependency) => typeof dependency.kind === 'string')) {
            result.dependenciesKind = dependencies.map((dependency) => dependency.kind.slice(0, 64))
          }
        }
        return [result]
      })
      if (safeEntries.length) modelStructure[section] = safeEntries
    }
    if (Object.keys(modelStructure).length) normalized.modelStructure = modelStructure
  }
  return Object.keys(normalized).length ? normalized : undefined
}

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
        || writeAt.some((phase) => !['initialization', 'runtime', 'configuration', 'reconfiguration'].includes(phase))
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
    const readableVariableNames = new Set(modelVariables
      .filter((variable) => variables[variable.name]?.read === true)
      .map((variable) => variable.name))
    const fmiLsStruct = normalizeFmiLsStruct(access.fmiLsStruct, readableVariableNames)
    if (access.fmiLsExperiments !== undefined
      && (!Array.isArray(access.fmiLsExperiments) || access.fmiLsExperiments.length > 128)) {
      throw new GatewayValidationError('The provider returned invalid FMI-LS-REF experiments.', 502)
    }
    const fmiLsExperiments = normalizeFmiLsExperiments(access.fmiLsExperiments || [])
    const fmiVersion = typeof access.fmiVersion === 'string'
      && access.fmiVersion.trim().length <= 32
      && /^\d+\.\d+(?:\.\d+)?$/.test(access.fmiVersion.trim())
      ? access.fmiVersion.trim()
      : undefined
    const simulationType = ['CoSimulation', 'ModelExchange', 'ScheduledExecution'].includes(access.simulationType)
      ? access.simulationType
      : undefined
    if (access.supportsFmiLsDae !== undefined && typeof access.supportsFmiLsDae !== 'boolean') {
      throw new GatewayValidationError('The provider returned invalid FMI-LS-DAE capability metadata.', 502)
    }
    const fmuState = access.fmuState && typeof access.fmuState === 'object' && !Array.isArray(access.fmuState)
      && typeof access.fmuState.getAndSet === 'boolean' && typeof access.fmuState.serialize === 'boolean'
      ? { getAndSet: access.fmuState.getAndSet, serialize: access.fmuState.serialize }
      : undefined
    const modelDescription = normalizeModelDescription(
      access.modelDescription,
      new Set(modelVariables.map((variable) => variable.name)),
    )
    return NextResponse.json({
      policySource: typeof access.policySource === 'string' ? access.policySource : 'unavailable',
      policyVersion: typeof access.policyVersion === 'string' ? access.policyVersion : '',
      variables,
      modelVariables,
      ...(modelDescription ? { modelDescription } : {}),
      fmiLsExperiments,
      ...(fmiVersion ? { fmiVersion } : {}),
      ...(simulationType ? { simulationType } : {}),
      ...(access.supportsFmiLsDae === true ? { supportsFmiLsDae: true } : {}),
      ...(fmuState ? { fmuState } : {}),
      ...(fmiLsStruct ? { fmiLsStruct } : {}),
    }, { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } })
  } catch (error) {
    return publicErrorResponse({ status: error instanceof GatewayValidationError ? error.status : 500,
      code: 'SIMULATION_ACCESS_FAILED', message: 'Variable access could not be resolved for this reservation.', error, context: 'simulation-access' })
  }
}
