import { NextResponse } from 'next/server'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { getCredentialForUser } from '@/utils/webauthn/store'
import { getPucFromSession } from '@/utils/webauthn/service'
import devLog from '@/utils/dev/logger'

export async function GET() {
  try {
    const session = await requireAuth()
    const puc = getPucFromSession(session)

    if (!puc) {
      return NextResponse.json(
        { registered: false, reason: 'Missing PUC in session' },
        { status: 400 },
      )
    }

    const credential = getCredentialForUser(puc)

    if (!credential) {
      return NextResponse.json({ registered: false })
    }

    return NextResponse.json({
      registered: true,
      credentialId: credential.credentialId,
      signCount: credential.signCount,
      aaguid: credential.aaguid,
      status: credential.status,
    })
  } catch (error) {
    devLog.error('[API] WebAuthn status error', error)

    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error)
    }

    return NextResponse.json({ registered: false, error: 'Unable to resolve WebAuthn status' }, { status: 500 })
  }
}
