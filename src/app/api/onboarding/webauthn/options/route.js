import { NextResponse } from 'next/server'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import {
  createOnboardingBackendHeaders,
  getOnboardingContext,
  OnboardingContextError,
  publicOnboardingMeta,
} from '@/utils/onboarding/serverOnboarding'
import { publicErrorResponse } from '@/utils/security/publicError'

export async function POST() {
  try {
    const context = await getOnboardingContext()
    const upstream = await institutionalBackendFetch(`${context.backendUrl}/onboarding/webauthn/options`, {
      method: 'POST',
      headers: await createOnboardingBackendHeaders(context),
      body: JSON.stringify(context.payload),
      cache: 'no-store',
    })
    if (!upstream.ok) {
      return publicErrorResponse({ status: 502, code: 'ONBOARDING_OPTIONS_UNAVAILABLE', message: 'The onboarding ceremony could not be prepared.', context: 'onboarding-options' })
    }
    const data = await upstream.json()
    if (!data?.sessionId) {
      return publicErrorResponse({ status: 502, code: 'ONBOARDING_OPTIONS_INVALID', message: 'The onboarding ceremony could not be prepared.', context: 'onboarding-options' })
    }
    // The ceremony is deliberately browser-facing, but its origin is fixed to
    // the backend resolved from the authenticated institution, never upstream input.
    return NextResponse.json({
      ...publicOnboardingMeta(context),
      sessionId: String(data.sessionId),
      ceremonyUrl: `${context.backendUrl}/onboarding/webauthn/ceremony/${encodeURIComponent(data.sessionId)}`,
      expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : null,
    })
  } catch (error) {
    if (error instanceof OnboardingContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    return publicErrorResponse({ status: 502, code: 'ONBOARDING_OPTIONS_FAILED', message: 'The onboarding ceremony could not be prepared.', error, context: 'onboarding-options' })
  }
}
