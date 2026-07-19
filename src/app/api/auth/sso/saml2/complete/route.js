import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { reconcileFmuContextsForSession } from '@/utils/auth/reconcileFmuContexts'

export async function GET(request) {
  try {
    const session = await requireAuth()
    const cookieStore = await cookies()
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin
    const response = NextResponse.redirect(`${baseUrl}/userdashboard?sso_login=1`, 303)
    await reconcileFmuContextsForSession(response, cookieStore, session)
    return response
  } catch (error) {
    return handleGuardError(error, request)
  }
}
