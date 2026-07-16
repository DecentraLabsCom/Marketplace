import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import getIsVercel from '@/utils/isVercel'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import {
  GatewayValidationError,
  fetchAllowlistedJson,
} from '@/utils/api/gatewayProxy'
import { getDynamicMetadataExceptionOrigins } from '@/utils/metadata/metadataOriginExceptions'
import { resolveProviderMetadataOrigins } from '@/utils/metadata/providerMetadataOrigins'

export const MAX_METADATA_BYTES = 1024 * 1024

const localMetadataNamePattern = /^Lab-[A-Za-z0-9][A-Za-z0-9._-]*\.json$/
const boundedString = z.string().max(4_096)
const boundedStringList = z.array(boundedString).max(64)
const classificationEntrySchema = z.object({
  scheme: z.string().max(32),
  schemeVersion: z.string().max(128).optional(),
  code: z.string().max(32),
  label: z.string().max(256),
}).strip()
const attributeValueSchemas = {
  classification: z.array(classificationEntrySchema).max(64),
  classificationPrimaryScheme: z.string().max(32),
  educationalProgramLinked: z.boolean(),
  keywords: z.array(z.string().max(128)).max(64),
  timeSlots: z.array(z.number().int().positive().max(86_400)).max(64),
  pricing: z.object({
    displayAmount: z.string().max(64), displayUnit: z.string().max(16), rawPricePerSecond: z.string().max(64),
    roundingMode: z.string().max(64), billingMode: z.string().max(64),
  }).strip(),
  bookingMode: z.string().max(64),
  allowedDurationRange: z.object({ unit: z.string().max(16), min: z.number().int().positive(), max: z.number().int().positive() }).strip(),
  allowedDurations: z.array(z.object({ unit: z.string().max(16), value: z.number().int().positive() }).strip()).max(128),
  periodRules: z.object({ startGranularity: z.string().max(16), allowCustomDateRange: z.boolean(), minDurationDays: z.number().positive(), maxDurationDays: z.number().positive() }).strip(),
  opens: z.number().int().nullable(), closes: z.number().int().nullable(),
  additionalImages: boundedStringList, docs: boundedStringList,
  availableDays: z.array(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])).max(7),
  availableHours: z.object({ start: z.string().max(5), end: z.string().max(5) }).strip(),
  maxConcurrentUsers: z.number().int().positive().max(10_000),
  unavailableWindows: z.array(z.object({ startUnix: z.number().int().positive(), endUnix: z.number().int().positive(), reason: z.string().max(512) }).strip()).max(128),
  termsOfUse: z.object({ url: boundedString.optional(), version: z.string().max(128).optional(), effectiveDate: z.string().max(64).optional(), sha256: z.string().max(128).optional() }).strip(),
  timezone: z.string().max(128), resourceType: z.enum(['lab', 'fmu']), fmuFileName: z.string().max(512),
  fmiVersion: z.string().max(64), simulationType: z.string().max(64),
  modelVariables: z.array(z.object({ name: z.string().max(256), description: z.string().max(1_024).optional(), type: z.string().max(64).optional(), unit: z.string().max(64).optional() }).strip()).max(512),
  defaultStartTime: z.number(), defaultStopTime: z.number(), defaultStepSize: z.number(),
}

const sanitizeMetadataAttributes = (attributes) => (Array.isArray(attributes) ? attributes : [])
  .slice(0, 128)
  .flatMap((attribute) => {
    const traitType = typeof attribute?.trait_type === 'string' ? attribute.trait_type : ''
    const schema = attributeValueSchemas[traitType]
    if (!schema) return []
    const parsed = schema.safeParse(attribute?.value)
    return parsed.success ? [{ trait_type: traitType, value: parsed.data }] : []
  })

const metadataDocumentSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(20_000).optional(),
  image: z.string().max(4_096).optional(),
  images: z.array(z.string().max(4_096)).max(64).optional(),
  attributes: z.array(z.unknown()).max(128).optional(),
}).strip().transform((metadata) => ({
  ...metadata,
  ...(metadata.attributes ? { attributes: sanitizeMetadataAttributes(metadata.attributes) } : {}),
}))

export class MetadataFetchError extends Error {
  constructor(message, status = 502, code = 'METADATA_FETCH_ERROR') {
    super(message)
    this.name = 'MetadataFetchError'
    this.status = status
    this.code = code
  }
}

const configuredBlobOrigin = () => {
  try {
    const blobUrl = new URL(String(process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL || ''))
    return blobUrl.protocol === 'https:' && !blobUrl.username && !blobUrl.password
      ? blobUrl.origin
      : null
  } catch {
    return null
  }
}

export function isLocalMetadataUri(metadataUri) {
  return typeof metadataUri === 'string' && localMetadataNamePattern.test(metadataUri)
}

export function validateMetadataDocument(metadata) {
  const parsed = metadataDocumentSchema.safeParse(metadata)
  if (!parsed.success) {
    throw new MetadataFetchError('Metadata document does not match the expected schema', 422, 'INVALID_SCHEMA')
  }
  return parsed.data
}

export async function fetchMetadataJson(
  metadataUri,
  { cacheBuster = null, additionalAllowedOrigins = [] } = {},
) {
  let parsedUrl
  try {
    parsedUrl = new URL(metadataUri)
  } catch {
    throw new MetadataFetchError('Invalid metadata URI', 400, 'INVALID_URI')
  }
  if (cacheBuster) parsedUrl.searchParams.set('t', cacheBuster)

  const dynamicExceptionOrigins = await getDynamicMetadataExceptionOrigins()
  const result = await fetchAllowlistedJson(
    parsedUrl.toString(),
    { cache: 'no-store' },
    {
      maxBytes: MAX_METADATA_BYTES,
      additionalAllowedOrigins: [
        ...additionalAllowedOrigins,
        ...dynamicExceptionOrigins,
        configuredBlobOrigin(),
      ].filter(Boolean),
    },
  )
  if (result.response.status === 404) {
    throw new MetadataFetchError('External metadata not found', 404, 'EXTERNAL_NOT_FOUND')
  }
  if (!result.response.ok) {
    throw new MetadataFetchError(
      `External metadata fetch failed with status ${result.response.status}`,
      502,
      'EXTERNAL_FETCH_ERROR',
    )
  }
  return { response: result.response, data: validateMetadataDocument(result.data) }
}

function parseJsonDocument(content) {
  try {
    return validateMetadataDocument(JSON.parse(content))
  } catch (error) {
    if (error instanceof MetadataFetchError) throw error
    throw new MetadataFetchError('Metadata document is not valid JSON', 422, 'INVALID_JSON')
  }
}

async function loadLocalMetadata(metadataUri) {
  if (!isLocalMetadataUri(metadataUri)) {
    throw new MetadataFetchError('Invalid local metadata filename', 400, 'INVALID_URI')
  }

  const dataDirectory = path.resolve(process.cwd(), 'data')
  const filePath = path.resolve(dataDirectory, metadataUri)
  const relativePath = path.relative(dataDirectory, filePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new MetadataFetchError('Metadata path escapes the data directory', 400, 'INVALID_URI')
  }

  try {
    const fileContent = await fs.readFile(filePath)
    if (fileContent.byteLength > MAX_METADATA_BYTES) {
      throw new MetadataFetchError('Metadata response exceeds the maximum size', 413, 'TOO_LARGE')
    }
    return parseJsonDocument(fileContent.toString('utf8'))
  } catch (error) {
    if (error instanceof MetadataFetchError) throw error
    if (error?.code === 'ENOENT') {
      throw new MetadataFetchError('Metadata file not found', 404, 'FILE_NOT_FOUND')
    }
    throw new MetadataFetchError('Failed to read metadata file', 500, 'FILE_READ_ERROR')
  }
}

function buildBlobMetadataUrl(metadataUri) {
  const baseUrl = process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL
  if (!baseUrl) {
    throw new MetadataFetchError('Metadata blob storage is not configured', 503, 'BLOB_NOT_CONFIGURED')
  }

  let parsedBase
  try {
    parsedBase = new URL(baseUrl)
  } catch {
    throw new MetadataFetchError('Metadata blob storage URL is invalid', 503, 'BLOB_NOT_CONFIGURED')
  }
  if (parsedBase.protocol !== 'https:' || parsedBase.username || parsedBase.password) {
    throw new MetadataFetchError('Metadata blob storage must use a credential-free HTTPS URL', 503, 'BLOB_NOT_CONFIGURED')
  }

  const base = baseUrl.replace(/\/+$/, '')
  return `${base}/data/${metadataUri}`
}

async function loadBlobMetadata(metadataUri, cacheBuster) {
  const blobUrl = buildBlobMetadataUrl(metadataUri)
  const parsedBlobUrl = new URL(blobUrl)
  if (cacheBuster) parsedBlobUrl.searchParams.set('t', cacheBuster)

  const { response, data } = await fetchAllowlistedJson(
    parsedBlobUrl.toString(),
    { cache: 'no-store' },
    { allowedOrigins: [parsedBlobUrl.origin], maxBytes: MAX_METADATA_BYTES },
  )
  if (response.status === 404) {
    throw new MetadataFetchError('Metadata blob not found', 404, 'BLOB_NOT_FOUND')
  }
  if (!response.ok) {
    throw new MetadataFetchError(`Metadata blob fetch failed with status ${response.status}`, 502, 'BLOB_FETCH_ERROR')
  }
  return validateMetadataDocument(data)
}

export async function loadMetadataDocument(
  metadataUri,
  { cacheBuster = null, additionalAllowedOrigins = [] } = {},
) {
  if (!metadataUri || typeof metadataUri !== 'string') return null

  if (metadataUri.startsWith('Lab-')) {
    if (!isLocalMetadataUri(metadataUri)) {
      throw new MetadataFetchError('Invalid local metadata filename', 400, 'INVALID_URI')
    }
    return getIsVercel()
      ? loadBlobMetadata(metadataUri, cacheBuster)
      : loadLocalMetadata(metadataUri)
  }

  const { data } = await fetchMetadataJson(metadataUri, {
    cacheBuster,
    additionalAllowedOrigins,
  })
  return data
}

const normalizeLabId = (labId) => {
  try {
    const normalized = BigInt(labId)
    if (normalized < 0n) throw new Error('negative')
    return normalized
  } catch {
    throw new MetadataFetchError('Invalid laboratory identifier', 400, 'INVALID_LAB_ID')
  }
}

export async function loadOnChainLabMetadata(labId, { cacheBuster = null } = {}) {
  const normalizedLabId = normalizeLabId(labId)
  let metadataUri
  try {
    const contract = await getContractInstance()
    metadataUri = await contract.tokenURI(normalizedLabId)
  } catch (error) {
    if (error instanceof MetadataFetchError) throw error
    throw new MetadataFetchError('The on-chain metadata reference could not be resolved', 502, 'TOKEN_URI_UNAVAILABLE')
  }
  if (!metadataUri || typeof metadataUri !== 'string') {
    throw new MetadataFetchError('The laboratory has no metadata reference', 404, 'TOKEN_URI_NOT_FOUND')
  }
  const normalizedUri = metadataUri.trim()
  const providerOrigins = isLocalMetadataUri(normalizedUri)
    ? []
    : await resolveProviderMetadataOrigins({ labId: normalizedLabId }).catch(() => [])
  return {
    metadataUri: normalizedUri,
    metadata: await loadMetadataDocument(normalizedUri, {
      cacheBuster,
      additionalAllowedOrigins: providerOrigins,
    }),
  }
}

const resolveDeclaredAssetUrl = (value) => {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/')) return value
  const isBlobDeployment = process.env.NODE_ENV === 'production' || Boolean(process.env.NEXT_PUBLIC_VERCEL)
  const blobBase = String(process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL || '').replace(/\/+$/, '')
  if (!isBlobDeployment || !blobBase) return value
  if (value.startsWith('/data/')) return `${blobBase}${value}`
  if (/^\/\d+\//.test(value)) return `${blobBase}/data${value}`
  return value
}

const normalizeDeclaredHttpsUrl = (value) => {
  try {
    const parsed = new URL(resolveDeclaredAssetUrl(value))
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) return null
    return parsed.toString()
  } catch {
    return null
  }
}

export async function assertDeclaredLabResource(labId, requestedUri, resourceType) {
  const requested = normalizeDeclaredHttpsUrl(requestedUri)
  if (!requested) {
    throw new MetadataFetchError('Resource URL is invalid', 400, 'INVALID_RESOURCE_URI')
  }
  const { metadata } = await loadOnChainLabMetadata(labId)
  const attributes = metadata?.attributes || []
  const attributeValue = (traitType) => attributes.find((entry) => entry.trait_type === traitType)?.value || []
  const declared = resourceType === 'image'
    ? [metadata?.image, ...(metadata?.images || []), ...(attributeValue('additionalImages') || [])]
    : attributeValue('docs') || []
  const declaredUrls = new Set(declared.map(normalizeDeclaredHttpsUrl).filter(Boolean))
  if (!declaredUrls.has(requested)) {
    throw new MetadataFetchError('Resource is not declared by the on-chain metadata', 403, 'RESOURCE_NOT_DECLARED')
  }
  return requested
}

export function isMetadataPolicyError(error) {
  return error instanceof MetadataFetchError || error instanceof GatewayValidationError
}
