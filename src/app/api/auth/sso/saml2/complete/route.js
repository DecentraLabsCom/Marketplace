import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { reconcileFmuContextsForSession } from '@/utils/auth/reconcileFmuContexts'
import { normalizeSamlReturnTo } from '@/utils/auth/samlTransactionStore'

export async function GET(request) {
  try {
    const session = await requireAuth()
    const cookieStore = await cookies()
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin
    const returnTo = normalizeSamlReturnTo(new URL(request.url).searchParams.get('returnTo'))
    const targetUrl = new URL(returnTo || '/userdashboard', baseUrl)
    targetUrl.searchParams.set('sso_login', '1')
    const response = NextResponse.redirect(targetUrl, 303)
    await reconcileFmuContextsForSession(response, cookieStore, session)
    return response
  } catch (error) {
    return handleGuardError(error, request)
  }
}
