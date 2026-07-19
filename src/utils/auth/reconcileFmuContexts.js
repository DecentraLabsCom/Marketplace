import {
  FMU_CONTEXT_COOKIE,
  clearFmuContextCookie,
  createFmuUserBinding,
  encodeFmuContextList,
  fmuContextCookieOptions,
} from '@/utils/auth/fmuSessionStore'
import { revokeFmuContextsExceptUser } from '@/utils/auth/revokeFmuContexts'

export async function reconcileFmuContextsForSession(response, cookieStore, session) {
  const existingFmuCookie = cookieStore?.get?.(FMU_CONTEXT_COOKIE)?.value
  if (!existingFmuCookie) return

  const retainedContexts = await revokeFmuContextsExceptUser(
    cookieStore,
    createFmuUserBinding(session),
  )
  if (retainedContexts.length > 0) {
    const { encoded, contexts } = encodeFmuContextList(retainedContexts)
    response.cookies.set(FMU_CONTEXT_COOKIE, encoded, fmuContextCookieOptions(contexts))
  } else {
    clearFmuContextCookie(response.cookies)
  }
}
