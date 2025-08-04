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
  // Bookings - Atomic and Composed patterns
  BOOKINGS: {
    all: ['bookings'],
    
    // Composed queries (primary data sources)
    userComposed: (address, includeDetails = false) => ['bookings', 'user-composed', address, includeDetails],
    labComposed: (labId, includeMetrics = true) => ['bookings', 'lab-composed', labId, includeMetrics],
    multiLab: (labIds, includeMetrics = false) => ['bookings', 'multi-lab', labIds.sort(), includeMetrics],
    
    // Atomic queries (for specific use cases)
    userAtomic: (address, clearCache = false) => ['bookings', 'user-atomic', address, clearCache],
    labAtomic: (labId, clearCache = false) => ['bookings', 'lab-atomic', labId, clearCache],
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

  // Invalidate bookings for a specific user (both composed and atomic)
  userBookings: (address) => [
    QUERY_KEYS.BOOKINGS.userComposed(address),
    QUERY_KEYS.BOOKINGS.userComposed(address, true), // With details
    QUERY_KEYS.BOOKINGS.userAtomic(address),
    QUERY_KEYS.BOOKINGS.userAtomic(address, true), // Clear cache
  ],

  // Invalidate bookings for a specific lab (both composed and atomic)
  labBookings: (labId) => [
    QUERY_KEYS.BOOKINGS.labComposed(labId, true), // With metrics (standard)
    QUERY_KEYS.BOOKINGS.labAtomic(labId),
    QUERY_KEYS.BOOKINGS.labAtomic(labId, true), // Clear cache
  ],

  // Invalidate multi-lab bookings that include a specific lab
  multiLabBookings: (labId) => {
    // This is more complex as we need to find all multi-lab queries that include this labId
    // For now, we'll invalidate all multi-lab queries (safer approach)
    // In the future, we could implement a more sophisticated pattern matching
    return [['bookings', 'multi-lab']]; // Partial key to match all multi-lab queries
  },

  // Invalidate lab data when a lab changes
  labData: (labId) => [
    QUERY_KEYS.LABS.data(labId),
    QUERY_KEYS.LABS.owner(labId),
    ...INVALIDATION_PATTERNS.labBookings(labId),
    ...INVALIDATION_PATTERNS.multiLabBookings(labId),
  ],

  // Invalidate user data
  userData: (address) => [
    QUERY_KEYS.USER.profile(address),
    QUERY_KEYS.USER.status(address),
    ...INVALIDATION_PATTERNS.userBookings(address),
  ],
};