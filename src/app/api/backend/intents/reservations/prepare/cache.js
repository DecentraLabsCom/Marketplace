import { getAdminAddress } from '@/utils/intents/adminIntentSigner'
import { resolveIntentExecutorForInstitution } from '@/utils/intents/resolveIntentExecutor'

const CACHE_TTL_MS = 30 * 60 * 1000

const stablePrepareCache = {
  adminAddress: null,
  executorsByInstitution: new Map(),
}

const isFresh = (entry, now = Date.now()) =>
  Boolean(entry && entry.expiresAt > now)

export const getCachedAdminAddress = async () => {
  if (isFresh(stablePrepareCache.adminAddress)) {
    return stablePrepareCache.adminAddress.value
  }

  const value = await getAdminAddress()
  stablePrepareCache.adminAddress = {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  }
  return value
}

export const getCachedIntentExecutorForInstitution = async (institution) => {
  const key = String(institution || '').trim().toLowerCase()
  const cached = stablePrepareCache.executorsByInstitution.get(key)
  if (isFresh(cached)) {
    return cached.value
  }

  const value = await resolveIntentExecutorForInstitution(institution)
  stablePrepareCache.executorsByInstitution.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
  return value
}

export const clearReservationPrepareCache = () => {
  stablePrepareCache.adminAddress = null
  stablePrepareCache.executorsByInstitution.clear()
}
