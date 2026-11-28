import { isValidConnectionConfig } from '@decentralabs/digital-twin-app-protocol'
import { GatewayValidationError } from '@/utils/api/gatewayProxy'

export function validateGatewayConnectionGrant(connection, { gatewayBaseUrl, labId, reservationKey }) {
  if (!isValidConnectionConfig(connection)) {
    throw new GatewayValidationError('Invalid provider connection grant.', 502)
  }

  let endpoint
  let gateway
  try {
    endpoint = new URL(connection.gatewayWsUrl)
    gateway = new URL(gatewayBaseUrl)
  } catch {
    throw new GatewayValidationError('Invalid provider connection grant.', 502)
  }

  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    || endpoint.host !== gateway.host
    || endpoint.protocol !== (gateway.protocol === 'https:' ? 'wss:' : 'ws:')
    || endpoint.pathname !== '/fmu/api/v1/fmu/sessions'
    || connection.labId !== String(labId)
    || String(connection.reservationKey).toLowerCase() !== String(reservationKey).toLowerCase()
    || connection.ticketExpiresAt <= Date.now() / 1000) {
    throw new GatewayValidationError('The provider connection grant does not match this reservation.', 502)
  }

  return {
    protocolVersion: connection.protocolVersion,
    gatewayWsUrl: endpoint.toString(),
    labId: String(connection.labId),
    reservationKey: String(connection.reservationKey),
    sessionTicket: connection.sessionTicket,
    ticketExpiresAt: Number(connection.ticketExpiresAt),
  }
}
