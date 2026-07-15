import { getAdminAddress } from './adminIntentSigner'
import { resolveIntentExecutorForInstitution } from './resolveIntentExecutor'

const CACHE_TTL_MS = 30 * 60 * 1000

const cache = {
  adminAddress: null,
  executorsByInstitution: new Map(),
}

const isFresh = (entry, now = Date.now()) => Boolean(entry && entry.expiresAt > now)

export const getCachedAdminAddress = async () => {
  if (isFresh(cache.adminAddress)) return cache.adminAddress.value

  const value = await getAdminAddress()
  cache.adminAddress = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export const getCachedIntentExecutorForInstitution = async (institution) => {
  const key = String(institution || '').trim().toLowerCase()
  const cached = cache.executorsByInstitution.get(key)
  if (isFresh(cached)) return cached.value

  const value = await resolveIntentExecutorForInstitution(institution)
  cache.executorsByInstitution.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

export const clearIntentPrepareCache = () => {
  cache.adminAddress = null
  cache.executorsByInstitution.clear()
}
