import path from 'node:path'
import { promises as fs } from 'node:fs'
import { del, list } from '@vercel/blob'
import getIsVercel from '@/utils/isVercel'

const LAB_ID_PATTERN = /^(?:0|[1-9][0-9]*)$/
const MANAGED_METADATA_PATTERN = /^Lab-[A-Za-z0-9][A-Za-z0-9._-]*\.json$/
const LEGACY_METADATA_ID_PATTERN = /^Lab-[A-Za-z0-9][A-Za-z0-9._-]*-(\d+)\.json$/

export function normalizeRetainedLabId(value) {
  const normalized = String(value ?? '').trim()
  if (!LAB_ID_PATTERN.test(normalized)) {
    throw new Error('Invalid labId')
  }
  return normalized
}

function normalizeManagedMetadataUri(value) {
  if (typeof value !== 'string') return null
  const candidate = value.trim().replace(/^\/+/, '')
  return MANAGED_METADATA_PATTERN.test(candidate) ? candidate : null
}

async function deleteLocalFile(filePath) {
  try {
    await fs.unlink(filePath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function listBlobUrls(prefix, exactPath = null) {
  const urls = []
  let cursor

  do {
    const result = await list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) })
    urls.push(...(result.blobs || [])
      .filter((blob) => !exactPath || blob.pathname === exactPath)
      .map((blob) => blob.url)
      .filter(Boolean))
    cursor = result.hasMore ? result.cursor : null
  } while (cursor)

  return urls
}

/**
 * Removes all Marketplace-owned storage for a lab after a verified on-chain
 * deletion. The operation is intentionally idempotent: missing files/blobs
 * are treated as already cleaned.
 */
export async function cleanupLabStorage({ labId, metadataUri } = {}) {
  const normalizedLabId = normalizeRetainedLabId(labId)
  // The managed filename is the canonical tokenURI and is not required to
  // contain the globally assigned lab ID. Use the explicit URI when present;
  // retain the suffix-based lookup only for legacy records that predate this
  // invariant.
  const managedMetadataUri = normalizeManagedMetadataUri(metadataUri)

  if (!getIsVercel()) {
    const dataRoot = path.resolve(process.cwd(), 'data')
    const publicRoot = path.resolve(process.cwd(), 'public')
    const removed = []

    const metadataEntries = await fs.readdir(dataRoot, { withFileTypes: true }).catch((error) => {
      if (error?.code === 'ENOENT') return []
      throw error
    })
    for (const entry of metadataEntries) {
      if (!entry.isFile()) continue
      const match = entry.name.match(MANAGED_METADATA_PATTERN)
      if (!match) continue
      if (managedMetadataUri) {
        if (entry.name !== managedMetadataUri) continue
      } else {
        const legacyMatch = entry.name.match(LEGACY_METADATA_ID_PATTERN)
        if (!legacyMatch || legacyMatch[1] !== normalizedLabId) continue
      }
      if (await deleteLocalFile(path.join(dataRoot, entry.name))) {
        removed.push(`data/${entry.name}`)
      }
    }

    const assetRoot = path.join(publicRoot, normalizedLabId)
    await fs.rm(assetRoot, { recursive: true, force: true })
    removed.push(`public/${normalizedLabId}`)

    return { storage: 'local', removed }
  }

  const assetUrls = await listBlobUrls(`data/${normalizedLabId}/`)
  const metadataUrls = managedMetadataUri
    ? await listBlobUrls(`data/${managedMetadataUri}`, `data/${managedMetadataUri}`)
    : []
  const urls = [...new Set([...assetUrls, ...metadataUrls])]
  if (urls.length > 0) await del(urls)

  return { storage: 'blob', removed: urls }
}
