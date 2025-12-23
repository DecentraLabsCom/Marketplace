import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import {
  BadRequestError,
  handleGuardError,
  requireAuth,
} from '@/utils/auth/guards'

function normalizeAuthBase(authEndpoint) {
  if (!authEndpoint || typeof authEndpoint !== 'string') {
    return null
  }
  const trimmed = authEndpoint.endsWith('/') ? authEndpoint.slice(0, -1) : authEndpoint
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null
  }
  return trimmed.endsWith('/auth') ? trimmed : `${trimmed}/auth`
}

async function resolveAuthEndpoint(labId) {
  if (!labId) {
    return null
  }
  const contract = await getContractInstance()
  const lab = await contract.getLab(Number(labId))
  return normalizeAuthBase(lab?.base?.auth || '')
}

export async function POST(req) {
  try {
    const session = await requireAuth()
    const body = await req.json().catch(() => ({}))

    const { reservationKey, labId, authEndpoint } = body || {}
    if (!reservationKey && !labId) {
      throw new BadRequestError('Missing reservationKey or labId')
    }

    if (!session?.samlAssertion) {
      throw new BadRequestError('SSO session missing samlAssertion')
    }

    const authBase = normalizeAuthBase(authEndpoint) || (await resolveAuthEndpoint(labId))
    if (!authBase) {
      throw new BadRequestError('Missing or invalid auth endpoint')
    }

    const payload = {
      samlAssertion: session.samlAssertion,
      reservationKey,
      labId,
      puc: session.personalUniqueCode || session.schacPersonalUniqueCode || undefined,
    }

    const response = await fetch(`${authBase}/checkin-institutional`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()
    if (!response.ok) {
      devLog.error('Institutional check-in failed:', response.status, responseText)
      return NextResponse.json(
        { error: 'Institutional check-in failed', details: responseText },
        { status: response.status }
      )
    }

    const data = responseText ? JSON.parse(responseText) : {}
    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    return handleGuardError(error)
  }
}
