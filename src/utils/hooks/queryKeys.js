/**
 * Unified Query Keys for React Query
 * Centralized key management for consistent cache invalidation
 * and query organization across the application
 * INTERNAL USE ONLY - Components should use hooks, not direct query keys
 */

// Booking query keys
export const bookingQueryKeys = {
  all: () => ['bookings'],
  byUser: (address) => ['bookings', 'user', address],
  byLab: (labId) => ['bookings', 'lab', labId],
  byReservationKey: (key) => ['bookings', 'reservation', key],
  userComposed: (address, includeDetails = false) => ['bookings', 'user-composed', address, includeDetails],
  labComposed: (labId, includeMetrics = true) => ['bookings', 'lab-composed', labId, includeMetrics],
  multiLab: (labIds, includeMetrics = false) => ['bookings', 'multi-lab', labIds.sort(), includeMetrics],
};

// Lab query keys
export const labQueryKeys = {
  all: () => ['labs'],
  list: () => ['labs', 'list'],
  byId: (labId) => ['labs', 'data', labId],
  owner: (labId) => ['labs', 'owner', labId],
  metadata: (uri) => ['labs', 'metadata', uri],
  decimals: () => ['labs', 'decimals'],
};

// User query keys
export const userQueryKeys = {
  all: () => ['users'],
  byAddress: (address) => ['user', 'profile', address],
  providerStatus: (address) => ['provider', 'status', address],
  ssoSession: () => ['auth', 'sso', 'session'],
};

// Provider query keys
export const providerQueryKeys = {
  all: () => ['providers'],
  list: () => ['providers', 'list'],
  byAddress: (address) => ['provider', 'profile', address],
  status: (identifier, isEmail = false) => ['provider', 'status', identifier, isEmail],
  name: (wallet) => ['provider', 'name', wallet],
};

// Reservation/Contract query keys
export const reservationQueryKeys = {
  safeBalance: () => ['reservations', 'getSafeBalance'],
  totalReservations: () => ['reservations', 'totalReservations'],
  labTokenAddress: () => ['reservations', 'getLabTokenAddress'],
  isTokenListed: (labId) => ['reservations', 'isTokenListed', labId],
  hasActiveBooking: (reservationKey, userAddress) => ['reservations', 'hasActiveBooking', reservationKey, userAddress],
  hasActiveBookingByToken: (tokenId, user) => ['reservations', 'hasActiveBookingByToken', tokenId, user],
  checkAvailable: (labId, start, end) => ['reservations', 'checkAvailable', labId, start, end],
};