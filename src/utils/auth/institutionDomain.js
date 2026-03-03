function extractDomainCandidate(rawValue) {
  if (typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim().toLowerCase();
  if (!trimmed) return null;

  let domain = trimmed;
  if (trimmed.includes('@')) {
    const parts = trimmed.split('@');
    domain = parts[parts.length - 1] || '';
  }

  domain = domain.replace(/^\.+|\.+$/g, '');
  if (!domain || !domain.includes('.')) return null;
  if (!/^[a-z0-9.-]+$/.test(domain)) return null;

  return domain;
}

export function resolveInstitutionDomain(candidates = []) {
  for (const candidate of candidates) {
    const normalized = extractDomainCandidate(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export function resolveInstitutionDomainFromSession(session, overrideDomain) {
  return resolveInstitutionDomain([
    overrideDomain,
    session?.schacHomeOrganization,
    session?.eduPersonScopedAffiliation,
  ]);
}

export default {
  resolveInstitutionDomain,
  resolveInstitutionDomainFromSession,
};
