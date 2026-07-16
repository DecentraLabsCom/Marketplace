import { NextResponse } from 'next/server'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import {
  createOnboardingBackendHeaders,
  getOnboardingContext,
  OnboardingContextError,
  publicOnboardingMeta,
} from '@/utils/onboarding/serverOnboarding'
import { publicErrorResponse } from '@/utils/security/publicError'

export async function GET() {
  try {
    const context = await getOnboardingContext()
    const upstream = await institutionalBackendFetch(
      `${context.backendUrl}/onboarding/webauthn/key-status/${encodeURIComponent(context.stableUserId)}?institutionId=${encodeURIComponent(context.institutionId)}`,
      { headers: await createOnboardingBackendHeaders(context), cache: 'no-store' },
    )
    if (upstream.status === 404) return NextResponse.json({ ...publicOnboardingMeta(context), hasCredential: false }, { status: 404 })
    if (!upstream.ok) {
      return publicErrorResponse({ status: 502, code: 'ONBOARDING_STATUS_UNAVAILABLE', message: 'The onboarding status could not be checked.', context: 'onboarding-key-status' })
    }
    const data = await upstream.json()
    return NextResponse.json({
      ...publicOnboardingMeta(context),
      hasCredential: Boolean(data?.hasCredential),
      hasPlatformCredential: typeof data?.hasPlatformCredential === 'boolean' ? data.hasPlatformCredential : null,
    })
  } catch (error) {
    if (error instanceof OnboardingContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    return publicErrorResponse({ status: 502, code: 'ONBOARDING_STATUS_FAILED', message: 'The onboarding status could not be checked.', error, context: 'onboarding-key-status' })
  }
}
