import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { BlockList, isIP } from 'node:net'

const PRIVATE_IP_BLOCKLIST = (() => {
  const list = new BlockList()
  list.addSubnet('10.0.0.0', 8, 'ipv4')
  list.addSubnet('127.0.0.0', 8, 'ipv4')
  list.addSubnet('169.254.0.0', 16, 'ipv4')
  list.addSubnet('172.16.0.0', 12, 'ipv4')
  list.addSubnet('192.168.0.0', 16, 'ipv4')
  list.addAddress('::', 'ipv6')
  list.addAddress('::1', 'ipv6')
  list.addSubnet('fc00::', 7, 'ipv6')
  list.addSubnet('fe80::', 10, 'ipv6')
  return list
})()

const ALLOWED_GATEWAY_ORIGINS = (process.env.ALLOWED_GATEWAY_ORIGINS || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)

export class GatewayValidationError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'GatewayValidationError'
    this.status = status
  }
}

function normalizeHostnameForIpCheck(hostname) {
  const lowerHost = String(hostname || '').trim().toLowerCase()
  const withoutBrackets = lowerHost.startsWith('[') && lowerHost.endsWith(']')
    ? lowerHost.slice(1, -1)
    : lowerHost
  return withoutBrackets.split('%')[0]
}

function isPrivateIp(hostname) {
  const normalizedHost = normalizeHostnameForIpCheck(hostname)
  const version = isIP(normalizedHost)
  if (!version) return false
  if (version === 6 && normalizedHost.startsWith('::ffff:')) {
    // Block IPv4-mapped IPv6 literals to prevent SSRF bypasses.
    return true
  }
  const family = version === 6 ? 'ipv6' : 'ipv4'
  return PRIVATE_IP_BLOCKLIST.check(normalizedHost, family)
}

function assertGatewayHostAllowed(hostname, origin) {
  const lowerHost = normalizeHostnameForIpCheck(hostname)
  if (ALLOWED_GATEWAY_ORIGINS.length > 0 && !ALLOWED_GATEWAY_ORIGINS.includes(origin)) {
    throw new GatewayValidationError('Gateway origin is not in ALLOWED_GATEWAY_ORIGINS')
  }

  if (process.env.NODE_ENV !== 'production') {
    return
  }

  if (lowerHost === 'localhost') {
    throw new GatewayValidationError('Gateway host is not allowed')
  }
  if (isPrivateIp(lowerHost)) {
    throw new GatewayValidationError('Gateway private network hosts are not allowed')
  }
  if (lowerHost.endsWith('.local') || lowerHost.endsWith('.internal')) {
    throw new GatewayValidationError('Gateway host is not allowed')
  }
}

export function normalizeGatewayBaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new GatewayValidationError('Missing gatewayUrl')
  }

  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new GatewayValidationError('Invalid gatewayUrl format')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new GatewayValidationError('Unsupported gatewayUrl protocol')
  }

  const origin = `${parsed.protocol}//${parsed.host}`
  assertGatewayHostAllowed(parsed.hostname, origin)

  let path = parsed.pathname.replace(/\/+$/, '')
  if (path.toLowerCase().endsWith('/auth')) {
    path = path.slice(0, -5)
  }

  return `${origin}${path}`.replace(/\/+$/, '')
}

export function buildGatewayTargetUrl(baseUrl, routePath, query = null) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const normalizedPath = routePath.startsWith('/') ? routePath : `/${routePath}`
  const url = new URL(`${normalizedBase}${normalizedPath}`)

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      url.searchParams.set(key, String(value))
    })
  }

  return url.toString()
}

export function extractBearerHeader(request) {
  const authorization = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!authorization) return null
  return authorization.startsWith('Bearer ') ? authorization : null
}

export async function resolveGatewayBaseUrl({ labId, gatewayUrl, requireLabMatch = true } = {}) {
  let normalizedFromRequest = null
  if (gatewayUrl) {
    normalizedFromRequest = normalizeGatewayBaseUrl(gatewayUrl)
  }

  if (labId === undefined || labId === null || labId === '') {
    if (!normalizedFromRequest) {
      throw new GatewayValidationError('Missing labId or gatewayUrl')
    }
    return normalizedFromRequest
  }

  const numericLabId = Number(labId)
  if (!Number.isFinite(numericLabId) || numericLabId < 0) {
    throw new GatewayValidationError('Invalid labId')
  }

  const contract = await getContractInstance()
  const authUri = await contract.getLabAuthURI(numericLabId)
  if (!authUri) {
    throw new GatewayValidationError('Lab has no configured gateway auth URI', 404)
  }

  const normalizedOnChain = normalizeGatewayBaseUrl(String(authUri))

  if (requireLabMatch && normalizedFromRequest && normalizedFromRequest !== normalizedOnChain) {
    throw new GatewayValidationError('Provided gatewayUrl does not match on-chain lab auth URI')
  }

  return normalizedOnChain
}
