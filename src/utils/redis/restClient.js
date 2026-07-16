const resolveRedisConfig = () => {
  const url = process.env.KV_REST_API_URL
    || process.env.UPSTASH_REDIS_REST_URL
    || process.env.SESSION_STORE_REST_URL
  const token = process.env.KV_REST_API_TOKEN
    || process.env.UPSTASH_REDIS_REST_TOKEN
    || process.env.SESSION_STORE_REST_TOKEN

  return { url: url?.replace(/\/+$/, ''), token }
}

const redisRequestTimeoutMs = () => {
  const parsed = Number.parseInt(process.env.REDIS_REST_TIMEOUT_MS || '', 10)
  return Number.isSafeInteger(parsed) && parsed >= 100 && parsed <= 10_000
    ? parsed
    : 2_000
}

export function hasRedisConfig() {
  const { url, token } = resolveRedisConfig()
  return Boolean(url && token)
}

export async function redisCommand(command) {
  const config = resolveRedisConfig()
  if (!config.url || !config.token) {
    throw new Error('Redis REST configuration is missing')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), redisRequestTimeoutMs())

  let response
  try {
    response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new Error('Redis REST request timed out', { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`Redis REST request failed with status ${response.status}`)
  }

  const payload = await response.json().catch(() => ({}))
  if (payload.error) throw new Error('Redis REST command was rejected')
  return payload.result
}

export default { hasRedisConfig, redisCommand }
