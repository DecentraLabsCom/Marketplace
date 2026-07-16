/** @jest-environment node */

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  HttpError: class HttpError extends Error {},
}))

jest.mock('@/utils/auth/platformAdmin', () => ({
  requirePlatformAdminSession: jest.fn(),
}))

jest.mock('@/utils/onboarding/institutionalBackend', () => ({
  denyInstitutionalBackend: jest.fn(),
  restoreInstitutionalBackend: jest.fn(),
}))

import { POST, DELETE } from '../api/admin/institutions/backend-revocation/route'
import { requireAuth } from '@/utils/auth/guards'
import { requirePlatformAdminSession } from '@/utils/auth/platformAdmin'
import { denyInstitutionalBackend, restoreInstitutionalBackend } from '@/utils/onboarding/institutionalBackend'

describe('institutional backend emergency revocation route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ samlAssertion: 'assertion', email: 'admin@example.edu' })
    requirePlatformAdminSession.mockReturnValue('admin@example.edu')
  })

  test('allows a platform admin to denylist a backend for a bounded duration', async () => {
    const response = await POST(new Request('https://marketplace.example/api/admin/institutions/backend-revocation', {
      method: 'POST',
      body: JSON.stringify({ institutionId: 'uned.es', ttlSeconds: 300 }),
    }))

    expect(response.status).toBe(200)
    expect(denyInstitutionalBackend).toHaveBeenCalledWith('uned.es', { ttlSeconds: 300 })
  })

  test('allows a platform admin to restore a previously denylisted backend', async () => {
    const response = await DELETE(new Request('https://marketplace.example/api/admin/institutions/backend-revocation', {
      method: 'DELETE',
      body: JSON.stringify({ institutionId: 'uned.es' }),
    }))

    expect(response.status).toBe(200)
    expect(restoreInstitutionalBackend).toHaveBeenCalledWith('uned.es')
  })
})
