import { buildGatewayTargetUrl, gatewayFetch } from '@/utils/api/gatewayProxy'
import {
  FMU_CONTEXT_COOKIE,
  readFmuContextsFromCookieValue,
} from '@/utils/auth/fmuSessionStore'

/**
 * Invalidate all active reservation-scoped FMU tickets before clearing the
 * Marketplace capability cookie. Gateway failures are intentionally isolated
 * so logout still removes the Marketplace session and browser capability.
 */
export async function revokeFmuContexts(cookieStore) {
  const encoded = cookieStore?.get?.(FMU_CONTEXT_COOKIE)?.value
  const contexts = readFmuContextsFromCookieValue(encoded)

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
