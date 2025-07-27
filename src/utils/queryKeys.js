/**
 * Unified Query Keys for React Query
 * Centralized key management for consistent cache invalidation
 * and query organization across the application
 */

export const QUERY_KEYS = {
  // Bookings
  BOOKINGS: {
    all: ['bookings'],
    user: (address) => ['bookings', 'user', address],
    lab: (labId) => ['bookings', 'lab', labId],
    labWithDates: (labId, startDate, endDate) => ['bookings', 'lab', labId, startDate, endDate],
  },
  
  // Labs
  LABS: {
    all: ['labs'],
    detail: (id) => ['labs', id],
    byProvider: (providerId) => ['labs', 'provider', providerId],
  },
  
  // User
  USER: {
    profile: (address) => ['user', 'profile', address],
    status: (address) => ['user', 'status', address],
    bookings: (address) => ['user', 'bookings', address], // Alias of BOOKINGS.user
  },
  
  // SSO
  SSO_SESSION: ['sso', 'session'],
  
  // Provider
  PROVIDER: {
    profile: (id) => ['provider', 'profile', id],
    status: (id) => ['provider', 'status', id],
    labs: (id) => ['provider', 'labs', id], // Alias of LABS.byProvider
  },
  
  // Provider Status and Name
  PROVIDER_STATUS: ['provider', 'status'],
  PROVIDER_NAME: ['provider', 'name'],
};

// Helper to invalidate related query keys
export const INVALIDATION_PATTERNS = {
  // Invalidate all bookings when there are changes
  allBookings: () => [QUERY_KEYS.BOOKINGS.all],

  // Invalidate bookings for a specific user
  userBookings: (address) => [
    QUERY_KEYS.BOOKINGS.user(address),
    QUERY_KEYS.USER.bookings(address),
  ],

  // Invalidate bookings for a specific lab
  labBookings: (labId) => [
    QUERY_KEYS.BOOKINGS.lab(labId),
    QUERY_KEYS.BOOKINGS.labWithDates(labId),
  ],

  // Invalidate lab data when a lab changes
  labData: (labId) => [
    QUERY_KEYS.LABS.detail(labId),
    ...INVALIDATION_PATTERNS.labBookings(labId),
  ],

  // Invalidate user data
  userData: (address) => [
    QUERY_KEYS.USER.profile(address),
    QUERY_KEYS.USER.status(address),
    ...INVALIDATION_PATTERNS.userBookings(address),
  ],
};