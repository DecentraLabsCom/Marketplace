import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import {
  GatewayValidationError,
  buildGatewayTargetUrl,
  gatewayFetch,
  resolveLabAccessGateway,
} from '@/utils/api/gatewayProxy'
import { publicErrorResponse } from '@/utils/security/publicError'

const checkRate = createRateLimiter({ operation: 'aas-shell', windowMs: 60_000, maxRequests: 30 })
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }
const MAX_SUBMODEL_REFERENCES = 64
const MAX_IDENTIFIER_LENGTH = 2048
const MAX_PROPERTY_VALUE_LENGTH = 4096
const FALLBACK_SUBMODEL_SUFFIXES = [
  'nameplate',
  'simulationModels',
  'technicalData',
  'executionCapabilities',
  'assetInterfaces',
  'contactInformation',
  'handoverDocumentation',
]

function encodeAasId(id) {
  return Buffer.from(id).toString('base64url')
}

function safePropertyValue(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null
  const text = String(value)
  return text.length <= MAX_PROPERTY_VALUE_LENGTH ? text : text.slice(0, MAX_PROPERTY_VALUE_LENGTH)
}

/** Flatten bounded Property, MultiLanguageProperty and collection elements. */
function extractProperties(submodelElements, options = {}) {
  const maxElements = options.maxElements || 512
  const properties = {}
  let visited = 0

  const visit = (elements, depth) => {
    if (!Array.isArray(elements) || depth > 12 || visited >= maxElements) return
    for (const element of elements) {
      if (visited >= maxElements || !element || typeof element !== 'object') return
      visited += 1

      if (element.idShort && element.modelType === 'Property') {
        const value = safePropertyValue(element.value)
        if (value !== null) properties[element.idShort] = value
      } else if (element.idShort && element.modelType === 'MultiLanguageProperty') {
        const text = Array.isArray(element.value)
          ? element.value.find((item) => typeof item?.text === 'string')?.text
          : null
        const value = safePropertyValue(text)
        if (value !== null) properties[element.idShort] = value
      }

      if (Array.isArray(element.value) && (
        element.modelType === 'SubmodelElementCollection'
        || element.modelType === 'SubmodelElementList'
      )) {
        visit(element.value, depth + 1)
      }
    }
  }

  visit(submodelElements, 0)
  return properties
}

function extractCollectionProperties(submodelElements, collectionIdShort) {
  if (!Array.isArray(submodelElements)) return {}
  const collection = submodelElements.find(
    (element) => element?.modelType === 'SubmodelElementCollection'
      && element.idShort === collectionIdShort,
  )
  return extractProperties(collection ? collection.value : submodelElements)
}

function extractSubmodelIds(shell) {
  if (!Array.isArray(shell?.submodels)) return []

  return [...new Set(shell.submodels
    .map((reference) => {
      if (!Array.isArray(reference?.keys)) return null
      const key = reference.keys.find(
        (candidate) => String(candidate?.type || '').toLowerCase() === 'submodel'
          && typeof candidate.value === 'string',
      )
      const id = key?.value?.trim()
      return id && id.length <= MAX_IDENTIFIER_LENGTH ? id : null
    })
    .filter(Boolean))].slice(0, MAX_SUBMODEL_REFERENCES)
}

function semanticIdText(submodel) {
  const keys = submodel?.semanticId?.keys
  return Array.isArray(keys)
    ? keys.map((key) => String(key?.value || '')).join(' ')
    : ''
}

function extractOperationDescriptors(submodelElements, options = {}) {
  const maxOperations = options.maxOperations || 64
  const operations = []

  const visit = (elements, depth) => {
    if (!Array.isArray(elements) || depth > 12 || operations.length >= maxOperations) return
    for (const element of elements) {
      if (!element || typeof element !== 'object' || operations.length >= maxOperations) return
      const isAction = semanticIdText(element).toLowerCase().includes('actionaffordance')
      const isActionContainer = ['actions', 'forms'].includes(String(element.idShort || '').toLowerCase())
      if ((element.modelType === 'Operation' || (isAction && !isActionContainer)) && typeof element.idShort === 'string') {
        const variableNames = (key) => (Array.isArray(element[key])
          ? element[key]
            .map((variable) => variable?.value?.idShort)
            .filter((value) => typeof value === 'string' && value.length <= 128)
          : [])
        const descriptor = {
          idShort: element.idShort,
          semanticId: semanticIdText(element),
          inputVariables: variableNames('inputVariables'),
          outputVariables: variableNames('outputVariables'),
        }
        const href = firstProperty(extractProperties(element.value), ['href'])
        if (href) descriptor.href = href
        operations.push(descriptor)
      }
      if (Array.isArray(element.value) && (
        element.modelType === 'SubmodelElementCollection'
        || element.modelType === 'SubmodelElementList'
      )) {
        visit(element.value, depth + 1)
      }
    }
  }

  visit(submodelElements, 0)
  return operations
}

function classifySubmodel(submodel, requestedId) {
  const identity = [submodel?.idShort, submodel?.id, requestedId, semanticIdText(submodel)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  if (identity.includes('nameplate')) return 'nameplate'
  if (identity.includes('simulationmodels')) return 'simulation'
  if (identity.includes('executioncapabilities') || identity.includes('capabilitydescription')) return 'execution'
  if (identity.includes('assetinterfacesdescription')) return 'interfaces'
  if (identity.includes('contactinformations')) return 'contact'
  if (identity.includes('handoverdocumentation')) return 'handover'
  if (identity.includes('technicaldata') || identity.includes('operationalstatus') || identity.includes('operationaldata')) {
    return 'operational'
  }
  return null
}

function firstProperty(properties, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()))
  const entry = Object.entries(properties || {}).find(([key]) => wanted.has(key.toLowerCase()))
  return entry?.[1] ?? null
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['true', '1', 'yes', 'ready', 'up'].includes(normalized)) return true
  if (['false', '0', 'no', 'notready', 'unavailable', 'down'].includes(normalized)) return false
  return null
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && Number.isInteger(number) && number >= 0 ? number : null
}

function buildSimulationInfo(submodel) {
  const props = extractCollectionProperties(submodel?.submodelElements, 'SimulationModel')
  const documentationUrls = Object.entries(props)
    .filter(([key]) => /^documentationurl(?:_\d+)?$/i.test(key))
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([, value]) => value)
    .filter(Boolean)

  return {
    license: firstProperty(props, ['LicenseModel', 'License']),
    documentationUrl: documentationUrls[0] || firstProperty(props, ['DocumentationUrl']),
    documentationUrls: [...new Set(documentationUrls)],
    contactEmail: firstProperty(props, ['ContactEmail']),
  }
}

function buildContactInfo(submodel) {
  const props = extractProperties(submodel?.submodelElements)
  return { contactEmail: firstProperty(props, ['EmailAddress', 'ContactEmail']) }
}

function buildHandoverInfo(submodel) {
  const files = []
  const visit = (elements, depth = 0) => {
    if (!Array.isArray(elements) || depth > 12) return
    for (const element of elements) {
      if (!element || typeof element !== 'object') continue
      if (element.modelType === 'File' && typeof element.value === 'string' && element.value) files.push(element.value)
      if (Array.isArray(element.value)) visit(element.value, depth + 1)
    }
  }
  visit(submodel?.submodelElements)
  return { documentationUrls: [...new Set(files)] }
}

function buildInterfaceInfo(submodel) {
  return { operations: extractOperationDescriptors(submodel?.submodelElements) }
}

function buildOperationalInfo(submodel, submodelId) {
  const props = extractProperties(submodel?.submodelElements)
  return {
    submodelId,
    idShort: typeof submodel?.idShort === 'string' ? submodel.idShort : null,
    status: firstProperty(props, ['ResourceStatus', 'LabStatus', 'RunnerStatus', 'Status']),
    ready: parseBoolean(firstProperty(props, ['ReadyFlag', 'Ready'])),
    backendMode: firstProperty(props, ['ExecutionBackend', 'BackendMode']),
    modelAvailable: parseBoolean(firstProperty(props, ['ModelAvailable'])),
    activeSessions: parseNumber(firstProperty(props, ['ActiveSimulationCount', 'ActiveSessionCount'])),
    maxConcurrentSessions: parseNumber(firstProperty(props, ['MaxConcurrentSimulations', 'MaxConcurrentSessions'])),
    lastHeartbeat: firstProperty(props, ['LastHeartbeatTimestamp', 'HeartbeatTimestamp']),
    lastSync: firstProperty(props, ['LastSyncTimestamp', 'SyncTimestamp']),
    localModeEnabled: parseBoolean(firstProperty(props, ['LocalModeEnabled'])),
    localSessionActive: parseBoolean(firstProperty(props, ['LocalSessionActive'])),
  }
}

function buildExecutionInfo(submodel, submodelId) {
  const props = extractProperties(submodel?.submodelElements)
  return {
    submodelId,
    idShort: typeof submodel?.idShort === 'string' ? submodel.idShort : null,
    executionClass: firstProperty(props, ['ExecutionClass']),
    invocationModel: firstProperty(props, ['InvocationModel']),
    operationExposure: firstProperty(props, ['OperationExposure']),
    reservationRequired: parseBoolean(firstProperty(props, ['ReservationRequired'])),
    authorizationScheme: firstProperty(props, ['AuthorizationScheme']),
    accessProtocol: firstProperty(props, ['AccessProtocol']),
    backendMode: firstProperty(props, ['BackendMode']),
    operations: [
      ...extractOperationDescriptors(submodel?.submodelElements),
      ...extractCapabilityDescriptors(submodel?.submodelElements),
    ],
  }
}

function extractCapabilityDescriptors(submodelElements, options = {}) {
  const maxCapabilities = options.maxCapabilities || 64
  const capabilities = []
  const visit = (elements, depth) => {
    if (!Array.isArray(elements) || depth > 12 || capabilities.length >= maxCapabilities) return
    for (const element of elements) {
      if (!element || typeof element !== 'object' || capabilities.length >= maxCapabilities) continue
      if (element.modelType === 'Capability' && typeof element.idShort === 'string') {
        const description = Array.isArray(element.description)
          ? element.description.find((item) => typeof item?.text === 'string')?.text
          : null
        capabilities.push({
          idShort: element.idShort,
          semanticId: semanticIdText(element),
          description: description || null,
          inputVariables: [],
          outputVariables: [],
        })
      }
      if (Array.isArray(element.value)) visit(element.value, depth + 1)
    }
  }
  visit(submodelElements, 0)
  return capabilities
}

async function fetchReferencedSubmodels(gatewayBaseUrl, shell, labId) {
  const shellId = `urn:decentralabs:lab:${labId}`
  const referencedIds = extractSubmodelIds(shell)
  const submodelIds = referencedIds.length > 0
    ? referencedIds
    : FALLBACK_SUBMODEL_SUFFIXES.map((suffix) => `${shellId}:sm:${suffix}`)
  const fetched = []

  for (const submodelId of submodelIds) {
    const submodelUrl = buildGatewayTargetUrl(
      gatewayBaseUrl,
      `/aas/submodels/${encodeAasId(submodelId)}`,
    )
    try {
      devLog.log(`[aas/shell] Fetching referenced submodel from ${submodelUrl}`)
      const response = await gatewayFetch(submodelUrl, { cache: 'no-store' })
      if (response.ok) {
        const submodel = await response.json()
        fetched.push({ submodel, submodelId })
      }
    } catch (error) {
      devLog.warn('[aas/shell] Referenced submodel fetch failed (non-fatal):', error?.message)
    }
  }

  return fetched
}

/**
 * GET /api/aas/shell?labId=1
 *
 * Fetches the provider's shell and discovers the submodels referenced by that
 * shell. This supports generated FMU/physical shells as well as arbitrary
 * provider-managed external AAS identifiers.
 */
export async function GET(request) {
  const rateLimitResponse = createRateLimitResponse(await checkRate(request))
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { searchParams } = new URL(request.url)
    const labId = searchParams.get('labId')
    const rawShell = searchParams.get('raw') === 'true'

    if (!labId) {
      return NextResponse.json({ error: 'Missing required parameter: labId' }, { status: 400 })
    }

    const gatewayBaseUrl = await resolveLabAccessGateway({ labId })
    const shellId = `urn:decentralabs:lab:${labId}`
    const shellUrl = buildGatewayTargetUrl(
      gatewayBaseUrl,
      `/aas/shells/${encodeAasId(shellId)}`,
    )

    devLog.log(`[aas/shell] Fetching shell from ${shellUrl}`)
    const shellRes = await gatewayFetch(shellUrl, { cache: 'no-store' })

    if (shellRes.status === 404) return NextResponse.json({ notFound: true }, { status: 404 })
    if (shellRes.status === 403) {
      return NextResponse.json(
        { notFound: true, reason: 'AAS is not available on this gateway (Lite mode)' },
        { status: 404 },
      )
    }
    if (!shellRes.ok) {
      const errBody = await shellRes.text()
      devLog.error(`[aas/shell] Shell fetch error ${shellRes.status}`, { bodyBytes: errBody.length })
      return publicErrorResponse({
        status: Number.isInteger(shellRes.status) ? shellRes.status : 502,
        code: 'AAS_GATEWAY_REQUEST_FAILED',
        message: 'The laboratory model could not be loaded.',
        error: new Error(`AAS gateway returned ${shellRes.status}`),
        context: 'aas-shell-gateway',
      })
    }

    const shell = await shellRes.json()
    if (rawShell) {
      return NextResponse.json(shell, {
        status: 200,
        headers: NO_STORE_HEADERS,
      })
    }

    const referencedSubmodels = await fetchReferencedSubmodels(gatewayBaseUrl, shell, labId)

    let nameplate = null
    let simulationInfo = null
    let operationalInfo = null
    let executionInfo = null
    let interfaceInfo = null
    let contactInfo = null
    let handoverInfo = null
    for (const { submodel, submodelId } of referencedSubmodels) {
      const kind = classifySubmodel(submodel, submodelId)
      if (kind === 'nameplate' && nameplate === null) {
        nameplate = extractProperties(submodel?.submodelElements)
      } else if (kind === 'simulation' && simulationInfo === null) {
        simulationInfo = buildSimulationInfo(submodel)
      } else if (kind === 'operational' && operationalInfo === null) {
        operationalInfo = buildOperationalInfo(submodel, submodelId)
      } else if (kind === 'execution' && executionInfo === null) {
        executionInfo = buildExecutionInfo(submodel, submodelId)
      } else if (kind === 'interfaces' && interfaceInfo === null) {
        interfaceInfo = buildInterfaceInfo(submodel)
      } else if (kind === 'contact' && contactInfo === null) {
        contactInfo = buildContactInfo(submodel)
      } else if (kind === 'handover' && handoverInfo === null) {
        handoverInfo = buildHandoverInfo(submodel)
      }
    }

    if (interfaceInfo?.operations?.length) {
      executionInfo = executionInfo || { submodelId: null, idShort: null, operations: [] }
      executionInfo.operations = [
        ...(executionInfo.operations || []),
        ...interfaceInfo.operations,
      ]
    }
    if (contactInfo || handoverInfo) {
      simulationInfo = simulationInfo || {
        license: null,
        documentationUrl: null,
        documentationUrls: [],
        contactEmail: null,
      }
      simulationInfo.contactEmail = contactInfo?.contactEmail || simulationInfo.contactEmail
      simulationInfo.documentationUrls = [
        ...(simulationInfo.documentationUrls || []),
        ...(handoverInfo?.documentationUrls || []),
      ].filter((value, index, values) => values.indexOf(value) === index)
      simulationInfo.documentationUrl = simulationInfo.documentationUrls[0] || simulationInfo.documentationUrl
    }

    return NextResponse.json(
      { shell, nameplate, simulationInfo, operationalInfo, executionInfo },
      { status: 200, headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    if (error instanceof GatewayValidationError) {
      return publicErrorResponse({
        status: error.status || 400,
        code: 'INVALID_GATEWAY_REQUEST',
        message: 'The laboratory model request is invalid.',
        error,
        context: 'aas-shell-validation',
      })
    }
    return publicErrorResponse({
      status: 500,
      code: 'AAS_REQUEST_FAILED',
      message: 'The laboratory model could not be loaded.',
      error,
      context: 'aas-shell',
    })
  }
}
