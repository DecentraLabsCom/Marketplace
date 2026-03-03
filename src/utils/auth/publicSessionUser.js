const PUBLIC_SESSION_FIELDS = [
  'id',
  'eduPersonTargetedID',
  'eduPersonPrincipalName',
  'uid',
  'userid',
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
  'eduPersonAffiliation',
  'eduPersonScopedAffiliation',
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

  // Backward-compatible aliases used in different parts of the app.
  if (!sanitized.schacPersonalUniqueCode && sanitized.personalUniqueCode) {
    sanitized.schacPersonalUniqueCode = sanitized.personalUniqueCode;
  }
  if (!sanitized.schacHomeOrganization && sanitized.affiliation) {
    sanitized.schacHomeOrganization = sanitized.affiliation;
  }
  // if ePPN is present but id missing, use it as id for convenience
  if (sanitized.eduPersonPrincipalName && !sanitized.id) {
    sanitized.id = sanitized.eduPersonPrincipalName;
  }

  return sanitized;
}

export default {
  sanitizeSessionUserForClient,
};
