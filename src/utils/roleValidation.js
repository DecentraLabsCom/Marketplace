/**
 * Role-based access control utilities for SSO users
 * Uses SAML2 standard roles from eduPerson schema and SAML attribute standards
 * 
 * Reference: https://spaces.at.internet2.edu/display/federation/user-attr-edupersonaffiliation
 * eduPersonAffiliation standard values:
 * - faculty: Academic staff members
 * - student: Students at all levels  
 * - staff: Non-academic staff members
 * - alum: Alumni
 * - member: Members of the institution
 * - affiliate: Affiliates of the institution
 * - employee: Employees (both academic and non-academic)
 * - library-walk-in: Walk-in library users
 */

// Define roles that are allowed to register as providers
// Based on eduPersonAffiliation standard values
export const PROVIDER_ALLOWED_ROLES = [
  'faculty',
  'staff',
  'employee', 
  'member',
  'affiliate'
];

// Define roles that are explicitly denied (students, etc.)
// Based on eduPersonAffiliation standard values
export const PROVIDER_DENIED_ROLES = [
  'student',
  'alum',
  'library-walk-in'  // Walk-in library users should not be providers
];

/**
 * Check if a user role is allowed for provider registration
 * @param {string} role - Primary role from SSO
 * @param {string} scopedRole - Scoped role from SSO (optional)
 * @returns {Object} - {isValid: boolean, reason: string}
 */
export function validateProviderRole(role, scopedRole = '') {
  const userRole = (role || '').toLowerCase().trim();
  const userScopedRole = (scopedRole || '').toLowerCase().trim();
  
  // Check if explicitly denied first
  const isDenied = PROVIDER_DENIED_ROLES.some(deniedRole => 
    userRole.includes(deniedRole) || userScopedRole.includes(deniedRole)
  );
  
  if (isDenied) {
    return {
      isValid: false,
      reason: `Students and learners are not eligible for provider registration.`
    };
  }
  
  // Check if role is in allowed list
  const isAllowed = PROVIDER_ALLOWED_ROLES.some(allowedRole => 
    userRole.includes(allowedRole) || userScopedRole.includes(allowedRole)
  );
  
  if (!isAllowed) {
    return {
      isValid: false,
      reason: `Your role "${role || 'Unknown'}" does not have provider registration privileges. Only faculty, staff, employees, members, and affiliates can register as providers.`
    };
  }
  
  return {
    isValid: true,
    reason: ''
  };
}

/**
 * Check if user has any administrative privileges
 * @param {string} role - Primary role from SSO
 * @param {string} scopedRole - Scoped role from SSO (optional)
 * @returns {boolean}
 */
export function hasAdminRole(role, scopedRole = '') {
  // Using standard eduPersonAffiliation values for admin roles
  const adminRoles = ['staff'];
  const userRole = (role || '').toLowerCase();
  const userScopedRole = (scopedRole || '').toLowerCase();
  
  return adminRoles.some(adminRole => 
    userRole.includes(adminRole) || userScopedRole.includes(adminRole)
  );
}

/**
 * Get a user-friendly role display name
 * Based on standard eduPersonAffiliation values
 * @param {string} role - Role from SSO
 * @returns {string}
 */
export function getRoleDisplayName(role) {
  if (!role) return 'Unknown';
  
  // Mapping based on standard eduPersonAffiliation values
  const roleMap = {
    'faculty': 'Faculty',
    'staff': 'Staff',
    'employee': 'Employee',
    'student': 'Student',
    'member': 'Member',
    'affiliate': 'Affiliate',
    'alum': 'Alumni',
    'library-walk-in': 'Library Walk-in User'
  };
  
  const lowerRole = role.toLowerCase();
  for (const [key, value] of Object.entries(roleMap)) {
    if (lowerRole.includes(key)) {
      return value;
    }
  }
  
  // Capitalize first letter if no mapping found
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}
