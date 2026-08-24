const parseSafeUrl = (value, protocols) => {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const parsed = new URL(value.trim())
    if (!protocols.includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export const safeExternalHttpsUrl = (value) => {
  const parsed = parseSafeUrl(value, ['https:'])
  return parsed?.toString() || null
}

export const safeExternalHttpUrl = (value) => {
  const parsed = parseSafeUrl(value, ['http:', 'https:'])
  return parsed?.toString() || null
}

export const parseSafeExternalHttpUrl = (value) => parseSafeUrl(value, ['http:', 'https:'])

const isLoopbackHost = (hostname) => {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized.endsWith('.localhost')
}

const parseDemoGatewayUrl = (value) => {
  const secure = parseSafeUrl(value, ['https:'])
  if (secure) return secure

  const allowLocalDevelopmentHttp = process.env.NODE_ENV === 'development'
    && process.env.NEXT_PUBLIC_DEMO_ALLOW_HTTP_DEV === 'true'
  if (!allowLocalDevelopmentHttp) return null

  const developmentUrl = parseSafeUrl(value, ['http:'])
  return developmentUrl && isLoopbackHost(developmentUrl.hostname)
    ? developmentUrl
    : null
}

// Demo access is always a gateway-origin handoff. Preserve only the validated
// origin from accessURI and bind the handoff to one canonical on-chain lab ID.
// HTTP is rejected unless local development has opted in explicitly; the
// production bundle can never enable that exception because NODE_ENV is fixed
// to production at build time.
export const buildDemoAccessUrl = (value, labId) => {
  const parsed = parseDemoGatewayUrl(value)
  if (!parsed) return null

  const rawLabId = typeof labId === 'number' && Number.isSafeInteger(labId)
    ? String(labId)
    : typeof labId === 'string'
      ? labId.trim()
      : ''
  if (!/^\d+$/.test(rawLabId)) return null

  let normalizedLabId
  try {
    normalizedLabId = BigInt(rawLabId).toString()
  } catch {
    return null
  }

  parsed.pathname = '/auth/demo'
  parsed.search = ''
  parsed.hash = ''
  parsed.searchParams.set('labId', normalizedLabId)
  return parsed.toString()
}
