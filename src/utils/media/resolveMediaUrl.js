const isExternalHttpsUrl = (value) => {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false

  try {
    const parsed = new URL(value)
    return !parsed.username && !parsed.password && !parsed.hash
  } catch {
    return false
  }
}

const hasLabId = (labId) => {
  try {
    const value = BigInt(labId)
    return value >= 0n
  } catch {
    return false
  }
}

const isBlobDeployment = () => (
  process.env.NODE_ENV === 'production' || !!process.env.NEXT_PUBLIC_VERCEL
)

/**
 * Keep uploaded relative assets working when the metadata still contains a
 * path returned by local storage. Vercel Blob stores the same asset below
 * /data, while local development serves it directly from /public.
 */
export const resolveStoredAssetUrl = (value) => {
  if (typeof value !== 'string' || !value.startsWith('/')) return value
  if (!isBlobDeployment()) return value

  const blobBase = String(process.env.NEXT_PUBLIC_VERCEL_BLOB_BASE_URL || '').replace(/\/+$/, '')
  if (!blobBase) return value

  if (value.startsWith('/data/')) return `${blobBase}${value}`
  if (/^\/\d+\//.test(value)) return `${blobBase}/data${value}`
  return value
}

/**
 * Serve trusted provider images through the Marketplace origin. This keeps
 * dynamic providers out of next/image remotePatterns and CSP_IMG_SRC.
 */
export const buildMetadataImageProxyUrl = (value, labId) => {
  if (!isExternalHttpsUrl(value) || !hasLabId(labId)) return value

  const params = new URLSearchParams({
    labId: String(labId),
    uri: value,
  })
  return `/api/metadata/image?${params.toString()}`
}

export const resolveLabImageUrl = (value, labId = null) => (
  buildMetadataImageProxyUrl(resolveStoredAssetUrl(value), labId)
)
