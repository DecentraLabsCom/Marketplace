import { NextResponse } from 'next/server'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { getCredentialForUser } from '@/utils/webauthn/store'
import { buildRegistrationOptions, getPucFromSession } from '@/utils/webauthn/service'
import devLog from '@/utils/dev/logger'

export async function GET(request) {
  try {
    const session = await requireAuth()
    const puc = getPucFromSession(session)

    if (!puc) {
      return NextResponse.json({ error: 'Missing PUC in session' }, { status: 400 })
    }

    const existing = getCredentialForUser(puc)
    if (existing) {
      return NextResponse.json({
        registered: true,
        credentialId: existing.credentialId,
        signCount: existing.signCount,
        aaguid: existing.aaguid,
      })
    }

    const options = await buildRegistrationOptions(session, request)
    return NextResponse.json({ registered: false, options })
  } catch (error) {
    devLog.error('[API] WebAuthn options error', error)

    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error)
    }

    return NextResponse.json({ error: 'Failed to generate WebAuthn options' }, { status: 500 })
  }
}
