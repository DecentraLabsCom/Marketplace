/**
 * Unified Query Keys for React Query
 * Centralized key management for consistent cache invalidation
 * and query organization across the application
 * INTERNAL USE ONLY - Components should use hooks, not direct query keys
 */

/**
 * Centralized query keys for React Query
 * @constant {Object}
 */
export const QUERY_KEYS = {
  // Bookings
  BOOKINGS: {
    all: ['bookings'],
    user: (address) => ['bookings', 'user', address],
    lab: (labId) => ['bookings', 'lab', labId],
    labWithDates: (labId, startDate, endDate) => ['bookings', 'lab', labId, startDate, endDate],
  },
  
  // Labs - Atomic endpoints only
  LABS: {
    list: ['labs', 'list'],
    decimals: ['labs', 'decimals'],
    data: (labId) => ['labs', 'data', labId],
    owner: (labId) => ['labs', 'owner', labId],
    metadata: (uri) => ['labs', 'metadata', uri],
  },
  
  // User
  USER: {
    profile: (address) => ['user', 'profile', address],
    status: (address) => ['user', 'status', address],
  },
  
  // SSO & Authentication
  SSO_SESSION: ['sso', 'session'],
  AUTH: {
    ssoSession: ['auth', 'sso', 'session'],
  },
  
  // Provider
  PROVIDER: {
    profile: (id) => ['provider', 'profile', id],
    status: (identifier, isEmail = false) => ['provider', 'status', identifier, isEmail],
    name: (wallet) => ['provider', 'name', wallet],
  },
  
  // Providers (atomic)
  PROVIDERS: {
    list: ['providers', 'list'],
  },
};

// Helper to invalidate related query keys
/**
 * Patterns for cache invalidation that cascade related data
 * @constant {Object}
 */
export const INVALIDATION_PATTERNS = {
  // Invalidate all bookings when there are changes
  allBookings: () => [QUERY_KEYS.BOOKINGS.all],

  // Invalidate bookings for a specific user
  userBookings: (address) => [
    QUERY_KEYS.BOOKINGS.user(address),
  ],

  // Invalidate bookings for a specific lab
  labBookings: (labId) => [
    QUERY_KEYS.BOOKINGS.lab(labId),
    QUERY_KEYS.BOOKINGS.labWithDates(labId),
  ],

  // Invalidate lab data when a lab changes
  labData: (labId) => [
    QUERY_KEYS.LABS.data(labId),
    QUERY_KEYS.LABS.owner(labId),
    ...INVALIDATION_PATTERNS.labBookings(labId),
  ],

  // Invalidate user data
  userData: (address) => [
    QUERY_KEYS.USER.profile(address),
    QUERY_KEYS.USER.status(address),
    ...INVALIDATION_PATTERNS.userBookings(address),
  ],
};