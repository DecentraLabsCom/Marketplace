import { buildGatewayTargetUrl, gatewayFetch } from '@/utils/api/gatewayProxy'
import {
  FMU_CONTEXT_COOKIE,
  readFmuContextsFromCookieValue,
} from '@/utils/auth/fmuSessionStore'

async function revokeContextList(contexts) {
  await Promise.allSettled(contexts.map(async ({ gatewayOrigin, resourceSessionId }) => {
    const response = await gatewayFetch(
      buildGatewayTargetUrl(gatewayOrigin, '/auth/fmu/revoke'),
      {
        method: 'POST',
        headers: { Cookie: `FMU_SESSION=${resourceSessionId}` },
        cache: 'no-store',
      },
    )
    if (!response.ok) throw new Error(`FMU ticket revocation failed (${response.status})`)
  }))
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
