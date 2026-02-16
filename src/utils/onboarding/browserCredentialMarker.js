const MARKER_PREFIX = 'institutional_browser_passkey'

function buildMarkerKey({ stableUserId, institutionId }) {
  if (!stableUserId) return null
  const normalizedInstitution = institutionId || 'default'
  return `${MARKER_PREFIX}:${normalizedInstitution}:${stableUserId}`
}

function getSafeLocalStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage || null
  } catch {
    return null
  }
}

export function hasBrowserCredentialMarker({ stableUserId, institutionId }) {
  const storage = getSafeLocalStorage()
  if (!storage) return false
  const key = buildMarkerKey({ stableUserId, institutionId })
  if (!key) return false

  try {
    return storage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function setBrowserCredentialMarker({ stableUserId, institutionId }) {
  const storage = getSafeLocalStorage()
  if (!storage) return false
  const key = buildMarkerKey({ stableUserId, institutionId })
  if (!key) return false

  try {
    storage.setItem(key, '1')
    return true
  } catch {
    return false
  }
}

export default {
  hasBrowserCredentialMarker,
  setBrowserCredentialMarker,
}
