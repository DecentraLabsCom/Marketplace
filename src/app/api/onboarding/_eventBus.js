/**
 * Minimal in-memory event bus for onboarding status updates.
 *
 * Used by:
 * - POST /api/onboarding/callback (publisher)
 * - GET  /api/onboarding/events (SSE subscribers)
 *
 * Notes:
 * - This is best-effort and instance-local (serverless deployments may have multiple instances).
 * - The polling fallback remains the source of truth.
 */

const GLOBAL_KEY = '__decentralabs_onboarding_event_bus__'

function createBus() {
  const listenersByKey = new Map()

  const subscribe = (keys, listener) => {
    const keyList = Array.isArray(keys) ? keys.filter(Boolean) : [keys].filter(Boolean)
    if (!listener || keyList.length === 0) return () => {}

    keyList.forEach((key) => {
      const existing = listenersByKey.get(key) || new Set()
      existing.add(listener)
      listenersByKey.set(key, existing)
    })

    return () => {
      keyList.forEach((key) => {
        const set = listenersByKey.get(key)
        if (!set) return
        set.delete(listener)
        if (set.size === 0) listenersByKey.delete(key)
      })
    }
  }

  const publish = (keys, payload) => {
    const keyList = Array.isArray(keys) ? keys.filter(Boolean) : [keys].filter(Boolean)
    keyList.forEach((key) => {
      const set = listenersByKey.get(key)
      if (!set || set.size === 0) return
      set.forEach((listener) => {
        try {
          listener(payload)
        } catch {
          // best-effort
        }
      })
    })
  }

  return { subscribe, publish }
}

export const onboardingEventBus =
  globalThis[GLOBAL_KEY] || (globalThis[GLOBAL_KEY] = createBus())

