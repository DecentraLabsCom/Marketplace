import devLog from '@/utils/dev/logger'
import {
  AuthMethod,
  PrincipalType,
  assertCanonicalPrincipal,
  buildFederatedSub,
} from './principal'
import { getRoleMappingRules } from './idpRegistry'
import { mapClaimsToRoles } from './roleMapper'

function parseAllowedTenants() {
  const configured = String(process.env.ENTRA_ALLOWED_TENANTS || '').trim()
  if (!configured || configured.toLowerCase() === 'none') return []
  if (configured.toLowerCase() === 'any') return null
  return configured.split(',').map((value) => value.trim()).filter(Boolean)
}

function parseTenantInstitutionMap() {
  const configured = String(process.env.ENTRA_TENANT_INSTITUTIONS || '').trim()
  if (!configured) return {}

  try {
    const parsed = JSON.parse(configured)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('map must be an object')
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([tenant, institution]) => [String(tenant).trim(), String(institution).trim().toLowerCase()])
        .filter(([tenant, institution]) => tenant && institution),
    )
  } catch (error) {
    devLog.warn('[ENTRA] Invalid ENTRA_TENANT_INSTITUTIONS configuration', error?.message || error)
    throw new Error('ENTRA_TENANT_INSTITUTIONS must be a JSON object')
  }
}

function normalizeInstitution(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(normalized) ? normalized : null
}

export function resolveEntraInstitution(claims = {}) {
  const tenantId = typeof claims.tid === 'string' ? claims.tid.trim() : ''
  const tenantInstitution = parseTenantInstitutionMap()[tenantId]
  const configuredInstitution = normalizeInstitution(process.env.ENTRA_INSTITUTION_ID)
  const mappedInstitution = normalizeInstitution(tenantInstitution || configuredInstitution)
  if (!mappedInstitution) {
    throw new Error('No institution is configured for the Entra tenant')
  }
  return mappedInstitution
}

function resolveRoles(claims) {
  return mapClaimsToRoles(claims, getRoleMappingRules(AuthMethod.ENTRA_ID, claims?.tid))
}

export function buildCanonicalPrincipalFromEntra(claims = {}) {
  const tenantId = typeof claims.tid === 'string' ? claims.tid.trim() : ''
  const objectId = typeof claims.oid === 'string' ? claims.oid.trim() : ''
  const issuer = typeof claims.iss === 'string' ? claims.iss.trim() : ''
  const subject = typeof claims.sub === 'string' ? claims.sub.trim() : ''
  if (!tenantId || !objectId || !issuer || !subject) {
    throw new Error('Entra claims are missing tid, oid, iss or sub')
  }

  const allowedTenants = parseAllowedTenants()
  if (allowedTenants !== null && !allowedTenants.includes(tenantId)) {
    throw new Error('Entra tenant is not allowed')
  }

  const institutionId = resolveEntraInstitution(claims)
  const principal = {
    principalType: PrincipalType.HUMAN,
    sub: buildFederatedSub('oidc', AuthMethod.ENTRA_ID, tenantId, objectId),
    externalIssuer: issuer,
    externalSubject: objectId,
    tenantId,
    clientId: typeof claims.azp === 'string' ? claims.azp : null,
    institutionId,
    email: typeof claims.preferred_username === 'string'
      ? claims.preferred_username
      : typeof claims.email === 'string' ? claims.email : null,
    name: typeof claims.name === 'string' ? claims.name : null,
    roles: resolveRoles(claims),
    authMethod: AuthMethod.ENTRA_ID,
  }

  return assertCanonicalPrincipal(principal)
}

export function principalToSessionData(principal, evidence) {
  assertCanonicalPrincipal(principal)
  if (!evidence?.evidenceHash || !evidence?.evidenceHashVersion) {
    throw new Error('Validated identity evidence is required for an Entra session')
  }

  return {
    id: principal.sub,
    stableUserId: principal.sub,
    eduPersonPrincipalName: principal.sub,
    puc: principal.sub,
    email: principal.email,
    name: principal.name,
    authType: 'sso',
    authMethod: principal.authMethod,
    identityProtocol: evidence.protocol,
    identityProvider: evidence.provider,
    identityIssuer: evidence.issuer,
    identitySubject: evidence.subject,
    identityEvidenceHash: evidence.evidenceHash,
    identityEvidenceHashVersion: evidence.evidenceHashVersion,
    isSSO: true,
    affiliation: principal.institutionId,
    schacHomeOrganization: principal.institutionId,
    principalType: principal.principalType,
    externalIssuer: principal.externalIssuer,
    externalSubject: principal.externalSubject,
    tenantId: principal.tenantId,
    clientId: principal.clientId,
    roles: principal.roles,
    role: principal.roles.join(','),
  }
}

export default {
  buildCanonicalPrincipalFromEntra,
  principalToSessionData,
  resolveEntraInstitution,
}
