/**
 * Maps VC claims to the internal normalized claims model.
 *
 * @param {Object} vcClaims - The claims extracted from a Verifiable Credential.
 * @param {string} [vcClaims.sub] - The stable subject identifier.
 * @param {string} [vcClaims.organization] - The institution identifier.
 * @param {string} [vcClaims.institutionId] - Alternative institution identifier.
 * @param {string} [vcClaims.role] - The user role.
 * @param {string} [vcClaims.scopedRole] - The scoped user role.
 * @param {string} [vcClaims.puc] - The persistent unique code.
 * @param {string} [vcClaims.email] - The user email address.
 * @param {string} [vcClaims.name] - The display name.
 * @returns {Object} The normalized claims object.
 */
export function mapVcClaimsToNormalizedClaims(vcClaims = {}) {
  return {
    stableUserId: vcClaims.sub || '',
    institutionId: vcClaims.organization || vcClaims.institutionId || '',
    role: vcClaims.role || undefined,
    scopedRole: vcClaims.scopedRole || undefined,
    puc: vcClaims.puc || vcClaims.sub || '',
    email: vcClaims.email || undefined,
    name: vcClaims.name || undefined,
  }
}

/**
 * Maps SAML claims to the internal normalized claims model.
 * @param {Object} params - The claims extracted from a SAML assertion.
 * @param {string} params.userid - The stable user identifier.
 * @param {string} params.schacHomeOrganization - The institution identifier.
 * @param {string} params.affiliation - The fallback institution affiliation.
 * @param {string} params.role - The user role.
 * @param {string} params.scopedRole - The scoped user role.
 * @param {string} params.puc - The persistent unique code.
 * @param {string} params.email - The user email address.
 * @param {string} params.name - The display name.
 * @returns {Object} The normalized claims object.
 */
export function mapSamlClaimsToNormalizedClaims({
  userid,
  schacHomeOrganization,
  affiliation,
  role,
  scopedRole,
  puc,
  email,
  name,
}) {
  return {
    stableUserId: userid || "",
    institutionId: schacHomeOrganization || affiliation || "",
    role: role || undefined,
    scopedRole: scopedRole || undefined,
    puc: puc || userid || "",
    email: email || undefined,
    name: name || undefined,
  };
}

export default {
  mapVcClaimsToNormalizedClaims,
  mapSamlClaimsToNormalizedClaims
}
