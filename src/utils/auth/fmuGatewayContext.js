import { GatewayValidationError, extractBearerHeader } from '@/utils/api/gatewayProxy'
import { requireAuth } from '@/utils/auth/guards'
import { createFmuUserBinding, findFmuContext } from '@/utils/auth/fmuSessionStore'

export async function requireFmuUserBinding() {
  return createFmuUserBinding(await requireAuth())
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
  { labId, reservationKey, gatewayOrigin, userBinding },
) {
  const authorization = extractBearerHeader(request)
  if (authorization) return { Authorization: authorization }

  const context = findFmuContext(request, {
    labId,
    reservationKey,
    gatewayOrigin,
    userBinding,
  })
  if (!context) {
    throw new GatewayValidationError('FMU gateway session is missing or expired', 401)
  }
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(context.jti)) {
    throw new GatewayValidationError('FMU gateway session is invalid', 401)
  }

  return { Cookie: `FMU_SESSION=${context.jti}` }
}
