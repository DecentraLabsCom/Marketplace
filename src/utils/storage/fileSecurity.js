import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'

export const UPLOAD_FOLDERS = Object.freeze(['images', 'docs'])
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const MAX_TEMP_FILES_PER_SESSION = 100
export const MAX_TEMP_BYTES_PER_SESSION = 100 * 1024 * 1024

const UUID_FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|jpeg|png|gif|webp|pdf|txt|doc|docx)$/i
const SAFE_PERMANENT_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/
const SESSION_NAMESPACE_PATTERN = /^[a-f0-9]{32}$/
const LAB_ID_PATTERN = /^(?:0|[1-9][0-9]*)$/

const CONTENT_TYPES_BY_FOLDER = Object.freeze({
  images: Object.freeze(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  docs: Object.freeze([
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
})

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

export function validateDestinationFolder(value) {
  const folder = typeof value === 'string' ? value.trim() : ''
  if (!UPLOAD_FOLDERS.includes(folder)) {
    throw new Error('Invalid destination folder')
  }
  return folder
}

export function validateLabId(value) {
  const labId = String(value ?? '').trim()
  if (!LAB_ID_PATTERN.test(labId)) {
    throw new Error('Invalid labId')
  }
  return labId
}

export function getSessionUploadNamespace(session) {
  const identity = session?.sessionId || session?.id || session?.email
  if (!identity) throw new Error('Session identity is required')
  return createHash('sha256')
    .update(`marketplace-temp-upload-v1:${String(identity)}`)
    .digest('hex')
    .slice(0, 32)
}

const EXTENSION_BY_CONTENT_TYPE = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
})

export function buildStoredFilename(_originalName, contentType = '') {
  const canonicalExtension = EXTENSION_BY_CONTENT_TYPE[contentType]
  if (canonicalExtension) return `${randomUUID()}${canonicalExtension}`

  // Keep a safe fallback for callers that do not yet have a detected type.
  // The upload route always supplies the magic-byte-derived content type.
  const extension = path.extname(String(_originalName || '')).toLowerCase()
  const allowedExtension = /^\.(?:jpg|jpeg|png|gif|webp|pdf|txt|doc|docx)$/.test(extension)
    ? extension
    : '.bin'
  return `${randomUUID()}${allowedExtension}`
}

function isPrefix(buffer, bytes) {
  return bytes.every((byte, index) => buffer[index] === byte)
}

export function detectUploadContentType(buffer, declaredType = '') {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || [])
  const leadingText = source.subarray(0, 4096).toString('utf8').trimStart().toLowerCase()

  if (declaredType.toLowerCase() === 'image/svg+xml' || /<svg(?:\s|>)/i.test(leadingText))
    throw new Error('SVG uploads are not allowed')
  if (isPrefix(source, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (isPrefix(source, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (source.subarray(0, 6).toString('ascii') === 'GIF87a' || source.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif'
  if (source.subarray(0, 4).toString('ascii') === 'RIFF' && source.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (source.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf'
  if (isPrefix(source, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'application/msword'
  if (isPrefix(source, [0x50, 0x4b, 0x03, 0x04]) && declaredType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return declaredType
  }

  if (!source.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(source)
      return 'text/plain'
    } catch {
      // Continue to the controlled rejection below.
    }
  }

  throw new Error('File content type could not be verified')
}

export function isContentTypeAllowed(folder, contentType) {
  return CONTENT_TYPES_BY_FOLDER[folder]?.includes(contentType) === true
}

export function parseManagedFilePath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    throw new Error('Invalid managed file path')
  }

  const input = rawPath.trim()
  let relative = input
  let sourceUrl = null
  if (/^https?:\/\//i.test(input)) {
    try {
      sourceUrl = new URL(input)
    } catch {
      throw new Error('Invalid managed file path')
    }
    if (sourceUrl.search || sourceUrl.hash) throw new Error('Managed file path cannot contain query or fragment')
    if (!sourceUrl.pathname.startsWith('/data/')) throw new Error('Invalid managed blob path')
    relative = sourceUrl.pathname.slice('/data/'.length)
  }

  const normalized = normalizePath(relative)
  const segments = normalized.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\0'))) {
    throw new Error('Invalid managed file path')
  }

  if (segments[0] === 'temp') {
    if (segments.length !== 4 || !SESSION_NAMESPACE_PATTERN.test(segments[1])) throw new Error('Invalid managed temporary path')
    const folder = validateDestinationFolder(segments[2])
    if (!UUID_FILENAME_PATTERN.test(segments[3])) throw new Error('Invalid managed temporary filename')
    return {
      kind: 'temporary',
      namespace: segments[1],
      folder,
      filename: segments[3],
      relativePath: segments.join('/'),
      blobPath: `data/${segments.join('/')}`,
      sourceUrl,
    }
  }

  if (segments.length !== 3 || !LAB_ID_PATTERN.test(segments[0])) throw new Error('Invalid managed permanent path')
  const folder = validateDestinationFolder(segments[1])
  if (!SAFE_PERMANENT_FILENAME_PATTERN.test(segments[2])) throw new Error('Invalid managed filename')
  return {
    kind: 'permanent',
    labId: segments[0],
    folder,
    filename: segments[2],
    relativePath: segments.join('/'),
    blobPath: `data/${segments.join('/')}`,
    sourceUrl,
  }
}

export function resolveManagedLocalPath(publicRoot, relativePath) {
  const root = path.resolve(publicRoot)
  const target = path.resolve(root, normalizePath(relativePath))
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error('Managed file path escapes storage root')
  }
  return target
}

export function resolveManagedMetadataPath(publicRoot, filename) {
  const root = path.resolve(publicRoot)
  const candidate = String(filename || '')
  const basename = path.basename(candidate)
  const windowsBasename = path.win32.basename(candidate)

  if (!candidate || basename !== candidate || windowsBasename !== candidate) {
    throw new Error('Managed metadata filename must not contain path components')
  }

  const target = path.resolve(root, basename)
  if (path.dirname(target) !== root) {
    throw new Error('Managed metadata filename escapes storage root')
  }
  return target
}

export function isTrustedBlobUrl(url) {
  if (!(url instanceof URL)) return false
  const configured = process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL
  if (!configured) return false
  try {
    return new URL(configured).origin === url.origin
  } catch {
    return false
  }
}

export function getContentTypesForFolder(folder) {
  return CONTENT_TYPES_BY_FOLDER[folder] || []
}
