import { cookies } from 'next/headers'
import { getSessionFromCookies } from '@/utils/auth/sessionCookie'
import { extractStableUserId } from '@/utils/onboarding'
import { computeAssertionHash } from '@/utils/intents/signInstitutionalActionIntent'
import { createInstitutionalServiceToken } from '@/utils/auth/institutionalServiceCredential'
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain'
import { getStableUserIdModeFromSession } from '@/utils/auth/puc'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'

export class OnboardingContextError extends Error {
  constructor(message, status = 400, code = 'ONBOARDING_CONTEXT_INVALID') {
    super(message)
    this.name = 'OnboardingContextError'
    this.status = status
    this.code = code
  }
}

export async function getOnboardingContext({ includeBackend = true } = {}) {
  const cookieStore = await cookies()
  const session = await getSessionFromCookies(cookieStore)
  if (!session?.isSSO) {
    throw new OnboardingContextError('SSO session required for institutional onboarding', 401, 'SSO_REQUIRED')
  }

  const institutionId = resolveInstitutionDomainFromSession(session)
  if (!institutionId) {
    throw new OnboardingContextError('Missing institution affiliation in session', 400, 'MISSING_INSTITUTION')
  }

  const stableUserId = extractStableUserId({
    eduPersonPrincipalName: session.eduPersonPrincipalName,
    eduPersonTargetedID: session.eduPersonTargetedID,
    email: session.email,
    name: session.name || session.displayName,
    affiliation: institutionId,
  })
  if (!stableUserId) {
    throw new OnboardingContextError('Cannot determine stable user ID from session', 400, 'MISSING_USER_ID')
  }

  const payload = {
    stableUserId,
    stableUserIdMode: getStableUserIdModeFromSession(session),
    institutionId,
    displayName: session.name || session.displayName || session.email || stableUserId,
    attributes: JSON.stringify({
      email: session.email,
      role: session.role,
      scopedRole: session.scopedRole || session.eduPersonScopedAffiliation,
    }),
  }
  if (session.samlAssertion) {
    payload.assertionReference = `sha256:${computeAssertionHash(session.samlAssertion)}`
  }

  const backendUrl = includeBackend
    ? await resolveInstitutionalBackendUrl(institutionId)
    : null
  if (includeBackend && !backendUrl) {
    throw new OnboardingContextError('Institution backend URL not available', 424, 'BACKEND_NOT_CONFIGURED')
  }

  return { session, stableUserId, institutionId, backendUrl, payload }
}

export async function createOnboardingBackendHeaders(context) {
  const token = await createInstitutionalServiceToken({
    backendUrl: context.backendUrl,
    institutionId: context.institutionId,
    scope: 'onboarding:webauthn',
    expiresInSeconds: 60,
    claims: {
      puc: context.stableUserId,
      affiliation: context.institutionId,
    },
  })
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token.token}`,
  }
  return headers
}

export const publicOnboardingMeta = ({ stableUserId, institutionId }) => ({ stableUserId, institutionId })
