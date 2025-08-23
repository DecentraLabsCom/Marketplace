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
  userReservationsComplete: (userAddress, limit) => ['bookings', 'userReservationsComplete', userAddress, limit],

  
  // Additional atomic query keys for all booking/reservation endpoints
  getReservationsOfToken: (labId) => ['bookings', 'reservationsOfToken', labId],
  getReservationOfTokenByIndex: (labId, index) => ['bookings', 'reservationOfToken', labId, index],
  reservationsOf: (userAddress) => ['bookings', 'reservationsOf', userAddress],
  reservationKeyByIndex: (index) => ['bookings', 'reservationKey', index],
  reservationKeyOfUserByIndex: (userAddress, index) => ['bookings', 'reservationKeyOfUser', userAddress, index],
  totalReservations: () => ['bookings', 'totalReservations'],
  userOfReservation: (reservationKey) => ['bookings', 'userOfReservation', reservationKey],
  checkAvailable: (labId, start, duration) => ['bookings', 'checkAvailable', labId, start, duration],
  hasActiveBooking: (userAddress) => ['bookings', 'hasActiveBooking', userAddress],
  hasActiveBookingByToken: (labId) => ['bookings', 'hasActiveBookingByToken', labId],
  isTokenListed: (labId) => ['bookings', 'isTokenListed', labId],
  labTokenAddress: () => ['bookings', 'labTokenAddress'],
  safeBalance: (userAddress) => ['bookings', 'safeBalance', userAddress],
};

// Lab query keys
export const labQueryKeys = {
  all: () => ['labs'],
  list: () => ['labs', 'list'],
  byId: (labId) => ['labs', 'data', labId],
  owner: (labId) => ['labs', 'owner', labId],
  metadata: (uri) => ['labs', 'metadata', uri],
  decimals: () => ['labs', 'decimals'],
  
  // Additional atomic query keys for all lab endpoints
  getAllLabs: () => ['labs', 'getAllLabs'],
  getLab: (labId) => ['labs', 'getLab', labId],
  balanceOf: (ownerAddress) => ['labs', 'balanceOf', ownerAddress],
  ownerOf: (labId) => ['labs', 'ownerOf', labId],
  tokenOfOwnerByIndex: (ownerAddress, index) => ['labs', 'tokenOfOwnerByIndex', ownerAddress, index],
  tokenURI: (labId) => ['labs', 'tokenURI', labId],
  isTokenListed: (labId) => ['labs', 'isTokenListed', labId],
  
  // Specialized query keys for composed hooks
  labsForMarket: () => ['labs', 'specialized', 'market'],
  labsForProvider: (ownerAddress) => ['labs', 'specialized', 'provider', ownerAddress],
  labsForReservation: () => ['labs', 'specialized', 'reservation'],
  labById: (labId) => ['labs', 'specialized', 'byId', labId],
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
  
  // Additional atomic query keys for all provider endpoints
  getLabProviders: () => ['providers', 'getLabProviders'],
  
  // Provider status specific query keys
  isLabProvider: (address) => ['providers', 'isLabProvider', address],
};

// Metadata query keys
export const metadataQueryKeys = {
  all: () => ['metadata'],
  byUri: (uri) => ['metadata', uri],
};

// Lab image query keys
export const labImageQueryKeys = {
  all: () => ['labImage'],
  byUrl: (imageUrl) => ['labImage', imageUrl],
};