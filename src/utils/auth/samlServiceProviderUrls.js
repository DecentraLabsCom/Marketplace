import { getServerBaseUrl } from '@/utils/env/baseUrl'

const SAML_PATHS = {
  metadata: '/api/auth/sso/saml2/metadata',
  callback: '/api/auth/sso/saml2/callback',
  logout: '/api/auth/sso/saml2/logout',
}

export function getSamlServiceProviderUrls(baseUrl = getServerBaseUrl()) {
  const origin = String(baseUrl).replace(/\/+$/, '')

  return Object.fromEntries(
    Object.entries(SAML_PATHS).map(([name, path]) => [name, `${origin}${path}`]),
  )
}
