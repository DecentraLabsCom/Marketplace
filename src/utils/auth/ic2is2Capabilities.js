import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import {
  buildGatewayTargetUrl,
  gatewayFetch,
  GatewayValidationError,
  resolveLabAccessGateway,
} from '@/utils/api/gatewayProxy'
import { requireFmuResourceContext, resolveFmuGatewayHeaders } from '@/utils/auth/fmuGatewayContext'
import { createFmuUserBinding } from '@/utils/auth/fmuSessionStore'
import { validateGatewayConnectionGrant } from '@/utils/fmu/validateGatewayConnectionGrant'

async function requireFmuReservation(request, { labId, reservationKey }, session) {
  const contract = await getContractInstance()
  const lab = await contract.getLab(labId)
  if (String(lab?.[1]?.resourceType ?? lab?.[1]?.[5]) !== '1') {
    throw new GatewayValidationError('This resource does not support FMU sessions.', 403)
  }

  const gatewayBaseUrl = await resolveLabAccessGateway({ labId })
  const context = await requireFmuResourceContext(request, {
    labId,
    reservationKey,
    gatewayOrigin: gatewayBaseUrl,
  })
  if (!context || context.userBinding !== createFmuUserBinding(session)) {
    throw new GatewayValidationError('A Marketplace reservation context is required for IC2IS2 authorization.', 401)
  }
  return { context, gatewayBaseUrl }
}

async function issueFmuSession(request, { labId, reservationKey }, { context, gatewayBaseUrl }) {
  const response = await gatewayFetch(buildGatewayTargetUrl(
    gatewayBaseUrl,
    `/fmu/api/v1/fmu/connection/${encodeURIComponent(labId)}`,
    { reservationKey },
  ), {
    method: 'POST',
    headers: resolveFmuGatewayHeaders(request, { labId, reservationKey, gatewayOrigin: gatewayBaseUrl, context }),
    cache: 'no-store',
    signal: request.signal,
  })
  if (!response.ok) {
    throw new GatewayValidationError('The provider could not authorize the FMU session.', response.status)
  }

  const grant = validateGatewayConnectionGrant(await response.json(), { gatewayBaseUrl, labId, reservationKey })
  return { grant, expiresAt: grant.ticketExpiresAt, approvedBy: context.userBinding }
}

const capabilities = new Map([
  ['gateway_fmu_session', {
    label: 'Reserved FMU experiment',
    description: 'IC2IS2 can open an FMU session for this reservation. Gateway enforces which variables it can read or write.',
    authorize: requireFmuReservation,
    issue: issueFmuSession,
  }],
])

export function getIc2is2Capability(capability) {
  return capabilities.get(capability)
}
