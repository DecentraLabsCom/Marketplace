import { buildGatewayTargetUrl, gatewayFetch } from '@/utils/api/gatewayProxy'
import {
  FMU_CONTEXT_COOKIE,
  readFmuContextsFromCookieValue,
} from '@/utils/auth/fmuSessionStore'
import {
  ackFmuRevocation,
  clearFmuCapabilitiesForSession,
  enqueueFmuRevocation,
  getDueFmuRevocations,
  getFmuCapabilitiesForSession,
  removeFmuCapabilityForSession,
  rescheduleFmuRevocation,
} from '@/utils/auth/samlSessionStateStore'

async function revokeRemoteContext({ gatewayOrigin, resourceSessionId }) {
  const response = await gatewayFetch(
    buildGatewayTargetUrl(gatewayOrigin, '/auth/fmu/revoke'),
    {
      method: 'POST',
      headers: { Cookie: `FMU_SESSION=${resourceSessionId}` },
      cache: 'no-store',
    },
  )
  // The Gateway endpoint is idempotent and returns 204 both when it removes
  // the capability and when it was already absent.
  return response?.status === 204
}

async function revokeContextList(contexts) {
  await Promise.allSettled(contexts.map(async (context) => {
    if (Number(context.expiresAt) <= Math.floor(Date.now() / 1000)) return
    await revokeRemoteContext(context)
  }))
}

async function revokeDurableContext({ sessionId, context, attempts = 0 }) {
  let queued = false
  try {
    queued = await enqueueFmuRevocation({ sessionId, context })
  } catch {
    // The capability remains in the durable session snapshot. A later SLO or
    // reconciliation can enqueue it once the state store is available again.
  }

  const expired = Number(context.expiresAt) <= Math.floor(Date.now() / 1000)
  let confirmed = expired
  if (!confirmed) {
    try {
      confirmed = await revokeRemoteContext(context)
    } catch {
      confirmed = false
    }
  }

  if (!confirmed) {
    if (queued) {
      await rescheduleFmuRevocation({ sessionId, context, attempts }).catch(() => {})
    }
    return false
  }

  try {
    await removeFmuCapabilityForSession(sessionId, context)
    await ackFmuRevocation({ sessionId, context })
    return true
  } catch {
    // Do not acknowledge the outbox entry until the durable capability has
    // also been removed; the retry can safely repeat the idempotent revoke.
    if (queued) {
      await rescheduleFmuRevocation({ sessionId, context, attempts }).catch(() => {})
    }
    return false
  }
}

/**
 * Drains durable FMU revocations. This function is called by the scheduled
 * reconciliation endpoint, so a Gateway outage does not depend on another
 * user request or on the original SSO session remaining alive.
 */
export async function drainFmuRevocationOutbox({ limit = 100 } = {}) {
  const entries = await getDueFmuRevocations({ limit })
  const results = await Promise.all(entries.map(async (entry) => ({
    confirmed: await revokeDurableContext(entry),
    entry,
  })))
  return {
    checked: results.length,
    confirmed: results.filter((result) => result.confirmed).length,
    pending: results.filter((result) => !result.confirmed).length,
  }
}

function contextsFromCookie(cookieStore) {
  const encoded = cookieStore?.get?.(FMU_CONTEXT_COOKIE)?.value
  return readFmuContextsFromCookieValue(encoded)
}

/**
 * Invalidate all active reservation-scoped FMU tickets before clearing the
 * Marketplace capability cookie. Gateway failures are intentionally isolated
 * so logout still removes the Marketplace session and browser capability.
 */
export async function revokeFmuContexts(cookieStore) {
  await revokeContextList(contextsFromCookie(cookieStore))
}

export async function revokeFmuContextsExceptUser(cookieStore, userBinding) {
  const expectedUserBinding = String(userBinding || '')
  if (!/^[A-Za-z0-9_-]{43}$/.test(expectedUserBinding)) {
    throw new Error('A valid Marketplace identity binding is required')
  }

  const contexts = contextsFromCookie(cookieStore)
  const retained = contexts.filter((context) => context.userBinding === expectedUserBinding)
  await revokeContextList(contexts.filter((context) => context.userBinding !== expectedUserBinding))
  return retained
}

/**
 * Revoke the durable capability snapshots associated with Marketplace sessions
 * found through a SAML NameID/SessionIndex binding. Each snapshot remains
 * durable until its Gateway revoke is confirmed or its natural expiry passes.
 */
export async function revokeFmuContextsForSessions(sessionIds) {
  const normalizedIds = [...new Set((Array.isArray(sessionIds) ? sessionIds : [])
    .filter((sessionId) => /^[A-Za-z0-9_-]{43}$/.test(String(sessionId))))]
  const contexts = (await Promise.all(
    normalizedIds.map((sessionId) => getFmuCapabilitiesForSession(sessionId)),
  )).flatMap((sessionContexts, index) => sessionContexts.map((context) => ({
    sessionId: normalizedIds[index],
    context,
  })))
  await Promise.all(contexts.map(revokeDurableContext))
  // Remove empty Redis sets, but never clear a set that still contains a
  // capability whose remote revocation is pending.
  await Promise.all(normalizedIds.map(async (sessionId) => {
    const remaining = await getFmuCapabilitiesForSession(sessionId)
    if (remaining.length === 0) await clearFmuCapabilitiesForSession(sessionId)
  }))
  return normalizedIds
}

export async function revokeFmuContextsForSession(sessionId) {
  return revokeFmuContextsForSessions([sessionId])
}
