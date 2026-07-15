const resolveRedisConfig = () => {
  const url = process.env.KV_REST_API_URL
    || process.env.UPSTASH_REDIS_REST_URL
    || process.env.SESSION_STORE_REST_URL
  const token = process.env.KV_REST_API_TOKEN
    || process.env.UPSTASH_REDIS_REST_TOKEN
    || process.env.SESSION_STORE_REST_TOKEN

  return { url: url?.replace(/\/+$/, ''), token }
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

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Redis REST request failed with status ${response.status}`)
  }

  const payload = await response.json().catch(() => ({}))
  if (payload.error) throw new Error('Redis REST command was rejected')
  return payload.result
}

export default { hasRedisConfig, redisCommand }
