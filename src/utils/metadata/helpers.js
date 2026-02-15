import getBaseUrl from '@/utils/env/baseUrl'

export const sanitizeProviderNameForUri = (name) => {
  const base = (name || 'Provider').toString().trim()
  const sanitized = base
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return sanitized || 'Provider'
}

export const resolveOnchainLabUri = (uri) => {
  if (!uri) return uri
  const trimmed = String(uri).trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed) || /^ipfs:\/\//i.test(trimmed)) {
    return trimmed
  }
  if (trimmed.startsWith('Lab-')) {
    const blobBase = process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL
    if (blobBase && typeof blobBase === 'string' && blobBase.trim().length > 0) {
      const normalizedBase = blobBase.replace(/\/+$/, '')
      return `${normalizedBase}/data/${trimmed}`
    }
    const baseUrl = getBaseUrl().replace(/\/+$/, '')
    return `${baseUrl}/api/metadata?uri=${encodeURIComponent(trimmed)}`
  }
  return trimmed
}
