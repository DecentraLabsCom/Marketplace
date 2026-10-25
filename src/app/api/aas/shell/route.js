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
const MAX_FMI_VARIABLE_METADATA_LENGTH = 262_144
const MAX_AAS_SIMULATION_VARIABLES = 20_000
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

function readSubmodelElementValue(element) {
  if (element?.modelType === 'Property' || element?.modelType === 'Range') {
    return safePropertyValue(element.value)
  }
  if (element?.modelType === 'MultiLanguageProperty') {
    const languageValues = Array.isArray(element.value) ? element.value : []
    const text = languageValues.find((item) => String(item?.language || '').toLowerCase() === 'en')?.text
      ?? languageValues.find((item) => typeof item?.text === 'string')?.text
    return safePropertyValue(text)
  }
  return null
}

function variableElementProperties(variableElement) {
  const properties = {}
  if (!Array.isArray(variableElement?.value)) return properties
  for (const element of variableElement.value) {
    if (typeof element?.idShort !== 'string') continue
    const value = readSubmodelElementValue(element)
    if (value !== null) properties[element.idShort] = value
  }
  return properties
}

function parseAasRange(value) {
  if (typeof value !== 'string') return {}
  const text = value.trim()
  if (text.length < 5 || !['[', '('].includes(text[0]) || ![']', ')'].includes(text.at(-1))) return {}
  const comma = text.indexOf(',')
  if (comma < 0) return {}
  const parseBound = (raw) => {
    const text = raw.trim().replace(/[−﹣]/g, '-')
    if (/^[+-]?(?:∞|inf(?:inity)?)$/i.test(text)) return null
    const number = Number(text)
    return Number.isFinite(number) ? number : null
  }
  const minimum = parseBound(text.slice(1, comma))
  const maximum = parseBound(text.slice(comma + 1, -1))
  return {
    ...(minimum !== null ? { min: minimum } : {}),
    ...(maximum !== null ? { max: maximum } : {}),
  }
}

function normalizeFmiMetadataExtension(element) {
  const extension = Array.isArray(element?.extensions)
    ? element.extensions.find((candidate) => candidate?.name === 'decentralabs.fmi.variableMetadata.v1')
    : null
  if (typeof extension?.value !== 'string' || extension.value.length > MAX_FMI_VARIABLE_METADATA_LENGTH) return {}
  try {
    const metadata = JSON.parse(extension.value)
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
    const normalized = {}
    for (const field of ['type', 'causality', 'variability', 'initial', 'quantity', 'displayName']) {
      const value = metadata[field]
      if (typeof value === 'string' && value.trim()) normalized[field] = value.trim().slice(0, 4096)
    }
    if (Number.isInteger(metadata.valueReference) && metadata.valueReference >= 0) {
      normalized.valueReference = metadata.valueReference
    }
    for (const field of ['nominal']) {
      const value = Number(metadata[field])
      if (metadata[field] != null && Number.isFinite(value) && value > 0) normalized[field] = value
    }
    if (typeof metadata.start === 'string' || typeof metadata.start === 'number' || typeof metadata.start === 'boolean') {
      normalized.start = metadata.start
    } else if (Array.isArray(metadata.start) && metadata.start.length <= 4096) {
      const isScalarArray = (value, depth = 0) => depth <= 4 && Array.isArray(value)
        ? value.every((item) => Array.isArray(item)
          ? isScalarArray(item, depth + 1)
          : (item === null || ['string', 'number', 'boolean'].includes(typeof item)))
        : value === null || ['string', 'number', 'boolean'].includes(typeof value)
      if (isScalarArray(metadata.start)) normalized.start = metadata.start
    }
    if (metadata.displayUnit && typeof metadata.displayUnit === 'object' && !Array.isArray(metadata.displayUnit)) {
      const name = typeof metadata.displayUnit.name === 'string' ? metadata.displayUnit.name.trim().slice(0, 64) : ''
      const factor = Number(metadata.displayUnit.factor ?? 1)
      const offset = Number(metadata.displayUnit.offset ?? 0)
      const inverse = metadata.displayUnit.inverse === true
      if (name && Number.isFinite(factor) && factor !== 0 && Number.isFinite(offset) && (!inverse || offset === 0)) {
        normalized.displayUnit = { name, factor, offset, ...(inverse ? { inverse: true } : {}) }
      }
    }
    if (Array.isArray(metadata.dimensions) && metadata.dimensions.length <= 64) {
      normalized.dimensions = metadata.dimensions.flatMap((dimension) => {
        if (!dimension || typeof dimension !== 'object' || Array.isArray(dimension)) return []
        const item = {}
        for (const field of ['start', 'valueReference']) {
          if (Number.isInteger(dimension[field]) && dimension[field] >= 0) item[field] = dimension[field]
        }
        if (typeof dimension.variableName === 'string' && dimension.variableName.trim()) {
          item.variableName = dimension.variableName.trim().slice(0, 256)
        }
        return Object.keys(item).length ? [item] : []
      })
    }
    if (Array.isArray(metadata.enumItems) && metadata.enumItems.length <= 256) {
      normalized.enumItems = metadata.enumItems.flatMap((item) => {
        if (!item || typeof item.name !== 'string' || !Number.isInteger(Number(item.value))) return []
        const option = { name: item.name.trim().slice(0, 256), value: Number(item.value) }
        if (typeof item.description === 'string' && item.description.trim()) {
          option.description = item.description.trim().slice(0, 1024)
        }
        return option.name ? [option] : []
      })
    }
    if (metadata.declaredType && typeof metadata.declaredType === 'object' && !Array.isArray(metadata.declaredType)) {
      const declaredType = {}
      for (const field of ['name', 'type', 'description', 'unit', 'quantity', 'displayUnit']) {
        const value = metadata.declaredType[field]
        if (typeof value === 'string' && value.trim()) declaredType[field] = value.trim().slice(0, 4096)
      }
      for (const field of ['min', 'max']) {
        const value = Number(metadata.declaredType[field])
        if (metadata.declaredType[field] != null && Number.isFinite(value)) declaredType[field] = value
      }
      if (Array.isArray(metadata.declaredType.items) && metadata.declaredType.items.length <= 256) {
        declaredType.items = metadata.declaredType.items.flatMap((item) => {
          if (!item || typeof item.name !== 'string' || !Number.isInteger(Number(item.value))) return []
          const option = { name: item.name.trim().slice(0, 256), value: Number(item.value) }
          if (typeof item.description === 'string' && item.description.trim()) {
            option.description = item.description.trim().slice(0, 1024)
          }
          return option.name ? [option] : []
        })
      }
      if (Object.keys(declaredType).length) normalized.declaredType = declaredType
    }
    return normalized
  } catch {
    return {}
  }
}

function buildSimulationVariables(submodel) {
  const submodelElements = Array.isArray(submodel?.submodelElements) ? submodel.submodelElements : []
  const simulationModel = submodelElements.find((element) => (
    element?.modelType === 'SubmodelElementCollection' && element.idShort === 'SimulationModel'
  ))
  const simulationModelElements = Array.isArray(simulationModel?.value) ? simulationModel.value : []
  const ports = simulationModelElements.find((element) => (
    element?.modelType === 'SubmodelElementCollection' && element.idShort === 'Ports'
  ))
  const variables = []
  const connectors = Array.isArray(ports?.value) ? ports.value : []
  for (const connector of connectors) {
    if (connector?.modelType !== 'SubmodelElementCollection' || !Array.isArray(connector.value)) continue
    for (const element of connector.value) {
      if (element?.modelType !== 'SubmodelElementCollection') continue
      const properties = variableElementProperties(element)
      const name = properties.VariableName
      const standardCausality = String(properties.VariableCausality || '').toLowerCase()
      const metadata = normalizeFmiMetadataExtension(element)
      const causality = metadata.causality || ({ input: 'input', output: 'output', acausal: 'acausal' })[standardCausality]
      if (typeof name !== 'string' || !name || typeof causality !== 'string') continue
      if (variables.length >= MAX_AAS_SIMULATION_VARIABLES) return { variables: [], complete: false }
      const rawType = String(properties.VariableType || 'Real')
      const variable = {
        name,
        type: rawType.toUpperCase() === 'ENUM' ? 'Enumeration' : rawType,
        causality,
        ...(typeof properties.VariableDescription === 'string' ? { description: properties.VariableDescription } : {}),
        ...(typeof properties.UnitList === 'string' && properties.UnitList.toLowerCase() !== 'others'
          ? { unit: properties.UnitList }
          : (typeof properties.UnitDescription === 'string' ? { unit: properties.UnitDescription } : {})),
        ...parseAasRange(properties.Range),
        ...metadata,
      }
      variables.push(variable)
    }
  }
  return { variables, complete: true }
}

function buildContactInfo(submodel) {
  const props = extractProperties(submodel?.submodelElements)
  return { contactEmail: firstProperty(props, ['EmailAddress', 'ContactEmail']) }
}

function buildHandoverInfo(submodel, submodelId) {
  const files = []
  const visualAssets = []
  const visit = (elements, depth = 0) => {
    if (!Array.isArray(elements) || depth > 12) return
    for (const element of elements) {
      if (!element || typeof element !== 'object') continue
      if (element.modelType === 'File' && typeof element.value === 'string' && element.value) {
        const contentType = String(element.contentType || '').split(';', 1)[0].trim().toLowerCase()
        const isGlb = contentType === 'model/gltf-binary'
          || (/\.glb(?:$|[?#])/i.test(element.value) && !contentType)
        const isThreeJsApp = contentType === 'text/html'
          && /^\/(?:digital-twin-apps)\/\d+\/[a-f0-9]{64}\/index\.html$/i.test(element.value)

        if ((isGlb || isThreeJsApp) && typeof element.idShort === 'string' && element.idShort.length <= 128) {
          visualAssets.push({
            submodelId,
            elementIdShort: element.idShort,
            url: element.value,
            contentType: contentType || 'model/gltf-binary',
            renderer: isThreeJsApp ? 'threejs-app' : 'glb',
          })
        } else {
          files.push(element.value)
        }
      }
      if (Array.isArray(element.value)) visit(element.value, depth + 1)
    }
  }
  visit(submodel?.submodelElements)
  return {
    documentationUrls: [...new Set(files)],
    visualAssets: visualAssets.slice(0, 32),
  }
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
    let simulationVariables = null
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
        const parsedVariables = buildSimulationVariables(submodel)
        if (parsedVariables.complete && parsedVariables.variables.length) {
          simulationVariables = parsedVariables.variables
        }
      } else if (kind === 'operational' && operationalInfo === null) {
        operationalInfo = buildOperationalInfo(submodel, submodelId)
      } else if (kind === 'execution' && executionInfo === null) {
        executionInfo = buildExecutionInfo(submodel, submodelId)
      } else if (kind === 'interfaces' && interfaceInfo === null) {
        interfaceInfo = buildInterfaceInfo(submodel)
      } else if (kind === 'contact' && contactInfo === null) {
        contactInfo = buildContactInfo(submodel)
      } else if (kind === 'handover' && handoverInfo === null) {
        handoverInfo = buildHandoverInfo(submodel, submodelId)
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
      {
        shell,
        nameplate,
        simulationInfo,
        ...(simulationVariables ? { simulationVariables } : {}),
        operationalInfo,
        executionInfo,
        ...(handoverInfo?.visualAssets?.length
          ? { visualAssets: handoverInfo.visualAssets }
          : {}),
      },
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
