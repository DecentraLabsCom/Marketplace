import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { BlockList, isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { Agent } from 'undici'
import { createHash } from 'node:crypto'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

const PRIVATE_IP_BLOCKLIST = (() => {
  const list = new BlockList()
  list.addSubnet('10.0.0.0', 8, 'ipv4')
  list.addSubnet('127.0.0.0', 8, 'ipv4')
  list.addSubnet('169.254.0.0', 16, 'ipv4')
  list.addSubnet('172.16.0.0', 12, 'ipv4')
  list.addSubnet('192.168.0.0', 16, 'ipv4')
  list.addSubnet('0.0.0.0', 8, 'ipv4')
  list.addSubnet('100.64.0.0', 10, 'ipv4')
  list.addSubnet('192.0.0.0', 24, 'ipv4')
  list.addSubnet('192.0.2.0', 24, 'ipv4')
  list.addSubnet('192.31.196.0', 24, 'ipv4')
  list.addSubnet('192.52.193.0', 24, 'ipv4')
  list.addSubnet('192.88.99.0', 24, 'ipv4')
  list.addSubnet('192.175.48.0', 24, 'ipv4')
  list.addSubnet('198.18.0.0', 15, 'ipv4')
  list.addSubnet('198.51.100.0', 24, 'ipv4')
  list.addSubnet('203.0.113.0', 24, 'ipv4')
  list.addSubnet('224.0.0.0', 4, 'ipv4')
  list.addSubnet('240.0.0.0', 4, 'ipv4')
  list.addAddress('::', 'ipv6')
  list.addAddress('::1', 'ipv6')
  list.addSubnet('5f00::', 16, 'ipv6')
  list.addSubnet('64:ff9b::', 96, 'ipv6')
  list.addSubnet('64:ff9b:1::', 48, 'ipv6')
  list.addSubnet('100::', 64, 'ipv6')
  list.addSubnet('2001::', 23, 'ipv6')
  list.addSubnet('fc00::', 7, 'ipv6')
  list.addSubnet('fe80::', 10, 'ipv6')
  list.addSubnet('2001:db8::', 32, 'ipv6')
  list.addSubnet('2002::', 16, 'ipv6')
  list.addSubnet('2620:4f:8000::', 48, 'ipv6')
  list.addSubnet('3fff::', 20, 'ipv6')
  list.addSubnet('ff00::', 8, 'ipv6')
  return list
})()

const PINNED_AGENTS = new Map()
const MAX_PINNED_AGENTS = 64
const INSTITUTIONAL_CIRCUIT_FAILURE_THRESHOLD = 3
const INSTITUTIONAL_CIRCUIT_WINDOW_SECONDS = 60
const INSTITUTIONAL_CIRCUIT_COOLDOWN_SECONDS = 60
const localInstitutionalCircuits = new Map()

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

const institutionalCircuitKey = (prefix, origin) => `${prefix}${createHash('sha256')
  .update(origin)
  .digest('hex')}`

const institutionalCircuitKeys = (origin) => ({
  failures: institutionalCircuitKey('marketplace:institutional-backend:circuit:failures:', origin),
  open: institutionalCircuitKey('marketplace:institutional-backend:circuit:open:', origin),
})

function localCircuitIsOpen(origin, now = Date.now()) {
  const state = localInstitutionalCircuits.get(origin)
  if (!state) return false
  if (state.openUntil > now) return true
  if (state.windowUntil <= now) localInstitutionalCircuits.delete(origin)
  return false
}

async function isInstitutionalCircuitOpen(origin) {
  if (localCircuitIsOpen(origin)) return true
  if (!hasRedisConfig()) return false
  try {
    return Boolean(await redisCommand(['GET', institutionalCircuitKeys(origin).open]))
  } catch {
    return false
  }
}

async function recordInstitutionalBackendFailure(origin) {
  const now = Date.now()
  const state = localInstitutionalCircuits.get(origin)
  const windowUntil = state?.windowUntil > now
    ? state.windowUntil
    : now + INSTITUTIONAL_CIRCUIT_WINDOW_SECONDS * 1000
  const failures = state?.windowUntil > now ? state.failures + 1 : 1
  const openUntil = failures >= INSTITUTIONAL_CIRCUIT_FAILURE_THRESHOLD
    ? now + INSTITUTIONAL_CIRCUIT_COOLDOWN_SECONDS * 1000
    : 0
  localInstitutionalCircuits.set(origin, { failures, windowUntil, openUntil })

  if (!hasRedisConfig()) return
  try {
    const keys = institutionalCircuitKeys(origin)
    const total = Number(await redisCommand(['INCR', keys.failures]))
    if (total === 1) {
      await redisCommand(['EXPIRE', keys.failures, String(INSTITUTIONAL_CIRCUIT_WINDOW_SECONDS)])
    }
    if (total >= INSTITUTIONAL_CIRCUIT_FAILURE_THRESHOLD) {
      await redisCommand(['SET', keys.open, '1', 'EX', String(INSTITUTIONAL_CIRCUIT_COOLDOWN_SECONDS)])
    }
  } catch {
    // A process-local breaker still protects this instance if Redis is down.
  }
}

async function recordInstitutionalBackendSuccess(origin) {
  localInstitutionalCircuits.delete(origin)
  if (!hasRedisConfig()) return
  try {
    await redisCommand(['DEL', institutionalCircuitKeys(origin).failures])
  } catch {
    // The short Redis TTL self-heals if the cleanup request fails.
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

function assertPublicHostAllowed(hostname, { always = false } = {}) {
  const lowerHost = normalizeHostnameForIpCheck(hostname)

  if (!always && process.env.NODE_ENV !== 'production') {
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

function assertGatewayHostAllowed(hostname, origin) {
  if (ALLOWED_GATEWAY_ORIGINS.length > 0 && !ALLOWED_GATEWAY_ORIGINS.includes(origin)) {
    throw new GatewayValidationError('Gateway origin is not in ALLOWED_GATEWAY_ORIGINS')
  }
  assertPublicHostAllowed(hostname)
}

function assertInstitutionalBackendAllowed(url) {
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new GatewayValidationError('Institutional backend must use HTTPS in production')
  }
  assertPublicHostAllowed(url.hostname)
}

async function resolvePublicGatewayAddress(hostname, { always = false } = {}) {
  const normalizedHost = normalizeHostnameForIpCheck(hostname)
  assertPublicHostAllowed(normalizedHost, { always })
  const literalVersion = isIP(normalizedHost)
  const addresses = literalVersion
    ? [{ address: normalizedHost, family: literalVersion }]
    : await lookup(normalizedHost, { all: true, verbatim: true }).catch((error) => {
      throw new GatewayValidationError(`Gateway DNS resolution failed: ${error.code || error.message}`, 502)
    })

  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new GatewayValidationError('Gateway DNS resolves to a private, loopback, link-local or reserved address')
  }
  return addresses[0]
}

async function assertGatewayUrlResolvesPublic(rawUrl) {
  if (process.env.NODE_ENV !== 'production') return null
  const parsed = new URL(rawUrl)
  assertGatewayHostAllowed(parsed.hostname, parsed.origin)
  return resolvePublicGatewayAddress(parsed.hostname)
}

async function assertInstitutionalBackendResolvesPublic(url) {
  assertInstitutionalBackendAllowed(url)
  if (process.env.NODE_ENV !== 'production') return null
  return resolvePublicGatewayAddress(url.hostname)
}

export function createPinnedLookup(resolved) {
  return (_hostname, options, callback) => {
    // Undici asks for all addresses when it establishes a TLS connection.
    // Its callback must then receive an array, whereas node:dns.lookup uses
    // the scalar (address, family) form when `all` is not requested.
    if (options?.all) {
      callback(null, [{ address: resolved.address, family: resolved.family }])
      return
    }

    callback(null, resolved.address, resolved.family)
  }
}

function pinnedAgent(url, resolved) {
  const key = `${url.protocol}//${url.host}|${resolved.address}|${resolved.family}`
  let agent = PINNED_AGENTS.get(key)
  if (agent) return agent

  agent = new Agent({
    connect: {
      lookup: createPinnedLookup(resolved),
    },
  })
  PINNED_AGENTS.set(key, agent)
  if (PINNED_AGENTS.size > MAX_PINNED_AGENTS) {
    const [oldestKey, oldestAgent] = PINNED_AGENTS.entries().next().value
    PINNED_AGENTS.delete(oldestKey)
    void oldestAgent.close()
  }
  return agent
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

export function normalizeInstitutionalBackendBaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new GatewayValidationError('Missing institutional backend URL')
  }

  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new GatewayValidationError('Invalid institutional backend URL format')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new GatewayValidationError('Unsupported institutional backend protocol')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new GatewayValidationError(
      'Institutional backend URL must not contain credentials, query parameters or fragments'
    )
  }
  assertInstitutionalBackendAllowed(parsed)

  let path = parsed.pathname.replace(/\/+$/, '')
  if (path.toLowerCase().endsWith('/auth')) {
    path = path.slice(0, -5)
  }
  return `${parsed.origin}${path}`.replace(/\/+$/, '')
}

export function normalizeLabAccessUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new GatewayValidationError('Missing lab access URI')
  }

  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new GatewayValidationError('Invalid lab access URI format')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new GatewayValidationError('Unsupported lab access URI protocol')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new GatewayValidationError('Lab access URI must not contain credentials, query parameters or fragments')
  }

  assertGatewayHostAllowed(parsed.hostname, parsed.origin)
  const path = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.origin}${path}`
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

/**
 * Fetch a validated gateway URL while pinning the DNS result used by the
 * connection. Redirects are manual, same-origin only, and revalidated.
 */
export async function gatewayFetch(rawUrl, init = {}, redirectCount = 0) {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new GatewayValidationError('Unsupported gatewayUrl protocol')
  }
  assertGatewayHostAllowed(url.hostname, url.origin)
  const resolved = await assertGatewayUrlResolvesPublic(url)
  const response = await fetch(url.toString(), {
    ...init,
    redirect: 'manual',
    ...(resolved ? { dispatcher: pinnedAgent(url, resolved) } : {}),
  })

  if (![301, 302, 303, 307, 308].includes(response.status)) return response
  if (redirectCount >= 3) {
    throw new GatewayValidationError('Gateway redirected too many times', 502)
  }
  const location = response.headers.get('location')
  if (!location) return response
  const redirected = new URL(location, url)
  if (redirected.origin !== url.origin) {
    throw new GatewayValidationError('Cross-origin gateway redirects are not allowed', 502)
  }

  const redirectedInit = { ...init }
  if (response.status === 303 && String(init.method || 'GET').toUpperCase() !== 'HEAD') {
    redirectedInit.method = 'GET'
    delete redirectedInit.body
  }
  return gatewayFetch(redirected.toString(), redirectedInit, redirectCount + 1)
}

/**
 * Fetch an on-chain-discovered institutional backend without ever forwarding
 * credential-bearing requests across redirects. Production connections require
 * HTTPS, public A/AAAA answers and a DNS-pinned dispatcher.
 */
export async function institutionalBackendFetch(rawUrl, init = {}) {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new GatewayValidationError('Unsupported institutional backend protocol')
  }
  if (await isInstitutionalCircuitOpen(url.origin)) {
    throw new GatewayValidationError('Institutional backend circuit is open', 503)
  }
  const resolved = await assertInstitutionalBackendResolvesPublic(url)
  let response
  try {
    response = await fetch(url.toString(), {
      ...init,
      redirect: 'manual',
      ...(resolved ? { dispatcher: pinnedAgent(url, resolved) } : {}),
    })
  } catch (error) {
    await recordInstitutionalBackendFailure(url.origin)
    throw error
  }
  if (response.status >= 500 || response.status === 429) {
    await recordInstitutionalBackendFailure(url.origin)
  } else {
    await recordInstitutionalBackendSuccess(url.origin)
  }
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    throw new GatewayValidationError('Institutional backend redirects are not allowed', 502)
  }
  return response
}

function getConfiguredOriginAllowlist(variableName) {
  return String(process.env[variableName] || '')
    .split(',')
    .map((entry) => entry.trim())
    .flatMap((entry) => {
      if (!entry) return []
      try {
        const parsed = new URL(entry)
        if (
          parsed.protocol !== 'https:' ||
          parsed.username ||
          parsed.password ||
          parsed.pathname !== '/' ||
          parsed.search ||
          parsed.hash
        ) return []
        return [parsed.origin]
      } catch {
        return []
      }
    })
}

async function readResponseBodyWithLimit(response, maxBytes) {
  if (response.body?.getReader) {
    const reader = response.body.getReader()
    const chunks = []
    let totalBytes = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value)
        totalBytes += chunk.byteLength
        if (totalBytes > maxBytes) {
          await Promise.resolve(reader.cancel?.()).catch(() => {})
          throw new GatewayValidationError('Metadata response exceeds the maximum size', 413)
        }
        chunks.push(chunk)
      }
    } finally {
      reader.releaseLock?.()
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
  }

  if (typeof response.text !== 'function') {
    throw new GatewayValidationError('Metadata response body is unavailable', 502)
  }

  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new GatewayValidationError('Metadata response exceeds the maximum size', 413)
  }
  return text
}

/**
 * Fetches JSON from a configured or dynamically trusted public HTTPS origin
 * with DNS pinning, redirect blocking and a response-size limit. Intended for
 * untrusted on-chain metadata URIs.
 */
export async function fetchAllowlistedJson(
  rawUrl,
  init = {},
  {
    allowedOrigins,
    additionalAllowedOrigins = [],
    allowedOriginsEnv = 'ALLOWED_METADATA_ORIGINS',
    maxBytes = 1024 * 1024,
    timeoutMs = 2000,
  } = {},
) {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:') {
    throw new GatewayValidationError('Metadata sources must use HTTPS')
  }

  const configuredOrigins = getConfiguredOriginAllowlist(allowedOriginsEnv)
  const origins = [
    ...new Set([
      ...(allowedOrigins || configuredOrigins),
      ...additionalAllowedOrigins,
    ]),
  ]
  if (!origins.length) {
    throw new GatewayValidationError(`${allowedOriginsEnv} or an additional trusted origin must contain at least one exact origin`, 503)
  }
  if (!origins.includes(url.origin)) {
    throw new GatewayValidationError(`Metadata origin is not in ${allowedOriginsEnv} or the trusted lab provider origins`)
  }

  const resolved = await resolvePublicGatewayAddress(url.hostname, { always: true })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const callerSignal = init.signal
  const abortFromCaller = () => controller.abort(callerSignal.reason)
  if (callerSignal?.aborted) controller.abort(callerSignal.reason)
  callerSignal?.addEventListener?.('abort', abortFromCaller, { once: true })

  try {
    const response = await fetch(url.toString(), {
      ...init,
      signal: controller.signal,
      redirect: 'manual',
      ...(resolved ? { dispatcher: pinnedAgent(url, resolved) } : {}),
    })

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      throw new GatewayValidationError('Metadata redirects are not allowed', 502)
    }
    if (!response.ok) {
      return { response, data: null }
    }

    const contentType = response.headers?.get?.('content-type') || ''
    if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(contentType)) {
      throw new GatewayValidationError('Metadata response must have a JSON Content-Type', 502)
    }

    const body = await readResponseBodyWithLimit(response, maxBytes)
    let data
    try {
      data = JSON.parse(body)
    } catch {
      throw new GatewayValidationError('Metadata response is not valid JSON', 502)
    }

    return { response, data }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new GatewayValidationError('Metadata fetch timed out', 504)
    }
    throw error
  } finally {
    clearTimeout(timeout)
    callerSignal?.removeEventListener?.('abort', abortFromCaller)
  }
}

export function extractBearerHeader(request) {
  const authorization = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!authorization) return null
  return authorization.startsWith('Bearer ') ? authorization : null
}

function numericLabIdFrom(labId) {
  if (labId === undefined || labId === null || labId === '') {
    throw new GatewayValidationError('Missing labId')
  }
  const numericLabId = Number(labId)
  if (!Number.isSafeInteger(numericLabId) || numericLabId < 0) {
    throw new GatewayValidationError('Invalid labId')
  }
  return numericLabId
}

async function resolveOnChainEndpoint({
  labId,
  providedUrl,
  requireLabMatch,
  contractReader,
  normalize,
  missingMessage,
  mismatchMessage,
}) {
  const numericLabId = numericLabIdFrom(labId)
  const normalizedFromRequest = providedUrl ? normalize(providedUrl) : null

  const contract = await getContractInstance()
  const onChainUri = await contract[contractReader](numericLabId)
  if (!onChainUri) {
    throw new GatewayValidationError(missingMessage, 404)
  }

  const normalizedOnChain = normalize(String(onChainUri))

  if (requireLabMatch && normalizedFromRequest && normalizedFromRequest !== normalizedOnChain) {
    throw new GatewayValidationError(mismatchMessage)
  }

  await assertGatewayUrlResolvesPublic(normalizedOnChain)
  return normalizedOnChain
}

export async function resolveProviderAuthBackend({ labId, gatewayUrl, requireLabMatch = true } = {}) {
  return resolveOnChainEndpoint({
    labId,
    providedUrl: gatewayUrl,
    requireLabMatch,
    contractReader: 'getLabAuthURI',
    normalize: normalizeGatewayBaseUrl,
    missingMessage: 'Lab has no configured provider auth URI',
    mismatchMessage: 'Provided auth endpoint does not match on-chain provider auth URI',
  })
}

export async function resolveLabAccessGateway({ labId, gatewayUrl, requireLabMatch = true } = {}) {
  if (labId === undefined || labId === null || labId === '') {
    if (!gatewayUrl) {
      throw new GatewayValidationError('Missing labId or lab access URI')
    }
    const accessUrl = normalizeLabAccessUrl(gatewayUrl)
    await assertGatewayUrlResolvesPublic(accessUrl)
    return new URL(accessUrl).origin
  }

  const accessUrl = await resolveOnChainEndpoint({
    labId,
    providedUrl: gatewayUrl,
    requireLabMatch,
    contractReader: 'getLabAccessURI',
    normalize: normalizeLabAccessUrl,
    missingMessage: 'Lab has no configured access URI',
    mismatchMessage: 'Provided lab destination does not match on-chain lab access URI',
  })
  return new URL(accessUrl).origin
}
