/** @jest-environment node */

jest.mock('@/utils/auth/sso', () => ({
  createServiceProvider: jest.fn(),
}))

import { createServiceProvider } from '@/utils/auth/sso'
import { GET } from '../route'

describe('GET /api/auth/sso/saml2/metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SAML_SP_LOGOUT_URL = 'https://market.example/api/auth/sso/saml2/logout'
    createServiceProvider.mockReturnValue({
      create_metadata: () => '<md:EntityDescriptor><md:SPSSODescriptor><md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://market.example/api/auth/sso/saml2/callback"/></md:SPSSODescriptor></md:EntityDescriptor>',
    })
  })

  test('publishes only the HTTP-POST SingleLogoutService endpoint', async () => {
    const response = await GET()
    const metadata = await response.text()

    expect(response.status).toBe(200)
    expect(metadata).toContain(
      '<md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://market.example/api/auth/sso/saml2/logout"/>',
    )
    expect(metadata).not.toContain('https://market.example/api/auth/sso/saml2/callback"')
  })
})
