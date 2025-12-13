/**
 * Onboarding Result Store
 * 
 * In-memory store for onboarding results received from IB callbacks.
 * Used to correlate callback results with polling requests from the client.
 * 
 * NOTE: In production, this should be replaced with Redis or a database
 * for persistence across server restarts and horizontal scaling.
 * 
 * @module utils/onboarding/onboardingResultStore
 */

import devLog from '@/utils/dev/logger'

/**
 * In-memory store for onboarding results.
 * @type {Map<string, Object>}
 */
const onboardingResults = new Map()

/**
 * TTL for stored results (10 minutes)
 */
const RESULT_TTL_MS = 10 * 60 * 1000

/**
 * Clean up expired results periodically
 */
function cleanupExpiredResults() {
  const now = Date.now()
  for (const [key, value] of onboardingResults.entries()) {
    if (value.expiresAt && value.expiresAt < now) {
      onboardingResults.delete(key)
      devLog.log('[OnboardingStore] Cleaned up expired result for:', key)
    }
  }
}

/**
 * Store an onboarding result for later retrieval
 * 
 * @param {string} key - Lookup key (stableUserId, sessionId, or composite key)
 * @param {Object} result - Result data from IB callback
 */
export function storeOnboardingResult(key, result) {
  cleanupExpiredResults()
  
  onboardingResults.set(key, {
    ...result,
    receivedAt: new Date().toISOString(),
    expiresAt: Date.now() + RESULT_TTL_MS,
  })
  
  devLog.log('[OnboardingStore] Stored result for:', key, 'status:', result.status)
}

/**
 * Retrieve an onboarding result
 * 
 * @param {string} key - Lookup key
 * @returns {Object|null} Result or null if not found/expired
 */
export function getOnboardingResult(key) {
  cleanupExpiredResults()
  const result = onboardingResults.get(key) || null
  
  if (result) {
    devLog.log('[OnboardingStore] Found result for:', key, 'status:', result.status)
  }
  
  return result
}

/**
 * Check if there's a pending/completed result for a user
 * 
 * @param {string} stableUserId - User's stable identifier
 * @param {string} [institutionId] - Optional institution filter
 * @returns {Object|null} Result or null if not found
 */
export function findResultByUser(stableUserId, institutionId = null) {
  cleanupExpiredResults()
  
  // First try direct lookup
  const directResult = onboardingResults.get(stableUserId)
  if (directResult) {
    if (!institutionId || directResult.institutionId === institutionId) {
      return directResult
    }
  }
  
  // Try composite key with institution
  if (institutionId) {
    const compositeKey = `${stableUserId}:${institutionId}`
    const compositeResult = onboardingResults.get(compositeKey)
    if (compositeResult) {
      return compositeResult
    }
  }
  
  // Search through all results for matching user
  for (const [key, value] of onboardingResults.entries()) {
    if (value.stableUserId === stableUserId) {
      if (!institutionId || value.institutionId === institutionId) {
        return value
      }
    }
  }
  
  return null
}

/**
 * Clear a specific result
 * 
 * @param {string} key - Key to clear
 * @returns {boolean} True if a result was removed
 */
export function clearOnboardingResult(key) {
  return onboardingResults.delete(key)
}

/**
 * Clear all results for a user
 * 
 * @param {string} stableUserId - User identifier
 */
export function clearUserResults(stableUserId) {
  for (const [key, value] of onboardingResults.entries()) {
    if (key === stableUserId || value.stableUserId === stableUserId) {
      onboardingResults.delete(key)
    }
  }
}

/**
 * Get statistics about stored results (for debugging)
 * 
 * @returns {Object} Stats object
 */
export function getStoreStats() {
  cleanupExpiredResults()
  return {
    count: onboardingResults.size,
    keys: Array.from(onboardingResults.keys()),
  }
}

export default {
  storeOnboardingResult,
  getOnboardingResult,
  findResultByUser,
  clearOnboardingResult,
  clearUserResults,
  getStoreStats,
}
