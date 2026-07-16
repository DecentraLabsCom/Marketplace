import { NextResponse } from 'next/server'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { resolveInstitutionAddressFromSession } from '@/app/api/contract/utils/institutionSession'
import { resolveBackendUrlForSession, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import { ForbiddenError } from '@/utils/auth/guards'
import { publicErrorResponse } from '@/utils/security/publicError'

const MAX_MOVEMENTS = 100

export const parseMovementLimit = (value) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 20
  return Math.min(parsed, MAX_MOVEMENTS)
}

export async function proxyCreditAccount(resource, request) {
  try {
    const { backendUrl, session } = await resolveBackendUrlForSession()
    if (!session.isSSO) throw new ForbiddenError('Institutional SSO session required')
    if (!backendUrl) {
      return publicErrorResponse({ status: 424, code: 'BACKEND_NOT_CONFIGURED', message: 'The institutional billing service is not configured.', context: 'billing-proxy' })
    }

    const contract = await getContractInstance()
    const { institutionAddress } = await resolveInstitutionAddressFromSession(session, contract)
    const encodedAddress = encodeURIComponent(institutionAddress)
    const base = `${backendUrl}/billing`
    const path = resource === 'summary'
      ? `${base}/credit-accounts/${encodedAddress}`
      : resource === 'lots'
        ? `${base}/credit-accounts/${encodedAddress}/lots`
        : resource === 'movements'
          ? `${base}/credit-accounts/${encodedAddress}/movements?limit=${parseMovementLimit(new URL(request.url).searchParams.get('limit'))}`
          : `${base}/funding-orders?institution=${encodedAddress}`
    const upstream = await institutionalBackendFetch(path, {
      headers: await resolveForwardHeaders(),
      cache: 'no-store',
    })
    if (upstream.status === 404) return NextResponse.json(null, { status: 404 })
    if (!upstream.ok) {
      return publicErrorResponse({ status: 502, code: 'BILLING_UNAVAILABLE', message: 'The institutional billing service is temporarily unavailable.', context: 'billing-proxy' })
    }
    return NextResponse.json(await upstream.json(), { status: 200 })
  } catch (error) {
    if (error?.name === 'UnauthorizedError' || error?.name === 'ForbiddenError' || error?.name === 'BadRequestError') throw error
    return publicErrorResponse({ status: 502, code: 'BILLING_PROXY_FAILED', message: 'The institutional billing service could not be reached.', error, context: 'billing-proxy' })
  }
}
