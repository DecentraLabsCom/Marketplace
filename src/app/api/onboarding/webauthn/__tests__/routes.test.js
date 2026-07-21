/** @jest-environment node */

jest.mock('@/utils/api/gatewayProxy', () => ({
  institutionalBackendFetch: jest.fn(),
}))

jest.mock('@/utils/onboarding/serverOnboarding', () => ({
  createOnboardingBackendHeaders: jest.fn(),
  getOnboardingContext: jest.fn(),
  OnboardingContextError: class OnboardingContextError extends Error {},
  publicOnboardingMeta: jest.fn(() => ({ stableUserId: 'user-1', institutionId: 'example.edu' })),
}))

jest.mock('@/utils/security/publicError', () => ({
  publicErrorResponse: jest.fn(({ status, code, message, error }) => Response.json({
    status,
    code,
    message,
    loggedError: error?.message,
  }, { status })),
}))

import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import {
  createOnboardingBackendHeaders,
  getOnboardingContext,
} from '@/utils/onboarding/serverOnboarding'
import { publicErrorResponse } from '@/utils/security/publicError'
import { GET as getKeyStatus } from '../key-status/route'
import { POST as postOptions } from '../options/route'

const context = {
  backendUrl: 'https://backend.example.edu',
  stableUserId: 'user-1',
  institutionId: 'example.edu',
  payload: { stableUserId: 'user-1', institutionId: 'example.edu' },
}

describe('institutional WebAuthn proxy routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getOnboardingContext.mockResolvedValue(context)
    createOnboardingBackendHeaders.mockResolvedValue({ Authorization: 'Bearer server-token' })
  })

  test('records the upstream status when key-status is unavailable', async () => {
    institutionalBackendFetch.mockResolvedValue(new Response('{}', { status: 401 }))

    const response = await getKeyStatus()

    expect(response.status).toBe(502)
    expect(publicErrorResponse).toHaveBeenCalledWith(expect.objectContaining({
      code: 'ONBOARDING_STATUS_UNAVAILABLE',
      error: new Error('Institutional onboarding backend responded with status 401'),
    }))
  })

  test('records the upstream status when options preparation is unavailable', async () => {
    institutionalBackendFetch.mockResolvedValue(new Response('{}', { status: 403 }))

    const response = await postOptions()

    expect(response.status).toBe(502)
    expect(publicErrorResponse).toHaveBeenCalledWith(expect.objectContaining({
      code: 'ONBOARDING_OPTIONS_UNAVAILABLE',
      error: new Error('Institutional onboarding backend responded with status 403'),
    }))
  })

  test('keeps the first-time key-status response as not onboarded', async () => {
    institutionalBackendFetch.mockResolvedValue(new Response('{}', { status: 404 }))

    const response = await getKeyStatus()

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      stableUserId: 'user-1',
      institutionId: 'example.edu',
      hasCredential: false,
    })
    expect(publicErrorResponse).not.toHaveBeenCalled()
  })
})
