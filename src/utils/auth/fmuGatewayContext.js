import { GatewayValidationError, extractBearerHeader } from '@/utils/api/gatewayProxy'
import { getOptionalSession } from '@/utils/auth/guards'
import { createFmuUserBinding, findFmuContext } from '@/utils/auth/fmuSessionStore'

/**
 * Resolve the reservation-scoped FMU capability without requiring the
 * Marketplace SSO session to still exist. Explicit provider bearer tooling is
 * passed through and remains authorized by the Gateway itself.
 */
export async function requireFmuResourceContext(request, params) {
  if (extractBearerHeader(request)) return null
  const marketplaceSession = await getOptionalSession()
  const userBinding = marketplaceSession
    ? createFmuUserBinding(marketplaceSession)
    : undefined
  const context = findFmuContext(request, { ...params, userBinding })
  if (!context) {
    throw new GatewayValidationError('FMU gateway session is missing or expired', 401)
  }
  return context
}

/**
 * Build the only credentials that may be forwarded to an FMU gateway.
 *
 * Provider tooling may still use a bearer token. Browser requests use the
 * reservation-scoped Marketplace context and never forward the Marketplace
 * cookie header itself.
 */
export function resolveFmuGatewayHeaders(
  request,
  { labId, reservationKey, gatewayOrigin, userBinding, context },
) {
  const authorization = extractBearerHeader(request)
  if (authorization) return { Authorization: authorization }

  const resourceContext = context || findFmuContext(request, {
    labId,
    reservationKey,
    gatewayOrigin,
    userBinding,
  })
  if (!resourceContext) {
    throw new GatewayValidationError('FMU gateway session is missing or expired', 401)
  }
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(resourceContext.resourceSessionId)) {
    throw new GatewayValidationError('FMU gateway session is invalid', 401)
  }

  return { Cookie: `FMU_SESSION=${resourceContext.resourceSessionId}` }
}
