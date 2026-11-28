import { safeExternalHttpsUrl } from '@/utils/security/safeUrl'

export function resolveGatewayOrigin(accessUri) {
  try {
    return new URL(String(accessUri || '')).origin
  } catch {
    return ''
  }
}

function isAllowedGatewayOrigin(gateway) {
  if (gateway.protocol === 'https:') return true
  if (gateway.protocol !== 'http:') return false

  const hostname = gateway.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1') return true
  if (!/^127(?:\.\d{1,3}){3}$/.test(hostname)) return false
  return hostname.split('.').slice(1).every((part) => Number(part) <= 255)
}

function resolveSceneAssetUrl(value, gatewayOrigin, labId) {
  if (typeof value !== 'string' || value.length > 2048) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes('\\')) return null
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    try {
      const gateway = new URL(gatewayOrigin)
      const rawPath = trimmed.split(/[?#]/, 1)[0]
      if (!isAllowedGatewayOrigin(gateway) || gateway.username || gateway.password || rawPath.includes('%')) return null
      const parsed = new URL(trimmed, gateway.origin)
      const match = parsed.pathname.match(/^\/digital-twin-scenes\/(\d{1,78})\/([a-f0-9]{64})\.glb$/i)
      if (
        parsed.origin !== gateway.origin
        || parsed.search
        || parsed.hash
        || match?.[1] !== String(labId)
      ) return null
      return `/api/aas/digital-twin-scene/${match[1]}/${match[2].toLowerCase()}.glb`
    } catch {
      return null
    }
  }
  return safeExternalHttpsUrl(trimmed)
}

export function resolveDigitalTwinAsset(asset, gatewayOrigin, labId) {
  if (asset?.contentType === 'model/gltf-binary') {
    const url = resolveSceneAssetUrl(asset.url, gatewayOrigin, labId)
    return url ? { type: 'glb', url } : null
  }
  if (asset?.contentType !== 'text/html' || !/^\d{1,78}$/.test(String(labId || ''))) return null

  try {
    const gateway = new URL(gatewayOrigin)
    const rawUrl = String(asset.url || '').trim()
    if (!rawUrl || rawUrl.length > 2048 || rawUrl.includes('\\')) return null
    const parsed = new URL(rawUrl, gateway.origin)
    const match = parsed.pathname.match(/^\/digital-twin-apps\/(\d{1,78})\/([a-f0-9]{64})\/index\.html$/i)
    if (
      !isAllowedGatewayOrigin(gateway)
      || gateway.username
      || gateway.password
      || parsed.origin !== gateway.origin
      || parsed.search
      || parsed.hash
      || match?.[1] !== String(labId)
    ) return null
    return {
      type: 'threejs-app',
      url: `/api/aas/digital-twin-app/${match[1]}/${match[2].toLowerCase()}/index.html`,
    }
  } catch {
    return null
  }
}
