import { promises as fs } from 'node:fs'
import path from 'node:path'
import { del, list } from '@vercel/blob'
import {
  MAX_TEMP_BYTES_PER_SESSION,
  MAX_TEMP_FILES_PER_SESSION,
  resolveManagedLocalPath,
} from './fileSecurity'

export const TEMP_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000

export class TemporaryUploadLimitError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TemporaryUploadLimitError'
    this.code = 'TEMPORARY_UPLOAD_QUOTA_EXCEEDED'
  }
}

async function collectLocalFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        files.push(...await collectLocalFiles(entryPath))
      } else if (entry.isFile()) {
        const stat = await fs.stat(entryPath)
        files.push({ path: entryPath, size: stat.size, modifiedAt: stat.mtimeMs })
      }
    }
    return files
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function inspectLocalNamespace(publicRoot, namespace, now) {
  const namespacePath = resolveManagedLocalPath(publicRoot, `temp/${namespace}`)
  const files = await collectLocalFiles(namespacePath)
  const active = []
  for (const file of files) {
    if (now - file.modifiedAt >= TEMP_UPLOAD_TTL_MS) {
      await fs.unlink(file.path).catch((error) => {
        if (error.code !== 'ENOENT') throw error
      })
    } else {
      active.push(file)
    }
  }
  return active.reduce((summary, file) => ({
    count: summary.count + 1,
    bytes: summary.bytes + file.size,
  }), { count: 0, bytes: 0 })
}

async function inspectBlobNamespace(namespace, now) {
  const prefix = `data/temp/${namespace}/`
  const active = []
  let cursor
  do {
    const result = await list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) })
    for (const blob of result.blobs || []) {
      const uploadedAt = new Date(blob.uploadedAt).getTime()
      if (Number.isFinite(uploadedAt) && now - uploadedAt >= TEMP_UPLOAD_TTL_MS) {
        await del(blob.url)
      } else {
        active.push(blob)
      }
    }
    cursor = result.hasMore ? result.cursor : null
  } while (cursor)

  return active.reduce((summary, blob) => ({
    count: summary.count + 1,
    bytes: summary.bytes + Number(blob.size || 0),
  }), { count: 0, bytes: 0 })
}

/**
 * Enforces per-session temporary-upload quotas and opportunistically removes
 * expired objects before accepting a new upload. Storage inspection is done
 * server-side, so a client cannot reset the quota by changing a path.
 */
export async function enforceTemporaryUploadQuota({
  publicRoot,
  namespace,
  isVercel,
  incomingBytes = 0,
  now = Date.now(),
}) {
  const summary = isVercel
    ? await inspectBlobNamespace(namespace, now)
    : await inspectLocalNamespace(publicRoot, namespace, now)

  if (summary.count + 1 > MAX_TEMP_FILES_PER_SESSION) {
    throw new TemporaryUploadLimitError('Temporary file quota exceeded')
  }
  if (summary.bytes + incomingBytes > MAX_TEMP_BYTES_PER_SESSION) {
    throw new TemporaryUploadLimitError('Temporary byte quota exceeded')
  }
  return summary
}

