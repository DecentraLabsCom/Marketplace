import { AuthMethod } from './principal'

let registryCache = null

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseJsonObject(value, fieldName) {
  const text = String(value || '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('must be an object')
    return parsed
  } catch (error) {
    throw new Error(`${fieldName} must be a JSON object`, { cause: error })
  }
}

function roleValues(value, fallback) {
  const values = Array.isArray(value) ? value : splitCsv(value)
  return values.map((item) => String(item).trim()).filter(Boolean)
    .concat(values.length ? [] : [fallback])
}

function normalizeRule(rule = {}) {
  return {
    attribute: typeof rule.attribute === 'string' && rule.attribute.trim()
      ? rule.attribute.trim()
      : String(process.env.ENTRA_ROLE_CLAIM || 'roles').trim() || 'roles',
    providerValues: roleValues(rule.providerValues, 'provider'),
    adminValues: roleValues(rule.adminValues, 'admin'),
    caseInsensitive: rule.caseInsensitive !== false,
    substringMatch: rule.substringMatch === true,
  }
}

function entraRoleMappings() {
  const configured = parseJsonObject(process.env.ENTRA_TENANT_ROLE_MAPPINGS, 'ENTRA_TENANT_ROLE_MAPPINGS')
  return configured && typeof configured === 'object' ? configured : {}
}

function entraTenantIds() {
  const ids = new Set()
  const configuredTenant = String(process.env.ENTRA_TENANT_ID || '').trim()
  if (configuredTenant && !['common', 'organizations', 'consumers'].includes(configuredTenant.toLowerCase())) {
    ids.add(configuredTenant)
  }
  splitCsv(process.env.ENTRA_ALLOWED_TENANTS)
    .filter((tenant) => !['any', 'none'].includes(tenant.toLowerCase()))
    .forEach((tenant) => ids.add(tenant))
  Object.keys(entraRoleMappings()).map((tenant) => tenant.trim()).filter(Boolean).forEach((tenant) => ids.add(tenant))
  return [...ids]
}

function buildRegistry() {
  const defaultRule = normalizeRule({
    attribute: process.env.ENTRA_ROLE_CLAIM || 'roles',
    providerValues: process.env.ENTRA_PROVIDER_ROLE_VALUES,
    adminValues: process.env.ENTRA_ADMIN_ROLE_VALUES,
  })
  const tenantMappings = entraRoleMappings()
  const tenants = entraTenantIds()
  const entries = tenants.length
    ? tenants.map((tenantId) => ({
      id: `entra-${tenantId}`,
      provider: AuthMethod.ENTRA_ID,
      type: 'oidc',
      tenantId,
      discoveryUrl: `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/v2.0`,
      roleMapping: normalizeRule({ ...defaultRule, ...(tenantMappings[tenantId] || {}) }),
    }))
    : [{
      id: 'entra-default',
      provider: AuthMethod.ENTRA_ID,
      type: 'oidc',
      tenantId: null,
      roleMapping: defaultRule,
    }]

  return entries
}

export function getRegistry() {
  if (!registryCache) registryCache = buildRegistry()
  return registryCache
}

export function resetRegistry() {
  registryCache = null
}

function normalizeProvider(provider) {
  return provider === 'entra' ? AuthMethod.ENTRA_ID : provider
}

export function findIdPByProvider(provider, tenantId) {
  const normalizedProvider = normalizeProvider(provider)
  const normalizedTenant = typeof tenantId === 'string' ? tenantId.trim() : ''
  return getRegistry().find((entry) => entry.provider === normalizedProvider
    && (!normalizedTenant || entry.tenantId === normalizedTenant)) || null
}

export function findIdPByTenantId(tenantId) {
  const normalizedTenant = typeof tenantId === 'string' ? tenantId.trim() : ''
  return getRegistry().find((entry) => entry.tenantId === normalizedTenant) || null
}

export function getRoleMappingRules(provider, tenantId) {
  const exact = findIdPByProvider(provider, tenantId)
  if (exact) return exact.roleMapping || null
  return findIdPByProvider(provider)?.roleMapping || null
}

export default {
  getRegistry,
  resetRegistry,
  findIdPByProvider,
  findIdPByTenantId,
  getRoleMappingRules,
}
