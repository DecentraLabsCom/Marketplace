import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import getIsVercel from '@/utils/isVercel'
import {
  GatewayValidationError,
  fetchAllowlistedJson,
} from '@/utils/api/gatewayProxy'

export const MAX_METADATA_BYTES = 1024 * 1024

const localMetadataNamePattern = /^Lab-[A-Za-z0-9][A-Za-z0-9._-]*\.json$/
const metadataAttributeSchema = z.object({
  trait_type: z.string().min(1).max(128),
  value: z.unknown(),
}).passthrough()
const metadataDocumentSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(20_000).optional(),
  image: z.string().max(4_096).optional(),
  images: z.array(z.string().max(4_096)).max(64).optional(),
  attributes: z.array(metadataAttributeSchema).max(256).optional(),
}).passthrough()

export class MetadataFetchError extends Error {
  constructor(message, status = 502, code = 'METADATA_FETCH_ERROR') {
    super(message)
    this.name = 'MetadataFetchError'
    this.status = status
    this.code = code
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

  const result = await fetchAllowlistedJson(
    parsedUrl.toString(),
    { cache: 'no-store' },
    { maxBytes: MAX_METADATA_BYTES, additionalAllowedOrigins },
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

export function isMetadataPolicyError(error) {
  return error instanceof MetadataFetchError || error instanceof GatewayValidationError
}
