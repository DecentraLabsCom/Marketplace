const PUBLIC_SESSION_FIELDS = [
  'id',
  'eduPersonTargetedID',
  'eduPersonPrincipalName',
  'email',
  'name',
  'displayName',
  'authType',
  'isSSO',
  'wallet',
  'affiliation',
  'schacHomeOrganization',
  'role',
  'scopedRole',
  'eduPersonScopedAffiliation',
  'entitlements',
  'personalUniqueCode',
  'schacPersonalUniqueCode',
  'organizationName',
  'institutionName',
  'country',
];

export function sanitizeSessionUserForClient(sessionUser) {
  if (!sessionUser || typeof sessionUser !== 'object') {
    return null;
  }

  const sanitized = {};
  for (const key of PUBLIC_SESSION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(sessionUser, key)) {
      sanitized[key] = sessionUser[key];
    }
  }

  // Canonical aliases used in different parts of the app.
  if (!sanitized.schacPersonalUniqueCode && sanitized.personalUniqueCode) {
    sanitized.schacPersonalUniqueCode = sanitized.personalUniqueCode;
  }
  if (!sanitized.schacHomeOrganization && sanitized.affiliation) {
    sanitized.schacHomeOrganization = sanitized.affiliation;
  }

  return sanitized;
}

export default {
  sanitizeSessionUserForClient,
};
