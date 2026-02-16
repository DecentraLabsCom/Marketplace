const MARKER_PREFIX = 'institutional_browser_passkey'
const ADVISORY_COOLDOWN_MS_DEFAULT = 24 * 60 * 60 * 1000

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

function parseMarkerValue(rawValue) {
  if (rawValue === '1') {
    // Backward compatibility with legacy marker values.
    return { verifiedAt: Date.now(), advisoryDismissedAt: null }
  }

  if (!rawValue || typeof rawValue !== 'string') {
    return { verifiedAt: null, advisoryDismissedAt: null }
  }

  try {
    const parsed = JSON.parse(rawValue)
    return {
      verifiedAt: Number.isFinite(parsed?.verifiedAt) ? parsed.verifiedAt : null,
      advisoryDismissedAt: Number.isFinite(parsed?.advisoryDismissedAt) ? parsed.advisoryDismissedAt : null,
    }
  } catch {
    return { verifiedAt: null, advisoryDismissedAt: null }
  }
}

function readMarkerState(storage, key) {
  if (!storage || !key) return { verifiedAt: null, advisoryDismissedAt: null }

  try {
    return parseMarkerValue(storage.getItem(key))
  } catch {
    return { verifiedAt: null, advisoryDismissedAt: null }
  }
}

function writeMarkerState(storage, key, nextState) {
  if (!storage || !key) return false
  try {
    storage.setItem(key, JSON.stringify(nextState))
    return true
  } catch {
    return false
  }
}

export function getBrowserCredentialMarkerState({ stableUserId, institutionId }) {
  const storage = getSafeLocalStorage()
  if (!storage) return { verifiedAt: null, advisoryDismissedAt: null }
  const key = buildMarkerKey({ stableUserId, institutionId })
  if (!key) return { verifiedAt: null, advisoryDismissedAt: null }

  return readMarkerState(storage, key)
}

export function hasBrowserCredentialMarker({ stableUserId, institutionId }) {
  const marker = getBrowserCredentialMarkerState({ stableUserId, institutionId })
  return Number.isFinite(marker.verifiedAt)
}

export function hasBrowserCredentialMarkerVerified({ stableUserId, institutionId }) {
  return hasBrowserCredentialMarker({ stableUserId, institutionId })
}

export function setBrowserCredentialMarker({ stableUserId, institutionId }) {
  return markBrowserCredentialVerified({ stableUserId, institutionId })
}

export function markBrowserCredentialVerified({ stableUserId, institutionId }) {
  const storage = getSafeLocalStorage()
  if (!storage) return false
  const key = buildMarkerKey({ stableUserId, institutionId })
  if (!key) return false

  const previous = readMarkerState(storage, key)
  const nextState = {
    ...previous,
    verifiedAt: Date.now(),
    advisoryDismissedAt: null,
  }

  return writeMarkerState(storage, key, nextState)
}

export function markBrowserCredentialAdvisoryDismissed({ stableUserId, institutionId }) {
  const storage = getSafeLocalStorage()
  if (!storage) return false
  const key = buildMarkerKey({ stableUserId, institutionId })
  if (!key) return false

  const previous = readMarkerState(storage, key)
  // Once verified, advisory dismissals are irrelevant.
  if (Number.isFinite(previous.verifiedAt)) {
    return true
  }

  const nextState = {
    ...previous,
    advisoryDismissedAt: Date.now(),
  }

  return writeMarkerState(storage, key, nextState)
}

export function shouldShowBrowserCredentialAdvisory(
  { stableUserId, institutionId },
  { cooldownMs = ADVISORY_COOLDOWN_MS_DEFAULT } = {}
) {
  const marker = getBrowserCredentialMarkerState({ stableUserId, institutionId })

  if (Number.isFinite(marker.verifiedAt)) {
    return false
  }

  if (!Number.isFinite(marker.advisoryDismissedAt)) {
    return true
  }

  const now = Date.now()
  return now - marker.advisoryDismissedAt >= cooldownMs
}

export default {
  getBrowserCredentialMarkerState,
  hasBrowserCredentialMarker,
  hasBrowserCredentialMarkerVerified,
  setBrowserCredentialMarker,
  markBrowserCredentialVerified,
  markBrowserCredentialAdvisoryDismissed,
  shouldShowBrowserCredentialAdvisory,
}
