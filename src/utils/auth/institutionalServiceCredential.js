import marketplaceJwtService from '@/utils/auth/marketplaceJwt'

export const INSTITUTIONAL_SERVICE_SUBJECT = 'marketplace'

/**
 * The backend URL is resolved from the authenticated institution's registry
 * entry. Only its exact origin is placed in `aud`; paths are transport
 * details, not a shared audience for every institutional backend.
 */
export function normalizeInstitutionalServiceAudience(backendUrl) {
  if (typeof backendUrl !== 'string' || !backendUrl.trim()) {
    throw new Error('Institutional backend URL is required for service credentials')
  }

  let parsed
  try {
    parsed = new URL(backendUrl)
  } catch (error) {
    throw new Error('Institutional backend URL is invalid for service credentials', { cause: error })
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Institutional backend URL is invalid for service credentials')
  }

  return parsed.origin
}

export async function createInstitutionalServiceToken({
  backendUrl,
  institutionId,
  scope,
  expiresInSeconds = 60,
  claims,
}) {
  if (typeof institutionId !== 'string' || !institutionId.trim()) {
    throw new Error('Institution ID is required for service credentials')
  }
  if (typeof scope !== 'string' || !scope.trim() || /\s/.test(scope.trim())) {
    throw new Error('A single service scope is required')
  }

  return marketplaceJwtService.generateIntentBackendToken({
    audience: normalizeInstitutionalServiceAudience(backendUrl),
    institutionId: institutionId.trim(),
    scope: scope.trim(),
    subject: INSTITUTIONAL_SERVICE_SUBJECT,
    expiresInSeconds,
    claims,
  })
}
